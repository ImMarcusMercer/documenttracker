<?php

namespace App\Http\Middleware;

use App\Support\AuditLogger;
use App\Support\SiteSettings;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnforceSessionPolicy
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!Auth::check()) {
            return $next($request);
        }

        $timeoutMinutes = SiteSettings::integer('security', 'session_timeout_minutes', (int) config('session.lifetime', 120));
        $timeoutSeconds = max(60, $timeoutMinutes * 60);
        $lastActivity = (int) $request->session()->get('last_activity_at', time());

        if ((time() - $lastActivity) > $timeoutSeconds) {
            $user = $request->user();
            AuditLogger::record($user, 'authentication', 'auth', 'session_timeout', $user, [], ['timeout_minutes' => $timeoutMinutes], $request, 'warning', 'Session expired after configured inactivity timeout.');

            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'message' => 'Your session expired because of inactivity. Please sign in again.',
                'type' => 'session_expired',
                'severity' => 'warning',
            ], 419);
        }

        $request->session()->put('last_activity_at', time());

        $response = $next($request);

        if ($this->shouldRecordAccess($request, $response)) {
            AuditLogger::record(
                $request->user(),
                'access',
                'pages',
                $request->method().' '.$request->path(),
                null,
                [],
                ['route' => $request->path(), 'query' => $request->query()],
                $request,
                'info',
                'User accessed a protected DocTracker page or API feature.'
            );
        }

        return $response;
    }

    private function shouldRecordAccess(Request $request, Response $response): bool
    {
        if (!SiteSettings::boolean('audit', 'log_access_enabled', true)) {
            return false;
        }

        if (!$request->isMethod('GET') || $response->getStatusCode() >= 400) {
            return false;
        }

        $path = $request->path();
        foreach (['api/v1/notifications/stream', 'api/v1/me', 'api/v1/dashboard/stats'] as $excluded) {
            if (str_starts_with($path, $excluded)) {
                return false;
            }
        }

        return true;
    }
}
