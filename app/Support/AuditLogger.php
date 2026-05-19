<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class AuditLogger
{
    public static function record(
        ?User $user,
        string $eventType,
        string $module,
        string $action,
        ?Model $auditable = null,
        array $oldValues = [],
        array $newValues = [],
        ?Request $request = null,
        string $severity = 'info',
        ?string $message = null,
        array $metadata = []
    ): void {
        try {
            $classification = self::classify($eventType, $module, $action, $severity, $message, $newValues, $metadata);

            $payload = [
                'user_id' => $user?->id,
                'user_email' => $user?->email,
                'event_type' => $eventType,
                'module_name' => $module,
                'action_name' => $action,
                'auditable_type' => $auditable ? $auditable::class : null,
                'auditable_id' => $auditable?->getKey(),
                'old_values' => self::sanitize($oldValues),
                'new_values' => self::sanitize($newValues),
                'ip_address' => $request?->ip(),
                'user_agent' => $request?->userAgent(),
                'severity' => $severity,
                'message' => $message,
            ];

            if (Schema::hasColumn('audit_logs', 'category')) {
                $payload['category'] = $classification['category'];
            }
            if (Schema::hasColumn('audit_logs', 'risk_score')) {
                $payload['risk_score'] = $classification['risk_score'];
            }
            if (Schema::hasColumn('audit_logs', 'source')) {
                $payload['source'] = $classification['source'];
            }
            if (Schema::hasColumn('audit_logs', 'is_suspicious')) {
                $payload['is_suspicious'] = $classification['is_suspicious'];
            }
            if (Schema::hasColumn('audit_logs', 'metadata')) {
                $payload['metadata'] = self::sanitize($metadata + ['indicator' => $classification['indicator']]);
            }

            AuditLog::create($payload);
        } catch (\Throwable $exception) {
            Log::warning('Failed to write audit log.', [
                'message' => $exception->getMessage(),
                'event_type' => $eventType,
                'module' => $module,
                'action' => $action,
            ]);
        }
    }

    public static function classify(
        string $eventType,
        string $module,
        string $action,
        string $severity,
        ?string $message = null,
        array $newValues = [],
        array $metadata = []
    ): array {
        $text = strtolower($eventType.' '.$module.' '.$action.' '.($message ?? '').' '.json_encode($newValues).' '.json_encode($metadata));
        $category = 'system';
        $indicator = 'Normal system activity';
        $source = $metadata['source'] ?? 'application';

        $patterns = [
            'sql_injection' => ['sql injection', 'sqli', 'union select', 'drop table', 'or 1=1', 'database query'],
            'xss' => ['xss', '<script', 'javascript:', 'cross-site scripting'],
            'authentication' => ['login', 'mfa', 'password', 'brute force', 'dictionary', 'credential', 'session'],
            'dos_ddos' => ['ddos', 'dos', 'flood', 'stress', 'high-volume'],
            'network' => ['port scan', 'nmap', 'mitm', 'firewall', 'ids evasion', 'service enumeration'],
            'social_engineering' => ['phishing', 'spear phishing', 'vishing', 'smishing', 'tailgating', 'rogue usb'],
            'privilege' => ['privilege escalation', 'lateral movement', 'impersonate', 'admin bypass'],
            'transaction' => ['create', 'update', 'delete', 'restore', 'crud', 'route'],
            'error' => ['exception', 'error', 'failed', 'stack trace'],
            'access' => ['page visit', 'feature usage', 'access'],
        ];

        foreach ($patterns as $name => $needles) {
            foreach ($needles as $needle) {
                if (str_contains($text, $needle)) {
                    $category = $name;
                    break 2;
                }
            }
        }

        $risk = match ($severity) {
            'critical' => 90,
            'warning' => 65,
            'error' => 75,
            default => 20,
        };

        if (in_array($category, ['sql_injection', 'xss', 'dos_ddos', 'privilege'], true)) {
            $risk = max($risk, 85);
        } elseif (in_array($category, ['authentication', 'network', 'social_engineering'], true)) {
            $risk = max($risk, 65);
        } elseif ($category === 'transaction') {
            $risk = max($risk, 30);
        }

        $isSuspicious = $severity !== 'info' || $risk >= 60 || in_array($category, ['sql_injection', 'xss', 'authentication', 'dos_ddos', 'network', 'social_engineering', 'privilege'], true);

        $indicator = match ($category) {
            'sql_injection' => 'SQL Injection pattern detected',
            'xss' => 'Cross-Site Scripting pattern detected',
            'authentication' => 'Authentication/session risk',
            'dos_ddos' => 'Denial-of-Service stress pattern',
            'network' => 'Network/infrastructure probing pattern',
            'social_engineering' => 'Human-factor attack simulation',
            'privilege' => 'Privilege/post-exploitation pattern',
            'transaction' => 'Business transaction change',
            'error' => 'Application error condition',
            'access' => 'Access/feature usage event',
            default => 'Normal system activity',
        };

        return [
            'category' => $category,
            'risk_score' => min(100, max(1, $risk)),
            'source' => $source,
            'is_suspicious' => $isSuspicious,
            'indicator' => $indicator,
        ];
    }

    private static function sanitize(array $values): array
    {
        return Arr::except($values, ['password', 'remember_token', 'mfa_code_hash', 'token', 'code']);
    }
}
