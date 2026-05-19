<?php

namespace App\Support;

use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class NotificationDispatcher
{
    public static function notifyUser(User $recipient, array $payload, ?Request $request = null): ?Notification
    {
        $preference = NotificationPreference::firstOrCreate(['user_id' => $recipient->id]);
        $type = strtolower((string) ($payload['type'] ?? 'system'));
        $severity = strtolower((string) ($payload['severity'] ?? self::severityForType($type)));

        if (!self::typeAllowed($preference, $type, $severity)) {
            return null;
        }

        $deliveryMethods = $payload['delivery_methods'] ?? [
            'in_app' => (bool) $preference->in_app_enabled,
            'popup' => (bool) ($preference->popup_enabled ?? true),
            'email' => self::shouldEmail($preference, $type, $severity),
            'sms' => false,
        ];

        if (!($deliveryMethods['in_app'] ?? true)) {
            return null;
        }

        $notification = Notification::create([
            'recipient_user_id' => $recipient->id,
            'recipient_email' => $recipient->email,
            'recipient_name' => $recipient->name,
            'document_id' => $payload['document_id'] ?? null,
            'control_number' => $payload['control_number'] ?? null,
            'type' => $type,
            'severity' => $severity,
            'title' => strip_tags((string) ($payload['title'] ?? 'DocTracker Notification')),
            'message' => strip_tags((string) ($payload['message'] ?? 'You have a new DocTracker notification.')),
            'delivery_methods' => $deliveryMethods,
            'metadata' => $payload['metadata'] ?? null,
            'is_read' => false,
            'delivered_at' => now(),
        ]);

        if (($deliveryMethods['email'] ?? false) && (bool) $preference->email_enabled) {
            try {
                Mail::raw($notification->message, function ($message) use ($recipient, $notification) {
                    $message->to($recipient->email)->subject('[DocTracker] '.$notification->title);
                });
                $notification->forceFill(['emailed_at' => now()])->save();
            } catch (\Throwable $exception) {
                AuditLogger::record(
                    null,
                    'error',
                    'notifications',
                    'email_delivery_failed',
                    $notification,
                    [],
                    ['recipient' => $recipient->email, 'error' => $exception->getMessage()],
                    $request,
                    'warning',
                    'Notification email delivery failed but in-app notification was saved.'
                );
            }
        }

        return $notification;
    }

    public static function notifyAdmins(array $payload, ?Request $request = null): int
    {
        $count = 0;
        User::query()
            ->where(function ($query) {
                $query->whereRaw('UPPER(role) = ?', ['ADMIN']);
            })
            ->where('is_active', true)
            ->where('status', 'active')
            ->get()
            ->each(function (User $admin) use ($payload, $request, &$count) {
                if (self::notifyUser($admin, $payload, $request)) {
                    $count++;
                }
            });

        if (in_array(strtolower((string) ($payload['severity'] ?? $payload['type'] ?? 'info')), ['warning', 'critical', 'error'], true)) {
            self::emailConfiguredAdminRecipients($payload, $request);
        }

        return $count;
    }

    private static function emailConfiguredAdminRecipients(array $payload, ?Request $request = null): void
    {
        $rawRecipients = array_filter([
            env('ADMIN_ALERT_EMAIL'),
            env('SECURITY_ALERT_EMAIL'),
        ]);

        $recipients = collect($rawRecipients)
            ->flatMap(fn ($value) => preg_split('/[,;]+/', (string) $value) ?: [])
            ->map(fn ($value) => trim((string) $value))
            ->filter(fn ($value) => filter_var($value, FILTER_VALIDATE_EMAIL))
            ->unique()
            ->values();

        if ($recipients->isEmpty()) {
            return;
        }

        $subject = '[DocTracker Alert] '.strip_tags((string) ($payload['title'] ?? 'Security warning'));
        $body = collect([
            strip_tags((string) ($payload['message'] ?? 'DocTracker generated an administrative warning.')),
            '',
            'Severity: '.strtoupper((string) ($payload['severity'] ?? $payload['type'] ?? 'warning')),
            'Time: '.now()->toDateTimeString(),
            'IP Address: '.($request?->ip() ?: 'N/A'),
        ])->implode(PHP_EOL);

        try {
            Mail::raw($body, function ($message) use ($recipients, $subject) {
                $message->to($recipients->all())->subject($subject);
            });
        } catch (\Throwable $exception) {
            AuditLogger::record(
                null,
                'error',
                'notifications',
                'admin_alert_email_failed',
                null,
                [],
                ['recipients' => $recipients->all(), 'error' => $exception->getMessage()],
                $request,
                'warning',
                'Configured admin alert email delivery failed.'
            );
        }
    }

    private static function typeAllowed(NotificationPreference $preference, string $type, string $severity): bool
    {
        if (!($preference->in_app_enabled ?? true)) {
            return false;
        }

        if ($severity === 'critical' || $type === 'critical') {
            return (bool) ($preference->critical_enabled ?? true);
        }

        if ($severity === 'warning' || $type === 'warning') {
            return (bool) ($preference->warning_enabled ?? true);
        }

        if ($type === 'reminder') {
            return (bool) ($preference->reminder_enabled ?? true);
        }

        return (bool) ($preference->system_enabled ?? true);
    }

    private static function shouldEmail(NotificationPreference $preference, string $type, string $severity): bool
    {
        if (!($preference->email_enabled ?? true)) {
            return false;
        }

        return in_array($severity, ['warning', 'critical'], true) || in_array($type, ['warning', 'critical', 'reminder'], true);
    }

    private static function severityForType(string $type): string
    {
        return match ($type) {
            'critical' => 'critical',
            'warning' => 'warning',
            'reminder' => 'info',
            default => 'info',
        };
    }
}
