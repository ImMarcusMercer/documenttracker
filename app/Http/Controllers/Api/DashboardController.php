<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Document;
use App\Models\DocumentAction;
use App\Models\Notification;
use App\Models\User;
use App\Support\NotificationDispatcher;
use App\Support\SiteSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function stats(Request $request)
    {
        $startedAt = microtime(true);
        $user = $request->user();
        $range = $request->query('range', 'month');
        [$start, $end] = $this->rangeBounds($range, $request->query('start'), $request->query('end'));

        $cacheKey = sprintf(
            'docutracker.dashboard.%s.%s.%s.%s',
            $user->id,
            $range,
            $start->toDateString(),
            $end->toDateString()
        );

        $payload = Cache::remember($cacheKey, now()->addSeconds(30), function () use ($request, $user, $start, $end, $range) {
            $storageMeta = $this->storageMeta();

            if (
                $storageMeta['storage_usage_percent'] >= $storageMeta['storage_warning_threshold_percent']
                && Cache::add('docutracker.storage_warning_sent', true, now()->addHours(6))
            ) {
                NotificationDispatcher::notifyAdmins([
                    'type' => 'warning',
                    'severity' => 'warning',
                    'title' => 'Storage capacity warning',
                    'message' => "Storage usage reached {$storageMeta['storage_usage_percent']}% of the configured {$storageMeta['storage_capacity_limit_mb']} MB limit. Review uploaded files and backup retention.",
                    'metadata' => [
                        'storage_usage_bytes' => $storageMeta['storage_usage_bytes'],
                        'storage_capacity_limit_mb' => $storageMeta['storage_capacity_limit_mb'],
                        'storage_warning_threshold_percent' => $storageMeta['storage_warning_threshold_percent'],
                    ],
                ], $request);
            }

            $documentSummary = $this->documentSummary();
            $dailyActivity = $this->dailyActivity($start, $end);
            $recentActivities = $this->recentActivities($start, $end);
            $latestAudit = $this->latestAudit();
            $criticalErrors = AuditLog::where('severity', 'critical')->whereBetween('created_at', [$start, $end])->count();
            $warningEvents = AuditLog::where('severity', 'warning')->whereBetween('created_at', [$start, $end])->count();

            return [
                'range' => ['start' => $start->toDateString(), 'end' => $end->toDateString(), 'label' => $range],
                'generated_at' => now()->toISOString(),
                'user_statistics' => [
                    'total_users' => User::count(),
                    'active_accounts' => User::where(function ($query) {
                        $query->where('status', 'active')->orWhere('is_active', true);
                    })->count(),
                    'active_now' => User::where('last_seen_at', '>=', now()->subMinutes(15))->count(),
                    'new_registrations' => User::whereBetween('created_at', [$start, $end])->count(),
                ],
                'document_statistics' => [
                    'total_documents' => $documentSummary['total_documents'],
                    'deleted_documents' => $documentSummary['deleted_documents'],
                    'pending_documents' => $documentSummary['pending_documents'],
                    'released_documents' => $documentSummary['released_documents'],
                ],
                'transaction_overview' => $dailyActivity,
                'status_counts' => $documentSummary['status_counts'],
                'classification_counts' => $documentSummary['classification_counts'],
                'system_health' => [
                    'server_uptime' => 'Available while PHP process is running',
                    'database_size' => $storageMeta['database_size'],
                    'storage_usage_bytes' => $storageMeta['storage_usage_bytes'],
                    'storage_usage_human' => $storageMeta['storage_usage_human'],
                    'storage_capacity_limit_mb' => $storageMeta['storage_capacity_limit_mb'],
                    'storage_warning_threshold_percent' => $storageMeta['storage_warning_threshold_percent'],
                    'storage_usage_percent' => $storageMeta['storage_usage_percent'],
                    'storage_warning_active' => $storageMeta['storage_usage_percent'] >= $storageMeta['storage_warning_threshold_percent'],
                    'queue_connection' => config('queue.default'),
                    'cache_store' => config('cache.default'),
                ],
                'quick_actions' => [
                    ['label' => 'New Document', 'path' => '/documents/new', 'permission' => 'documents.create'],
                    ['label' => 'All Documents', 'path' => '/documents', 'permission' => 'documents.read'],
                    ['label' => 'Notifications', 'path' => '/notifications', 'permission' => 'notifications.read'],
                    ['label' => 'Admin Console', 'path' => '/admin', 'permission' => 'admin.manage'],
                ],
                'performance_metrics' => [
                    'critical_error_count' => $criticalErrors,
                    'warning_event_count' => $warningEvents,
                    'unread_notifications' => Notification::where('recipient_user_id', $user->id)->where('is_read', false)->count(),
                    'page_load_note' => 'Dashboard and layout widgets refresh through AJAX without a full page reload.',
                ],
                'recent_activities' => $recentActivities,
                'latest_audit_events' => $latestAudit,
            ];
        });

        $payload['performance_metrics']['api_response_ms'] = round((microtime(true) - $startedAt) * 1000, 2);

        return response()->json(['data' => $payload]);
    }

    private function rangeBounds(string $range, ?string $start, ?string $end): array
    {
        if ($range === 'custom' && $start && $end) {
            return [Carbon::parse($start)->startOfDay(), Carbon::parse($end)->endOfDay()];
        }

        return match ($range) {
            'today' => [now()->startOfDay(), now()->endOfDay()],
            'week' => [now()->startOfWeek(), now()->endOfWeek()],
            default => [now()->startOfMonth(), now()->endOfMonth()],
        };
    }

    private function documentSummary(): array
    {
        $statusCounts = Document::query()
            ->selectRaw('COALESCE(status, ?) as status, COUNT(*) as total', ['Unknown'])
            ->whereNull('deleted_at')
            ->groupBy('status')
            ->pluck('total', 'status')
            ->map(fn ($count) => (int) $count)
            ->all();

        $classificationCounts = Document::query()
            ->selectRaw('COALESCE(classification, ?) as classification, COUNT(*) as total', ['Unclassified'])
            ->whereNull('deleted_at')
            ->groupBy('classification')
            ->pluck('total', 'classification')
            ->map(fn ($count) => (int) $count)
            ->all();

        $totals = Document::query()
            ->withTrashed()
            ->selectRaw('COUNT(*) as total_documents')
            ->selectRaw('SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deleted_documents')
            ->selectRaw("SUM(CASE WHEN deleted_at IS NULL AND status = 'Pending Receipt' THEN 1 ELSE 0 END) as pending_documents")
            ->selectRaw("SUM(CASE WHEN deleted_at IS NULL AND status = 'Released' THEN 1 ELSE 0 END) as released_documents")
            ->first();

        return [
            'total_documents' => max(0, (int) (($totals->total_documents ?? 0) - ($totals->deleted_documents ?? 0))),
            'deleted_documents' => (int) ($totals->deleted_documents ?? 0),
            'pending_documents' => (int) ($totals->pending_documents ?? 0),
            'released_documents' => (int) ($totals->released_documents ?? 0),
            'status_counts' => $statusCounts,
            'classification_counts' => $classificationCounts,
        ];
    }

    private function dailyActivity(Carbon $start, Carbon $end): array
    {
        $documentCounts = Document::query()
            ->selectRaw('DATE(created_at) as day, COUNT(*) as total')
            ->whereBetween('created_at', [$start, $end])
            ->groupByRaw('DATE(created_at)')
            ->pluck('total', 'day');

        $actionCounts = DocumentAction::query()
            ->selectRaw('DATE(created_at) as day, COUNT(*) as total')
            ->whereBetween('created_at', [$start, $end])
            ->groupByRaw('DATE(created_at)')
            ->pluck('total', 'day');

        $auditCounts = AuditLog::query()
            ->selectRaw('DATE(created_at) as day, COUNT(*) as total')
            ->whereBetween('created_at', [$start, $end])
            ->groupByRaw('DATE(created_at)')
            ->pluck('total', 'day');

        $rows = [];
        $cursor = $start->copy()->startOfDay();

        while ($cursor <= $end) {
            $key = $cursor->toDateString();
            $rows[] = [
                'date' => $key,
                'created' => (int) ($documentCounts[$key] ?? 0),
                'actions' => (int) ($actionCounts[$key] ?? 0),
                'audit_events' => (int) ($auditCounts[$key] ?? 0),
            ];
            $cursor->addDay();
        }

        return $rows;
    }

    private function recentActivities(Carbon $start, Carbon $end): array
    {
        return DocumentAction::query()
            ->whereBetween('created_at', [$start, $end])
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn (DocumentAction $action) => [
                'id' => (string) $action->id,
                'document_id' => (string) $action->document_id,
                'action_type' => $action->action_type,
                'from_user_name' => $action->from_user_name,
                'to_user_name' => $action->to_user_name,
                'created_date' => optional($action->created_at)?->toISOString(),
            ])
            ->values()
            ->all();
    }

    private function latestAudit(): array
    {
        return AuditLog::query()
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn (AuditLog $log) => [
                'id' => (string) $log->id,
                'type' => $log->event_type,
                'module' => $log->module_name,
                'action' => $log->action_name,
                'severity' => $log->severity,
                'message' => $log->message,
                'created_date' => optional($log->created_at)?->toISOString(),
            ])
            ->values()
            ->all();
    }

    private function storageMeta(): array
    {
        $cached = Cache::remember('docutracker.dashboard.storage_meta', now()->addMinutes(5), function () {
            $storageBytes = $this->directorySize(storage_path('app/public'));
            $storageLimitMb = max(1, SiteSettings::integer('system', 'storage_capacity_limit_mb', (int) env('STORAGE_CAPACITY_LIMIT_MB', 1024)));
            $storageWarningThreshold = min(100, max(1, SiteSettings::integer('system', 'storage_warning_threshold_percent', (int) env('STORAGE_WARNING_THRESHOLD_PERCENT', 85))));
            $storageLimitBytes = $storageLimitMb * 1024 * 1024;
            $storageUsagePercent = round(min(999, ($storageBytes / max(1, $storageLimitBytes)) * 100), 2);

            return [
                'storage_usage_bytes' => $storageBytes,
                'storage_usage_human' => $this->humanBytes($storageBytes),
                'storage_capacity_limit_mb' => $storageLimitMb,
                'storage_warning_threshold_percent' => $storageWarningThreshold,
                'storage_usage_percent' => $storageUsagePercent,
                'database_size' => $this->databaseSize(),
            ];
        });

        return $cached;
    }

    private function directorySize(string $path): int
    {
        if (!is_dir($path)) {
            return 0;
        }

        $size = 0;
        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS)) as $file) {
            if ($file->isFile()) {
                $size += $file->getSize();
            }
        }

        return $size;
    }

    private function databaseSize(): string
    {
        try {
            $database = config('database.connections.pgsql.database');
            $row = DB::selectOne('select pg_size_pretty(pg_database_size(?)) as size', [$database]);

            return $row->size ?? 'Unknown';
        } catch (\Throwable) {
            return 'Unavailable';
        }
    }

    private function humanBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $value = max($bytes, 0);
        $unit = 0;
        while ($value >= 1024 && $unit < count($units) - 1) {
            $value /= 1024;
            $unit++;
        }

        return number_format($value, $unit === 0 ? 0 : 2).' '.$units[$unit];
    }
}
