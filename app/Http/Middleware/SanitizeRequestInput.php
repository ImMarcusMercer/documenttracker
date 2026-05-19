<?php

namespace App\Http\Middleware;

use App\Support\AuditLogger;
use App\Support\SiteSettings;
use Illuminate\Support\Facades\Cache;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SanitizeRequestInput
{
    private const EXCLUDED_KEYS = [
        'password',
        'password_confirmation',
        'current_password',
        'confirm_password',
        'token',
        '_token',
        'mfa_code',
        'code',
        'api_key',
        'secret',
        'signature',
        'checksum',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        if (! SiteSettings::boolean('security', 'strip_html_input', true)) {
            return $next($request);
        }

        if ($request->isMethod('POST') || $request->isMethod('PUT') || $request->isMethod('PATCH') || $request->isMethod('DELETE')) {
            $input = $request->except(array_keys($request->allFiles()));
            try {
                $this->recordSuspiciousInput($request, $input);
            } catch (\Throwable) {
                // Sanitization should remain available even when audit/cache storage is not ready.
            }
            $request->merge($this->sanitizeArray($input));
        }

        return $next($request);
    }

    private function recordSuspiciousInput(Request $request, array $input): void
    {
        $flat = strtolower((string) json_encode($input, JSON_INVALID_UTF8_SUBSTITUTE));
        $xssNeedles = ['<script', 'javascript:', 'onerror=', 'onload=', '<iframe', '<img'];
        $sqlNeedles = [' union select ', ' or 1=1', ' drop table', ' information_schema', '--', '/*', 'xp_cmdshell'];

        $category = null;
        foreach ($xssNeedles as $needle) {
            if (str_contains($flat, $needle)) {
                $category = 'xss';
                break;
            }
        }
        if (! $category) {
            foreach ($sqlNeedles as $needle) {
                if (str_contains($flat, $needle)) {
                    $category = 'sql_injection';
                    break;
                }
            }
        }

        if (! $category) {
            return;
        }

        $cooldownKey = 'docutracker.suspicious-input.'.sha1($request->ip().'|'.$request->path().'|'.$category.'|'.substr($flat, 0, 200));
        if (! Cache::add($cooldownKey, true, now()->addMinutes(2))) {
            return;
        }

        AuditLogger::record(
            $request->user(),
            'security',
            'input_sanitizer',
            $category === 'xss' ? 'xss_pattern_blocked' : 'sql_injection_pattern_blocked',
            null,
            [],
            ['path' => $request->path(), 'method' => $request->method(), 'sanitized' => true],
            $request,
            'warning',
            $category === 'xss'
                ? 'Potential XSS input was detected and sanitized before processing.'
                : 'Potential SQL injection pattern was detected in input and handled through validation/ORM safeguards.',
            ['source' => 'input_sanitizer']
        );
    }

    private function sanitizeArray(array $values, ?string $parentKey = null): array
    {
        $sanitized = [];

        foreach ($values as $key => $value) {
            $keyName = strtolower((string) $key);
            $fullKey = $parentKey ? $parentKey.'.'.$keyName : $keyName;

            if (in_array($keyName, self::EXCLUDED_KEYS, true) || in_array($fullKey, self::EXCLUDED_KEYS, true)) {
                $sanitized[$key] = $value;
                continue;
            }

            if (is_array($value)) {
                $sanitized[$key] = $this->sanitizeArray($value, $fullKey);
                continue;
            }

            if (is_string($value)) {
                $clean = str_replace("\0", '', $value);
                $clean = strip_tags($clean);
                $sanitized[$key] = trim($clean);
                continue;
            }

            $sanitized[$key] = $value;
        }

        return $sanitized;
    }
}
