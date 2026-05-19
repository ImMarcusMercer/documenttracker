<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Support\SiteSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

class SecurityMonitorController extends Controller
{
    private const SECURITY_CATEGORIES = [
        'sql_injection',
        'xss',
        'authentication',
        'dos_ddos',
        'network',
        'social_engineering',
        'privilege',
        'error',
    ];

    public function index(Request $request)
    {
        $this->ensureAdmin($request);

        $minutes = min(180, max(5, (int) $request->query('minutes', SiteSettings::integer('performance', 'monitoring_window_minutes', 60))));
        $start = now()->subMinutes($minutes);

        $securityQuery = AuditLog::query()->where('created_at', '>=', $start)
            ->where(function ($query) {
                $query->where('is_suspicious', true)
                    ->orWhereIn('category', self::SECURITY_CATEGORIES)
                    ->orWhereIn('severity', ['warning', 'critical', 'error']);
            });

        $categoryCounts = (clone $securityQuery)
            ->select('category', DB::raw('count(*) as total'))
            ->groupBy('category')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => ['category' => $row->category ?: 'system', 'total' => (int) $row->total])
            ->values();

        $severityCounts = (clone $securityQuery)
            ->select('severity', DB::raw('count(*) as total'))
            ->groupBy('severity')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => ['severity' => $row->severity ?: 'info', 'total' => (int) $row->total])
            ->values();

        $recentEvents = (clone $securityQuery)
            ->latest()
            ->limit(12)
            ->get()
            ->map(fn (AuditLog $log) => [
                'id' => (string) $log->id,
                'time' => optional($log->created_at)?->toISOString(),
                'category' => $log->category ?: 'system',
                'severity' => $log->severity,
                'risk_score' => (int) ($log->risk_score ?? 10),
                'indicator' => data_get($log->metadata, 'indicator'),
                'source' => $log->source ?: 'application',
                'action' => trim(($log->module_name ?: 'system').' / '.($log->action_name ?: 'event'), ' /'),
                'user' => $log->user_email ?: 'system',
                'ip_address' => $log->ip_address,
                'message' => $log->message,
            ])
            ->values();

        $performance = $this->performanceMetrics($minutes);
        $attackSimulation = AuditLog::where('source', 'developer_simulator')->where('created_at', '>=', $start);

        return response()->json(['data' => [
            'generated_at' => now()->toISOString(),
            'window_minutes' => $minutes,
            'security_summary' => [
                'suspicious_events' => (clone $securityQuery)->count(),
                'critical_events' => (clone $securityQuery)->where('severity', 'critical')->count(),
                'warning_events' => (clone $securityQuery)->where('severity', 'warning')->count(),
                'failed_login_events' => AuditLog::where('created_at', '>=', $start)
                    ->where('category', 'authentication')
                    ->where(function ($query) {
                        $query->where('action_name', 'ilike', '%login%')
                            ->orWhere('message', 'ilike', '%failed%')
                            ->orWhere('message', 'ilike', '%lockout%');
                    })->count(),
                'simulated_attack_events' => (clone $attackSimulation)->count(),
                'average_risk_score' => round((float) ((clone $securityQuery)->avg('risk_score') ?: 0), 2),
            ],
            'category_counts' => $categoryCounts,
            'severity_counts' => $severityCounts,
            'recent_events' => $recentEvents,
            'performance' => $performance,
            'security_controls' => $this->securityControls(),
        ]]);
    }

    private function performanceMetrics(int $minutes): array
    {
        $buckets = [];
        $totalRequests = 0;
        $totalMs = 0.0;
        $maxMs = 0.0;
        $errors = 0;
        $topPaths = [];

        for ($i = $minutes - 1; $i >= 0; $i--) {
            $time = now()->subMinutes($i);
            $key = 'docutracker.performance.'.$time->format('YmdHi');
            $bucket = Cache::get($key, [
                'bucket' => $time->format('YmdHi'),
                'started_at' => $time->copy()->startOfMinute()->toISOString(),
                'requests' => 0,
                'total_ms' => 0,
                'max_ms' => 0,
                'errors' => 0,
                'paths' => [],
            ]);

            $requests = (int) ($bucket['requests'] ?? 0);
            $bucketTotalMs = (float) ($bucket['total_ms'] ?? 0);
            $bucketMaxMs = (float) ($bucket['max_ms'] ?? 0);
            $bucketErrors = (int) ($bucket['errors'] ?? 0);

            $totalRequests += $requests;
            $totalMs += $bucketTotalMs;
            $maxMs = max($maxMs, $bucketMaxMs);
            $errors += $bucketErrors;

            foreach (($bucket['paths'] ?? []) as $path => $count) {
                $topPaths[$path] = ($topPaths[$path] ?? 0) + (int) $count;
            }

            if ($requests > 0 || $i < 15) {
                $buckets[] = [
                    'time' => Carbon::parse($bucket['started_at'])->format('H:i'),
                    'requests' => $requests,
                    'avg_ms' => $requests > 0 ? round($bucketTotalMs / $requests, 2) : 0,
                    'errors' => $bucketErrors,
                ];
            }
        }

        arsort($topPaths);

        return [
            'requests' => $totalRequests,
            'average_response_ms' => $totalRequests > 0 ? round($totalMs / $totalRequests, 2) : 0,
            'max_response_ms' => round($maxMs, 2),
            'errors' => $errors,
            'error_rate_percent' => $totalRequests > 0 ? round(($errors / $totalRequests) * 100, 2) : 0,
            'slow_request_threshold_ms' => SiteSettings::integer('performance', 'slow_request_threshold_ms', (int) env('SLOW_REQUEST_THRESHOLD_MS', 1500)),
            'buckets' => $buckets,
            'top_paths' => collect($topPaths)->take(8)->map(fn ($count, $path) => ['path' => $path, 'requests' => $count])->values(),
        ];
    }

    private function securityControls(): array
    {
        return [
            [
                'name' => 'Rate limiting',
                'status' => 'enabled',
                'detail' => 'API routes use throttle middleware with '.SiteSettings::integer('api', 'rate_limit_per_minute', 100).' requests/minute per IP display policy.',
            ],
            [
                'name' => 'SQL injection prevention',
                'status' => 'enabled',
                'detail' => 'Laravel ORM/query builder parameter binding is used for database operations. Database driver: '.config('database.default').'.',
            ],
            [
                'name' => 'XSS protection and CSP',
                'status' => SiteSettings::boolean('security', 'csp_enabled', true) ? 'enabled' : 'warning',
                'detail' => 'Output rendering is encoded by React. Security headers include Content-Security-Policy and frame/content-type protections.',
            ],
            [
                'name' => 'CSRF protection',
                'status' => 'enabled',
                'detail' => 'State-changing AJAX requests send the Laravel CSRF token from the application shell.',
            ],
            [
                'name' => 'HTTPS and secure cookies',
                'status' => config('session.secure') ? 'enabled' : 'warning',
                'detail' => config('session.secure') ? 'SESSION_SECURE_COOKIE is enabled.' : 'Enable SESSION_SECURE_COOKIE=true when deployed behind HTTPS.',
            ],
            [
                'name' => 'Password hashing',
                'status' => 'enabled',
                'detail' => 'Laravel Hash facade is available; hashes are verified without MD5/SHA1. Current driver supports '.(Hash::needsRehash('placeholder') ? 'rehashing checks' : 'configured hashing').'.',
            ],
            [
                'name' => 'Input sanitization',
                'status' => SiteSettings::boolean('security', 'strip_html_input', true) ? 'enabled' : 'warning',
                'detail' => 'HTML tags are stripped from normal text inputs unless disabled in Site Settings.',
            ],
            [
                'name' => 'Performance monitoring',
                'status' => 'enabled',
                'detail' => 'API response timing is tracked and slow/error requests are logged for monitoring.',
            ],
        ];
    }

    private function ensureAdmin(Request $request): void
    {
        abort_unless(strtoupper((string) $request->user()->role) === 'ADMIN', 403);
    }
}
