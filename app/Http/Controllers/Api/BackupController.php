<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BackupRun;
use App\Models\SiteSetting;
use App\Services\BackupService;
use Illuminate\Http\Request;

class BackupController extends Controller
{
    public function index(Request $request)
    {
        $this->ensureBackupManager($request);

        return response()->json([
            'data' => BackupRun::latest()->limit(75)->get()->map(fn (BackupRun $run) => $this->serialize($run)),
            'meta' => [
                'retention_days' => $this->retentionDays(),
                'retention_policy' => $this->retentionDays().' days, configurable in Site Settings',
                'schedule' => $this->backupSchedule(),
                'pg_dump_binary' => env('BACKUP_PG_DUMP_BINARY', env('PG_DUMP_BINARY', 'pg_dump')),
                'cloud_disk' => env('BACKUP_CLOUD_DISK') ?: (filter_var(env('SUPABASE_BACKUP_ENABLED', false), FILTER_VALIDATE_BOOLEAN) ? 'supabase' : null),
                'supabase_enabled' => filter_var(env('SUPABASE_BACKUP_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
                'email_notifications' => trim((string) env('BACKUP_NOTIFICATION_EMAIL', '')) !== '' || ! str_contains((string) config('mail.from.address'), 'docutracker.local'),
                'email_attach_limit_mb' => (int) env('BACKUP_EMAIL_ATTACH_LIMIT_MB', 20),
            ],
        ]);
    }

    public function store(Request $request, BackupService $backupService)
    {
        $this->ensureBackupManager($request);

        $data = $request->validate([
            'backup_type' => ['nullable', 'string', 'in:manual,database,uploads,full_system'],
        ]);

        $run = $backupService->run($request->user(), $data['backup_type'] ?? 'manual', $request, true);

        return response()->json(['data' => $this->serialize($run)], $run->status === 'success' ? 201 : 500);
    }

    public function verify(Request $request, BackupRun $backup, BackupService $backupService)
    {
        $this->ensureBackupManager($request);

        $result = $backupService->verifyBackupRun($backup);

        return response()->json([
            'data' => [
                'backup' => $this->serialize($backup->fresh()),
                'verification' => $result,
            ],
        ], $result['verified'] ? 200 : 422);
    }

    public function verifyUploaded(Request $request, BackupService $backupService)
    {
        $this->ensureBackupManager($request);

        $data = $request->validate([
            'file' => ['required', 'file', 'max:102400'],
            'expected_checksum' => ['nullable', 'string', 'max:128'],
        ]);

        $result = $backupService->verifyUploadedBackupFile($data['file'], $data['expected_checksum'] ?? null);

        return response()->json(['data' => $result], $result['verified'] ? 200 : 422);
    }

    public function download(Request $request, BackupRun $backup, BackupService $backupService)
    {
        $this->ensureBackupManager($request);

        $path = $backup->file_path ? storage_path('app/'.$backup->file_path) : null;
        if (!$path || !is_file($path)) {
            $path = $backupService->retrieveFromCloud($backup);
        }

        abort_unless($path && is_file($path), 404, 'Backup file was not found locally or in configured cloud storage.');

        return response()->download($path, $backup->file_name ?: basename($path));
    }

    private function serialize(BackupRun $run): array
    {
        $destinationStatus = $run->destination_status ?: [];

        return [
            'id' => (string) $run->id,
            'backup_type' => $run->backup_type,
            'status' => $run->status,
            'file_name' => $run->file_name,
            'file_size' => $run->file_size,
            'file_size_human' => $this->humanFileSize((int) $run->file_size),
            'checksum' => $run->checksum,
            'destination_status' => $destinationStatus,
            'database_dump' => $destinationStatus['database_dump'] ?? null,
            'verification' => $destinationStatus['verification'] ?? null,
            'email_notification' => $destinationStatus['email_notification'] ?? null,
            'integrity_verified' => (bool) $run->integrity_verified,
            'message' => $run->message,
            'completed_at' => optional($run->completed_at)?->toISOString(),
            'created_date' => optional($run->created_at)?->toISOString(),
            'retention_expires_at' => optional($run->retention_expires_at)?->toISOString(),
            'retention_policy' => $this->retentionDays().' days, configurable in Site Settings',
        ];
    }

    private function retentionDays(): int
    {
        $setting = SiteSetting::where('group_name', 'backup')->where('key_name', 'retention_days')->first();
        $raw = $setting?->value;
        $value = is_array($raw) && array_key_exists('value', $raw) ? $raw['value'] : $raw;

        return max(1, (int) ($value ?: 30));
    }

    private function backupSchedule(): array
    {
        $setting = SiteSetting::where('group_name', 'backup')->where('key_name', 'schedule')->first();
        $value = $setting?->value;

        return is_array($value) ? $value : [
            'database' => 'weekly monday 02:00',
            'uploads' => 'weekly sunday 02:30',
            'full_system' => 'monthly first day 03:00',
        ];
    }

    private function humanFileSize(int $bytes): string
    {
        if ($bytes <= 0) {
            return '0 B';
        }

        $units = ['B', 'KB', 'MB', 'GB'];
        $index = (int) floor(log($bytes, 1024));
        $index = min($index, count($units) - 1);

        return round($bytes / (1024 ** $index), 2).' '.$units[$index];
    }

    private function ensureBackupManager(Request $request): void
    {
        $role = strtoupper((string) $request->user()->role);
        abort_unless(in_array($role, ['ADMIN', 'DEVELOPER'], true), 403);
    }
}
