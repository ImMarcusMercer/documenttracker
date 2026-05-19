<?php

namespace App\Services;

use App\Models\BackupRun;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;
use ZipArchive;

class BackupService
{
    public function run(?User $user = null, string $backupType = 'manual', ?Request $request = null, bool $notify = true): BackupRun
    {
        $normalizedType = $this->normalizeType($backupType);

        $run = BackupRun::create([
            'created_by_id' => $user?->id,
            'backup_type' => $normalizedType,
            'status' => 'running',
            'message' => 'Backup started.',
        ]);

        $temporaryFiles = [];

        try {
            $backupDir = storage_path('app/backups');
            if (!is_dir($backupDir)) {
                mkdir($backupDir, 0775, true);
            }

            $fileName = 'docutracker-'.$normalizedType.'-backup-'.now()->format('Ymd-His').'.zip';
            $filePath = $backupDir.DIRECTORY_SEPARATOR.$fileName;

            $zip = new ZipArchive();
            if ($zip->open($filePath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                throw new \RuntimeException('Unable to create backup archive.');
            }

            $this->writeManifest($zip, $normalizedType);
            $destinationStatus = [];

            if (in_array($normalizedType, ['manual', 'database', 'full_system'], true)) {
                $dumpResult = $this->createDatabaseDumpFile($backupDir, $run->id);
                $temporaryFiles[] = $dumpResult['path'];
                $zip->addFile($dumpResult['path'], 'database/database-dump.sql');
                $zip->addFromString('database/database-dump-manifest.json', json_encode($dumpResult['manifest'], JSON_PRETTY_PRINT));
                $destinationStatus['database_dump'] = [
                    'enabled' => true,
                    'status' => $dumpResult['status'],
                    'method' => $dumpResult['method'],
                    'file' => 'database/database-dump.sql',
                    'message' => $dumpResult['message'],
                ];

                $snapshotPath = $backupDir.DIRECTORY_SEPARATOR.'database-snapshot-'.$run->id.'.json';
                file_put_contents($snapshotPath, json_encode($this->databaseSnapshot(), JSON_PRETTY_PRINT));
                $temporaryFiles[] = $snapshotPath;
                $zip->addFile($snapshotPath, 'database/database-snapshot.json');
            } else {
                $destinationStatus['database_dump'] = ['enabled' => false, 'status' => 'not_required'];
            }

            if (in_array($normalizedType, ['manual', 'uploads', 'full_system'], true)) {
                $this->addDirectoryToZip($zip, storage_path('app/public'), 'uploads');
            }

            if ($normalizedType === 'full_system') {
                $this->addProjectFiles($zip);
            }

            $zip->close();

            foreach ($temporaryFiles as $temporaryFile) {
                if (is_file($temporaryFile)) {
                    @unlink($temporaryFile);
                }
            }

            $checksum = hash_file('sha256', $filePath);
            $size = filesize($filePath) ?: 0;
            $verification = $this->verifyZipFile($filePath, $checksum, $normalizedType);
            $destinationStatus = array_merge($destinationStatus, $this->copyDestinations($filePath, $fileName, $normalizedType));

            $message = $verification['verified']
                ? 'Backup completed and verified with SHA-256 checksum and archive inspection.'
                : 'Backup completed but integrity verification failed: '.$verification['message'];

            $run->update([
                'status' => $verification['verified'] ? 'success' : 'failed',
                'file_path' => 'backups/'.$fileName,
                'file_name' => $fileName,
                'file_size' => $size,
                'checksum' => $checksum,
                'destination_status' => array_merge($destinationStatus, ['verification' => $verification]),
                'integrity_verified' => $verification['verified'],
                'message' => $message,
                'completed_at' => now(),
                'retention_expires_at' => now()->addDays($this->retentionDays()),
            ]);

            if ($notify) {
                $emailStatus = $this->sendNotification($run->fresh(), $filePath, null);
                $freshRun = $run->fresh();
                $freshRun->update([
                    'destination_status' => array_merge($freshRun->destination_status ?: [], ['email_notification' => $emailStatus]),
                ]);
            }

            $this->cleanupOldBackups();

            AuditLogger::record($user, 'transaction', 'backups', $normalizedType.'_backup', null, [], [
                'backup' => $fileName,
                'checksum' => $checksum,
                'destinations' => $run->fresh()->destination_status,
            ], $request, 'info', ucfirst(str_replace('_', ' ', $normalizedType)).' backup completed.');
        } catch (\Throwable $exception) {
            foreach ($temporaryFiles as $temporaryFile) {
                if (is_file($temporaryFile)) {
                    @unlink($temporaryFile);
                }
            }

            $destinationStatus = [];
            if ($notify) {
                $destinationStatus['email_notification'] = $this->sendNotification($run->fresh(), null, $exception);
            }

            $run->update([
                'status' => 'failed',
                'message' => $exception->getMessage(),
                'destination_status' => $destinationStatus,
                'completed_at' => now(),
                'retention_expires_at' => now()->addDays($this->retentionDays()),
            ]);

            AuditLogger::record($user, 'error', 'backups', $normalizedType.'_backup_failed', null, [], [
                'error' => $exception->getMessage(),
            ], $request, 'critical', ucfirst(str_replace('_', ' ', $normalizedType)).' backup failed.');
        }

        return $run->fresh();
    }

    public function verifyBackupRun(BackupRun $run): array
    {
        $localPath = $run->file_path ? storage_path('app/'.$run->file_path) : null;

        if (!$localPath || !is_file($localPath)) {
            $localPath = $this->retrieveFromCloud($run);
        }

        if (!$localPath || !is_file($localPath)) {
            $result = [
                'verified' => false,
                'message' => 'Backup file is missing locally and could not be retrieved from configured cloud storage.',
                'checked_at' => now()->toISOString(),
            ];
            $run->update([
                'integrity_verified' => false,
                'destination_status' => array_merge($run->destination_status ?: [], ['verification' => $result]),
                'message' => $result['message'],
            ]);

            return $result;
        }

        $result = $this->verifyZipFile($localPath, $run->checksum, $run->backup_type);
        $run->update([
            'integrity_verified' => $result['verified'],
            'destination_status' => array_merge($run->destination_status ?: [], ['verification' => $result]),
            'message' => $result['message'],
        ]);

        return $result;
    }

    public function verifyUploadedBackupFile(UploadedFile $file, ?string $expectedChecksum = null): array
    {
        $path = $file->getRealPath();
        if (!$path || !is_file($path)) {
            return [
                'verified' => false,
                'message' => 'Uploaded backup file could not be read.',
                'checked_at' => now()->toISOString(),
            ];
        }

        return $this->verifyZipFile($path, $expectedChecksum ?: null, null);
    }

    public function retrieveFromCloud(BackupRun $run): ?string
    {
        $status = $run->destination_status ?: [];
        $cloud = $status['cloud_storage'] ?? $status['cloud'] ?? null;
        if (!$cloud || ($cloud['status'] ?? null) !== 'stored') {
            return null;
        }

        $disk = $cloud['disk'] ?? $this->cloudDiskName();
        $cloudPath = $cloud['path'] ?? null;
        if (!$disk || !$cloudPath) {
            return null;
        }

        try {
            if (!Storage::disk($disk)->exists($cloudPath)) {
                return null;
            }

            $localDir = storage_path('app/backups');
            if (!is_dir($localDir)) {
                mkdir($localDir, 0775, true);
            }

            $localPath = $localDir.DIRECTORY_SEPARATOR.($run->file_name ?: basename($cloudPath));
            file_put_contents($localPath, Storage::disk($disk)->get($cloudPath));

            $run->update([
                'file_path' => 'backups/'.basename($localPath),
                'file_name' => basename($localPath),
            ]);

            return $localPath;
        } catch (\Throwable) {
            return null;
        }
    }

    private function normalizeType(string $backupType): string
    {
        $type = strtolower(trim($backupType));

        return in_array($type, ['manual', 'database', 'uploads', 'full_system'], true) ? $type : 'manual';
    }

    private function writeManifest(ZipArchive $zip, string $backupType): void
    {
        $manifest = [
            'application' => 'DocTracker',
            'backup_type' => $backupType,
            'generated_at' => now()->toISOString(),
            'database_connection' => config('database.default'),
            'retention_days' => $this->retentionDays(),
            'environment' => app()->environment(),
            'contains_database_dump' => in_array($backupType, ['manual', 'database', 'full_system'], true),
            'contains_uploads' => in_array($backupType, ['manual', 'uploads', 'full_system'], true),
            'contains_source' => $backupType === 'full_system',
        ];

        $zip->addFromString('manifest.json', json_encode($manifest, JSON_PRETTY_PRINT));
    }

    private function createDatabaseDumpFile(string $backupDir, int $runId): array
    {
        $dumpPath = $backupDir.DIRECTORY_SEPARATOR.'database-dump-'.$runId.'.sql';
        $method = 'fallback_sql_export';
        $status = 'generated';
        $message = 'Generated fallback SQL data export. Use this after running migrations when pg_dump is unavailable.';
        $pgDumpError = null;

        if (config('database.default') === 'pgsql') {
            $result = $this->createPgDump($dumpPath);
            if ($result['success']) {
                return [
                    'path' => $dumpPath,
                    'method' => 'pg_dump',
                    'status' => 'generated',
                    'message' => 'Generated full PostgreSQL dump using pg_dump.',
                    'manifest' => [
                        'method' => 'pg_dump',
                        'generated_at' => now()->toISOString(),
                        'database' => config('database.connections.pgsql.database'),
                        'host' => config('database.connections.pgsql.host'),
                        'port' => config('database.connections.pgsql.port'),
                        'can_restore_with' => 'psql -U <user> -d <database> -f database-dump.sql',
                    ],
                ];
            }

            $pgDumpError = $result['message'];
        }

        $this->writeFallbackSqlExport($dumpPath, $pgDumpError);

        return [
            'path' => $dumpPath,
            'method' => $method,
            'status' => $status,
            'message' => $message.($pgDumpError ? ' pg_dump error: '.$pgDumpError : ''),
            'manifest' => [
                'method' => $method,
                'generated_at' => now()->toISOString(),
                'database' => config('database.connections.'.config('database.default').'.database'),
                'pg_dump_error' => $pgDumpError,
                'restore_note' => 'This fallback contains data INSERT statements intended for use after migrations when pg_dump is not available.',
            ],
        ];
    }

    private function createPgDump(string $dumpPath): array
    {
        $connection = config('database.connections.pgsql', []);
        $binary = trim((string) env('BACKUP_PG_DUMP_BINARY', env('PG_DUMP_BINARY', 'pg_dump'))) ?: 'pg_dump';
        $database = (string) ($connection['database'] ?? '');
        $username = (string) ($connection['username'] ?? '');
        $host = (string) ($connection['host'] ?? '127.0.0.1');
        $port = (string) ($connection['port'] ?? '5432');
        $password = (string) ($connection['password'] ?? '');

        if ($database === '') {
            return ['success' => false, 'message' => 'PostgreSQL database name is empty.'];
        }

        try {
            $command = [
                $binary,
                '--host='.$host,
                '--port='.$port,
                '--username='.$username,
                '--dbname='.$database,
                '--format=p',
                '--clean',
                '--if-exists',
                '--no-owner',
                '--no-privileges',
                '--file='.$dumpPath,
            ];

            $process = new Process($command, base_path(), ['PGPASSWORD' => $password], null, (int) env('BACKUP_PROCESS_TIMEOUT_SECONDS', 300));
            $process->run();

            if (!$process->isSuccessful()) {
                return ['success' => false, 'message' => trim($process->getErrorOutput() ?: $process->getOutput() ?: 'pg_dump failed.')];
            }

            if (!is_file($dumpPath) || filesize($dumpPath) === 0) {
                return ['success' => false, 'message' => 'pg_dump completed but produced an empty dump file.'];
            }

            return ['success' => true, 'message' => 'pg_dump completed.'];
        } catch (\Throwable $exception) {
            return ['success' => false, 'message' => $exception->getMessage()];
        }
    }

    private function writeFallbackSqlExport(string $dumpPath, ?string $pgDumpError = null): void
    {
        $handle = fopen($dumpPath, 'w');
        if (!$handle) {
            throw new \RuntimeException('Unable to create fallback SQL dump file.');
        }

        fwrite($handle, "-- DocTracker fallback SQL data export\n");
        fwrite($handle, "-- Generated at: ".now()->toISOString()."\n");
        fwrite($handle, "-- Restore note: run Laravel migrations first, then execute this file to reload data.\n");
        if ($pgDumpError) {
            fwrite($handle, "-- pg_dump was unavailable or failed: ".str_replace(["\r", "\n"], ' ', $pgDumpError)."\n");
        }
        fwrite($handle, "SET session_replication_role = replica;\n\n");

        foreach ($this->databaseTables() as $table) {
            fwrite($handle, 'TRUNCATE TABLE '.$this->quoteIdentifier($table)." RESTART IDENTITY CASCADE;\n");
        }
        fwrite($handle, "\n");

        foreach ($this->databaseTables() as $table) {
            try {
                $rows = DB::table($table)->get();
                if ($rows->isEmpty()) {
                    continue;
                }

                $columns = array_keys((array) $rows->first());
                $columnSql = implode(', ', array_map(fn ($column) => $this->quoteIdentifier($column), $columns));
                foreach ($rows as $row) {
                    $values = array_map(fn ($column) => $this->quoteSqlValue($row->{$column} ?? null), $columns);
                    fwrite($handle, 'INSERT INTO '.$this->quoteIdentifier($table).' ('.$columnSql.') VALUES ('.implode(', ', $values).");\n");
                }
                fwrite($handle, "\n");
            } catch (\Throwable $exception) {
                fwrite($handle, '-- Failed to export table '.$table.': '.str_replace(["\r", "\n"], ' ', $exception->getMessage())."\n\n");
            }
        }

        fwrite($handle, "SET session_replication_role = DEFAULT;\n");
        fclose($handle);
    }

    private function quoteIdentifier(string $identifier): string
    {
        return '"'.str_replace('"', '""', $identifier).'"';
    }

    private function quoteSqlValue(mixed $value): string
    {
        if ($value === null) {
            return 'NULL';
        }

        if (is_bool($value)) {
            return $value ? 'TRUE' : 'FALSE';
        }

        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }

        if (is_array($value) || is_object($value)) {
            $value = json_encode($value);
        }

        return "'".str_replace("'", "''", (string) $value)."'";
    }

