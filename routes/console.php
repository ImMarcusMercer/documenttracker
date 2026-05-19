<?php

use App\Models\AuditLog;
use App\Models\Document;
use App\Models\ScheduledReportRun;
use App\Services\BackupService;
use App\Support\SiteSettings;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('docutracker:backup {type=manual : manual, database, uploads, or full_system} {--no-notify : Skip backup email notification}', function (BackupService $backupService) {
    $run = $backupService->run(null, (string) $this->argument('type'), null, ! $this->option('no-notify'));
    $this->line("Backup #{$run->id} [{$run->backup_type}] {$run->status}: {$run->message}");
    return $run->status === 'success' ? 0 : 1;
})->purpose('Run a DocTracker backup and record its integrity status.');


Artisan::command('docutracker:backup-verify {backupId}', function (BackupService $backupService) {
    $run = \App\Models\BackupRun::find((int) $this->argument('backupId'));
    if (!$run) {
        $this->error('Backup run not found.');
        return 1;
    }

    $result = $backupService->verifyBackupRun($run);
    $this->line($result['message']);
    $this->line('Checksum: '.($result['actual_checksum'] ?? 'n/a'));

    return $result['verified'] ? 0 : 1;
})->purpose('Verify a stored DocTracker backup ZIP by checksum and archive structure.');

Artisan::command('docutracker:audit-archive {days?}', function () {
    $configuredDays = SiteSettings::integer('audit', 'archive_after_days', 90);
    $days = max(1, (int) ($this->argument('days') ?: $configuredDays));
    $before = now()->subDays($days);
    $count = AuditLog::whereNull('archived_at')->where('created_at', '<', $before)->update(['archived_at' => now()]);
    $this->line("Archived {$count} audit logs older than {$days} days.");
})->purpose('Archive audit logs older than the selected retention window.');

Artisan::command('docutracker:monthly-report {--email=}', function () {
    $start = now()->subMonthNoOverflow()->startOfMonth();
    $end = now()->subMonthNoOverflow()->endOfMonth();

    $run = ScheduledReportRun::create([
        'report_type' => 'transaction_summary',
        'filters' => ['start' => $start->toDateString(), 'end' => $end->toDateString()],
        'status' => 'running',
        'message' => 'Scheduled monthly transaction report started.',
    ]);

    try {
        $reportDir = storage_path('app/reports');
        if (!is_dir($reportDir)) {
            mkdir($reportDir, 0775, true);
        }

        $fileName = 'docutracker-monthly-transaction-report-'.$start->format('Y-m').'.csv';
        $path = $reportDir.DIRECTORY_SEPARATOR.$fileName;
        $handle = fopen($path, 'w');
        fputcsv($handle, ['DocTracker Monthly Transaction Summary']);
        fputcsv($handle, ['Period', $start->toDateString().' to '.$end->toDateString()]);
        fputcsv($handle, ['Generated At', now()->toDateTimeString()]);
        fputcsv($handle, []);
        fputcsv($handle, ['Status', 'Total Documents']);

        Document::query()
            ->whereBetween('created_at', [$start, $end])
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->orderBy('status')
            ->get()
            ->each(fn ($row) => fputcsv($handle, [$row->status, $row->total]));

        fclose($handle);

        $run->update([
            'status' => 'success',
            'file_path' => 'reports/'.$fileName,
            'file_name' => $fileName,
            'message' => 'Scheduled monthly transaction report generated.',
            'completed_at' => now(),
        ]);

        $recipient = trim((string) $this->option('email')) ?: trim((string) env('REPORT_NOTIFICATION_EMAIL', '')) ?: trim((string) config('mail.from.address'));
        if ($recipient !== '' && ! str_contains($recipient, 'docutracker.local')) {
            Mail::raw('Attached is the scheduled DocTracker monthly transaction report.', function ($message) use ($recipient, $path, $fileName) {
                $message->to($recipient)->subject('DocTracker Monthly Transaction Report');
                $message->attach($path, ['as' => $fileName]);
            });
        }

        $this->line("Scheduled report generated: {$fileName}");
    } catch (Throwable $exception) {
        $run->update([
            'status' => 'failed',
            'message' => $exception->getMessage(),
            'completed_at' => now(),
        ]);
        $this->error($exception->getMessage());
        return 1;
    }

    return 0;
})->purpose('Generate the previous month transaction summary report and optionally email it.');

Schedule::command('docutracker:backup database')->weeklyOn(1, '02:00')->withoutOverlapping();
Schedule::command('docutracker:backup uploads')->sundays()->at('02:30')->withoutOverlapping();
Schedule::command('docutracker:backup full_system')->monthlyOn(1, '03:00')->withoutOverlapping();
Schedule::command('docutracker:audit-archive')->dailyAt('01:30')->withoutOverlapping();
Schedule::command('docutracker:monthly-report')->monthlyOn(1, '04:00')->withoutOverlapping();
