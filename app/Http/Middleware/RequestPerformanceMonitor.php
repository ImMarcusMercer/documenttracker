<?php

namespace App\Http\Middleware;

use App\Support\AuditLogger;
use App\Support\SiteSettings;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class RequestPerformanceMonitor
{
    public function handle(Request $request, Closure $next): Response
    {
        $requestId = (string) Str::uuid();
        $startedAt = microtime(true);

        /** @var Response $response */
        $response = $next($request);

        $elapsedMs = round((microtime(true) - $startedAt) * 1000, 2);
        $status = $response->getStatusCode();

        $response->headers->set('X-Request-ID', $requestId);
        $response->headers->set('X-Response-Time-Ms', (string) $elapsedMs);
        $response->headers->set('X-DocTracker-Monitoring', 'enabled');

        if ($request->is('api/v1/*')) {
            try {
                $this->recordMetrics($request, $status, $elapsedMs);
                $this->recordSlowOrErrorAudit($request, $status, $elapsedMs, $requestId);
            } catch (\Throwable) {
                // Monitoring must never break the application if cache/database tables are not ready yet.
            }
        }

        return $response;
    }

    private function recordMetrics(Request $request, int $status, float $elapsedMs): void
    {
        $bucket = now()->format('YmdHi');
        $key = "docutracker.performance.{$bucket}";
        $current = Cache::get($key, [
            'bucket' => $bucket,
            'started_at' => now()->startOfMinute()->toISOString(),
            'requests' => 0,
            'total_ms' => 0,
            'max_ms' => 0,
            'errors' => 0,
            'status_codes' => [],
            'paths' => [],
        ]);

        $path = '/'.$request->path();
        $current['requests']++;
        $current['total_ms'] = round(($current['total_ms'] ?? 0) + $elapsedMs, 2);
        $current['max_ms'] = max((float) ($current['max_ms'] ?? 0), $elapsedMs);
        $current['errors'] = ($current['errors'] ?? 0) + ($status >= 400 ? 1 : 0);
        $current['status_codes'][(string) $status] = ($current['status_codes'][(string) $status] ?? 0) + 1;
        $current['paths'][$path] = ($current['paths'][$path] ?? 0) + 1;

        arsort($current['paths']);
        $current['paths'] = array_slice($current['paths'], 0, 12, true);

        Cache::put($key, $current, now()->addHours(3));
    }

    private function recordSlowOrErrorAudit(Request $request, int $status, float $elapsedMs, string $requestId): void
    {
        $thresholdMs = SiteSettings::integer('performance', 'slow_request_threshold_ms', (int) env('SLOW_REQUEST_THRESHOLD_MS', 1500));
        $isSlow = $elapsedMs >= $thresholdMs;
        $isError = $status >= 500;

        if (! $isSlow && ! $isError) {
            return;
        }

        $cooldownKey = 'docutracker.performance.audit.'.sha1($request->path().'|'.$status.'|'.($isSlow ? 'slow' : 'error'));
        if (! Cache::add($cooldownKey, true, now()->addMinutes(5))) {
            return;
        }

        AuditLogger::record(
            $request->user(),
            $isError ? 'error' : 'performance',
            'performance_monitor',
            $isError ? 'server_error' : 'slow_request',
            null,
            [],
            [
                'request_id' => $requestId,
                'path' => $request->path(),
                'method' => $request->method(),
                'status' => $status,
                'elapsed_ms' => $elapsedMs,
                'threshold_ms' => $thresholdMs,
            ],
            $request,
            $isError ? 'critical' : 'warning',
            $isError
                ? "HTTP {$status} response detected by performance monitor."
                : "Slow request detected: {$elapsedMs} ms exceeded {$thresholdMs} ms threshold.",
            ['source' => 'performance_monitor']
        );
    }
}