    private function databaseSnapshot(): array
    {
        $tables = $this->databaseTables();
        $snapshot = [];

        foreach ($tables as $table) {
            try {
                $snapshot[$table] = DB::table($table)->limit(10000)->get()->toArray();
            } catch (\Throwable) {
                $snapshot[$table] = [];
            }
        }

        return [
            'generated_at' => now()->toISOString(),
            'connection' => config('database.default'),
            'tables' => $snapshot,
        ];
    }

    private function databaseTables(): array
    {
        try {
            if (config('database.default') === 'pgsql') {
                return collect(DB::select("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"))
                    ->pluck('table_name')
                    ->filter()
                    ->values()
                    ->all();
            }
        } catch (\Throwable) {
            // Fall through to conservative fallback list.
        }

        return ['users', 'roles', 'permissions', 'role_permissions', 'documents', 'document_actions', 'notifications', 'audit_logs', 'site_settings', 'backup_runs'];
    }

    private function addProjectFiles(ZipArchive $zip): void
    {
        foreach (['app', 'bootstrap', 'config', 'database', 'resources', 'routes', 'public/build'] as $directory) {
            $this->addDirectoryToZip($zip, base_path($directory), 'source/'.$directory);
        }

        foreach (['artisan', 'composer.json', 'composer.lock', 'package.json', 'package-lock.json', 'vite.config.js', 'README.md', '.env.example'] as $file) {
            $path = base_path($file);
            if (is_file($path)) {
                $zip->addFile($path, 'source/'.$file);
            }
        }
    }

