<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Document;
use App\Models\DocumentAction;
use App\Models\Notification;
use App\Models\User;
use App\Support\DocumentAccess;
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

        $documents = Document::query()
            ->withTrashed()
            ->get()
            ->filter(fn (Document $document) => DocumentAccess::canView($user, $document))
            ->values();

        $actions = DocumentAction::query()
            ->whereBetween('created_at', [$start, $end])
            ->latest()
            ->limit(500)
            ->get();

        $dailyActivity = collect();
        $cursor = $start->copy()->startOfDay();
        while ($cursor <= $end) {
            $key = $cursor->format('Y-m-d');
            $dailyActivity->push([
                'date' => $key,
                'created' => $documents->filter(fn ($doc) => optional($doc->created_at)?->format('Y-m-d') === $key)->count(),
                'actions' => $actions->filter(fn ($action) => optional($action->created_at)?->format('Y-m-d') === $key)->count(),
                'audit_events' => AuditLog::whereDate('created_at', $key)->count(),
            ]);
            $cursor->addDay();
        }

        $storageBytes = $this->directorySize(storage_path('app/public'));
        $storageLimitMb = max(1, SiteSettings::integer('system', 'storage_capacity_limit_mb', (int) env('STORAGE_CAPACITY_LIMIT_MB', 1024)));
        $storageWarningThreshold = min(100, max(1, SiteSettings::integer('system', 'storage_warning_threshold_percent', (int) env('STORAGE_WARNING_THRESHOLD_PERCENT', 85))));
        $storageLimitBytes = $storageLimitMb * 1024 * 1024;
        $storageUsagePercent = round(min(999, ($storageBytes / max(1, $storageLimitBytes)) * 100), 2);
        $databaseSize = $this->databaseSize();

        if ($storageUsagePercent >= $storageWarningThreshold && Cache::add('docutracker.storage_warning_sent', true, now()->addHours(6))) {
            NotificationDispatcher::notifyAdmins([
                'type' => 'warning',
                'severity' => 'warning',
                'title' => 'Storage capacity warning',
                'message' => "Storage usage reached {$storageUsagePercent}% of the configured {$storageLimitMb} MB limit. Review uploaded files and backup retention.",
                'metadata' => [
                    'storage_usage_bytes' => $storageBytes,
                    'storage_capacity_limit_mb' => $storageLimitMb,
                    'storage_warning_threshold_percent' => $storageWarningThreshold,
                ],
            ], $request);
        }

        $criticalErrors = AuditLog::where('severity', 'critical')->whereBetween('created_at', [$start, $end])->count();
        $warningEvents = AuditLog::where('severity', 'warning')->whereBetween('created_at', [$start, $end])->count();

        $latestAudit = AuditLog::query()
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
            ]);

        $responseMs = round((microtime(true) - $startedAt) * 1000, 2);

        return response()->json([
            'data' => [
                'range' => ['start' => $start->toDateString(), 'end' => $end->toDateString(), 'label' => $range],
                'generated_at' => now()->toISOString(),
                'user_statistics' => [
                    'total_users' => User::count(),
                    'active_accounts' => User::where('status', 'active')->orWhere('is_active', true)->count(),
                    'active_now' => User::where('last_seen_at', '>=', now()->subMinutes(15))->count(),
                    'new_registrations' => User::whereBetween('created_at', [$start, $end])->count(),
                ],
                'document_statistics' => [
                    'total_documents' => $documents->whereNull('deleted_at')->count(),
                    'deleted_documents' => $documents->whereNotNull('deleted_at')->count(),
                    'pending_documents' => $documents->where('status', 'Pending Receipt')->count(),
                    'released_documents' => $documents->where('status', 'Released')->count(),
                ],
                'transaction_overview' => $dailyActivity,
                'status_counts' => $documents->whereNull('deleted_at')->groupBy('status')->map->count(),
                'classification_counts' => $documents->whereNull('deleted_at')->groupBy('classification')->map->count(),
                'system_health' => [
                    'server_uptime' => 'Available while PHP process is running',
                    'database_size' => $databaseSize,
                    'storage_usage_bytes' => $storageBytes,
                    'storage_usage_human' => $this->humanBytes($storageBytes),
                    'storage_capacity_limit_mb' => $storageLimitMb,
                    'storage_warning_threshold_percent' => $storageWarningThreshold,
                    'storage_usage_percent' => $storageUsagePercent,
                    'storage_warning_active' => $storageUsagePercent >= $storageWarningThreshold,
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
                    'api_response_ms' => $responseMs,
                    'critical_error_count' => $criticalErrors,
                    'warning_event_count' => $warningEvents,
                    'unread_notifications' => Notification::where('recipient_user_id', $user->id)->where('is_read', false)->count(),
                    'page_load_note' => 'Dashboard and layout widgets refresh through AJAX without a full page reload.',
                ],
                'recent_activities' => $actions->take(10)->map(fn (DocumentAction $action) => [
                    'id' => (string) $action->id,
                    'document_id' => (string) $action->document_id,
                    'action_type' => $action->action_type,
                    'from_user_name' => $action->from_user_name,
                    'to_user_name' => $action->to_user_name,
                    'created_date' => optional($action->created_at)?->toISOString(),
                ])->values(),
                'latest_audit_events' => $latestAudit,
            ],
        ]);
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