    private function addDirectoryToZip(ZipArchive $zip, string $directory, string $prefix): void
    {
        if (!is_dir($directory)) {
            return;
        }

        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($directory, \FilesystemIterator::SKIP_DOTS)) as $file) {
            if ($file->isFile()) {
                $relativePath = $prefix.'/'.ltrim(str_replace($directory, '', $file->getPathname()), DIRECTORY_SEPARATOR);
                $zip->addFile($file->getPathname(), str_replace(DIRECTORY_SEPARATOR, '/', $relativePath));
            }
        }
    }

    private function copyDestinations(string $filePath, string $fileName, string $backupType): array
    {
        $destinations = [
            'local' => [
                'enabled' => true,
                'status' => file_exists($filePath) ? 'stored' : 'missing',
                'path' => 'storage/app/backups/'.$fileName,
            ],
        ];

        $cloudDisk = $this->cloudDiskName();
        if ($cloudDisk !== '') {
            try {
                $cloudPath = trim((string) env('SUPABASE_BACKUP_PREFIX', 'docutracker-backups'), '/').'/'.$fileName;
                Storage::disk($cloudDisk)->put($cloudPath, fopen($filePath, 'r'));
                $destinations['cloud_storage'] = [
                    'enabled' => true,
                    'status' => 'stored',
                    'disk' => $cloudDisk,
                    'provider' => $cloudDisk === 'supabase' ? 'supabase' : 'laravel_disk',
                    'path' => $cloudPath,
                ];
            } catch (\Throwable $exception) {
                $destinations['cloud_storage'] = ['enabled' => true, 'status' => 'failed', 'disk' => $cloudDisk, 'message' => $exception->getMessage()];
            }
        } else {
            $destinations['cloud_storage'] = ['enabled' => false, 'status' => 'not_configured'];
        }

        $externalPath = trim((string) env('BACKUP_EXTERNAL_PATH', ''));
        if ($externalPath !== '' && in_array($backupType, ['uploads', 'full_system', 'manual'], true)) {
            try {
                if (!is_dir($externalPath)) {
                    mkdir($externalPath, 0775, true);
                }
                copy($filePath, rtrim($externalPath, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR.$fileName);
                $destinations['external_drive'] = ['enabled' => true, 'status' => 'stored', 'path' => rtrim($externalPath, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR.$fileName];
            } catch (\Throwable $exception) {
                $destinations['external_drive'] = ['enabled' => true, 'status' => 'failed', 'message' => $exception->getMessage()];
            }
        } else {
            $destinations['external_drive'] = ['enabled' => false, 'status' => 'not_configured'];
        }

        return $destinations;
    }

    private function cloudDiskName(): string
    {
        $configured = trim((string) env('BACKUP_CLOUD_DISK', ''));
        if ($configured !== '') {
            return $configured;
        }

        return filter_var(env('SUPABASE_BACKUP_ENABLED', false), FILTER_VALIDATE_BOOLEAN) ? 'supabase' : '';
    }

    private function sendNotification(BackupRun $run, ?string $filePath, ?\Throwable $exception): array
    {
        $recipient = trim((string) env('BACKUP_NOTIFICATION_EMAIL', '')) ?: trim((string) config('mail.from.address'));
        if ($recipient === '' || str_contains($recipient, 'docutracker.local')) {
            return ['enabled' => false, 'status' => 'not_configured', 'message' => 'Set BACKUP_NOTIFICATION_EMAIL or a real MAIL_FROM_ADDRESS to enable backup emails.'];
        }

        try {
            $subject = 'DocTracker backup '.$run->status.': '.$run->backup_type;
            $body = "Backup type: {$run->backup_type}\nStatus: {$run->status}\nMessage: {$run->message}\nCompleted: ".optional($run->completed_at)->toDateTimeString()."\nChecksum: ".($run->checksum ?: 'n/a')."\nRetention expires: ".optional($run->retention_expires_at)->toDateTimeString();
            if ($exception) {
                $body .= "\nError: ".$exception->getMessage();
            }

            $attached = false;
            $attachmentSkippedReason = null;
            Mail::raw($body, function ($message) use ($recipient, $subject, $filePath, $run, &$attached, &$attachmentSkippedReason) {
                $message->to($recipient)->subject($subject);
                $limitBytes = (int) env('BACKUP_EMAIL_ATTACH_LIMIT_MB', 20) * 1024 * 1024;
                if ($filePath && is_file($filePath)) {
                    if (filesize($filePath) <= $limitBytes) {
                        $message->attach($filePath, ['as' => $run->file_name ?: basename($filePath)]);
                        $attached = true;
                    } else {
                        $attachmentSkippedReason = 'Backup file exceeded BACKUP_EMAIL_ATTACH_LIMIT_MB.';
                    }
                }
            });

            return [
                'enabled' => true,
                'status' => 'sent',
                'recipient' => $recipient,
                'attachment' => $attached ? 'attached' : 'not_attached',
                'message' => $attachmentSkippedReason ?: 'Backup email notification sent.',
            ];
        } catch (\Throwable $mailException) {
            return ['enabled' => true, 'status' => 'failed', 'recipient' => $recipient, 'message' => $mailException->getMessage()];
        }
    }

    private function verifyZipFile(string $filePath, ?string $expectedChecksum = null, ?string $expectedType = null): array
    {
        $actualChecksum = is_file($filePath) ? hash_file('sha256', $filePath) : null;
        $checksumMatches = $expectedChecksum ? hash_equals(strtolower($expectedChecksum), strtolower((string) $actualChecksum)) : true;

        $result = [
            'verified' => false,
            'checked_at' => now()->toISOString(),
            'file_name' => basename($filePath),
            'file_size' => is_file($filePath) ? filesize($filePath) : 0,
            'expected_checksum' => $expectedChecksum,
            'actual_checksum' => $actualChecksum,
            'checksum_matches' => $checksumMatches,
            'manifest_found' => false,
            'database_dump_found' => false,
            'uploads_found' => false,
            'source_found' => false,
            'message' => 'Integrity check not completed.',
        ];

        if (!is_file($filePath)) {
            $result['message'] = 'Backup file does not exist.';
            return $result;
        }

        if (!$checksumMatches) {
            $result['message'] = 'SHA-256 checksum does not match expected value.';
            return $result;
        }

        $zip = new ZipArchive();
        if ($zip->open($filePath) !== true) {
            $result['message'] = 'Backup file is not a readable ZIP archive.';
            return $result;
        }

        $manifestIndex = $zip->locateName('manifest.json');
        $result['manifest_found'] = $manifestIndex !== false;
        $manifest = [];
        if ($manifestIndex !== false) {
            $manifest = json_decode((string) $zip->getFromIndex($manifestIndex), true) ?: [];
            $result['manifest'] = $manifest;
        }

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if ($name === 'database/database-dump.sql') {
                $result['database_dump_found'] = true;
            }
            if (str_starts_with($name, 'uploads/')) {
                $result['uploads_found'] = true;
            }
            if (str_starts_with($name, 'source/')) {
                $result['source_found'] = true;
            }
        }

        $zip->close();

        $type = $expectedType ?: ($manifest['backup_type'] ?? null);
        $needsDatabase = in_array($type, ['manual', 'database', 'full_system'], true);
        $needsUploads = in_array($type, ['manual', 'uploads', 'full_system'], true);
        $needsSource = $type === 'full_system';

        if (!$result['manifest_found']) {
            $result['message'] = 'manifest.json is missing.';
            return $result;
        }

        if ($needsDatabase && !$result['database_dump_found']) {
            $result['message'] = 'Database backup is missing database/database-dump.sql.';
            return $result;
        }

        if ($needsUploads && !$result['uploads_found']) {
            $result['message'] = 'Upload backup section is empty or missing. This may be acceptable only when no uploaded files exist.';
        }

        if ($needsSource && !$result['source_found']) {
            $result['message'] = 'Full-system backup is missing source files.';
            return $result;
        }

        $result['verified'] = true;
        $result['message'] = 'Backup archive opened successfully, checksum matched, manifest found, and required sections were inspected.';

        return $result;
    }

    private function cleanupOldBackups(): void
    {
        $oldRuns = BackupRun::where('created_at', '<', now()->subDays($this->retentionDays()))->get();
        foreach ($oldRuns as $run) {
            if ($run->file_path) {
                @unlink(storage_path('app/'.$run->file_path));
            }
            $run->delete();
        }
    }

    private function retentionDays(): int
    {
        try {
            $setting = SiteSetting::where('group_name', 'backup')->where('key_name', 'retention_days')->first();
            $value = $setting?->value['value'] ?? $setting?->value ?? 30;
            return max(1, (int) $value);
        } catch (\Throwable) {
            return 30;
        }
    }
}
