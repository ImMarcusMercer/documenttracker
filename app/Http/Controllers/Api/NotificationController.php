<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\NotificationDispatcher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $query = Notification::query()
            ->where('recipient_user_id', $request->user()->id);

        if ($request->filled('search')) {
            $search = trim((string) $request->query('search'));
            $query->where(function ($inner) use ($search) {
                $inner->where('title', 'ilike', "%{$search}%")
                    ->orWhere('message', 'ilike', "%{$search}%")
                    ->orWhere('control_number', 'ilike', "%{$search}%")
                    ->orWhere('type', 'ilike', "%{$search}%");
            });
        }

        if ($request->filled('type')) {
            $query->where('type', strtolower((string) $request->query('type')));
        }

        if ($request->filled('severity') && Schema::hasColumn('notifications', 'severity')) {
            $query->where('severity', strtolower((string) $request->query('severity')));
        }

        if ($request->filled('is_read')) {
            $query->where('is_read', filter_var($request->query('is_read'), FILTER_VALIDATE_BOOLEAN));
        }

        $sort = $request->query('sort', 'created_at');
        $direction = strtolower((string) $request->query('direction', 'desc')) === 'asc' ? 'asc' : 'desc';
        $allowedSorts = ['created_at', 'title', 'type', 'severity', 'is_read'];
        $sort = in_array($sort, $allowedSorts, true) ? $sort : 'created_at';

        $perPage = min(100, max(5, (int) $request->query('per_page', 25)));
        $paginated = $query->orderBy($sort, $direction)->paginate($perPage);

        return response()->json([
            'data' => collect($paginated->items())
                ->map(fn (Notification $notification) => $this->serializeNotification($notification))
                ->values(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
                'unread_count' => Notification::where('recipient_user_id', $request->user()->id)->where('is_read', false)->count(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'recipient_email' => ['required', 'email'],
            'recipient_name' => ['nullable', 'string', 'max:255'],
            'document_id' => ['nullable', 'integer', 'exists:documents,id'],
            'control_number' => ['nullable', 'string', 'max:32'],
            'type' => ['nullable', 'string', 'max:64'],
            'severity' => ['nullable', Rule::in(['info', 'success', 'warning', 'critical', 'error'])],
            'title' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string'],
            'delivery_methods' => ['nullable', 'array'],
            'metadata' => ['nullable', 'array'],
            'is_read' => ['nullable', 'boolean'],
            'read_at' => ['nullable', 'date'],
        ]);

        $recipient = User::query()
            ->where('email', $data['recipient_email'])
            ->firstOrFail();

        $notification = NotificationDispatcher::notifyUser($recipient, [
            ...$data,
            'type' => strtolower((string) ($data['type'] ?? 'system')),
            'severity' => strtolower((string) ($data['severity'] ?? 'info')),
        ], $request);

        if (!$notification) {
            return response()->json(['message' => 'Notification was skipped by the recipient preferences.', 'data' => null], 202);
        }

        return response()->json(['data' => $this->serializeNotification($notification)], 201);
    }

    public function update(Request $request, Notification $notification)
    {
        abort_unless($notification->recipient_user_id === $request->user()->id, 403);

        $data = $request->validate([
            'is_read' => ['nullable', 'boolean'],
            'read_at' => ['nullable', 'date'],
        ]);

        if (($data['is_read'] ?? false) === true && empty($data['read_at'])) {
            $data['read_at'] = now();
        }

        $notification->fill($data);
        $notification->save();

        return response()->json(['data' => $this->serializeNotification($notification)]);
    }

    public function markAllRead(Request $request)
    {
        $count = Notification::query()
            ->where('recipient_user_id', $request->user()->id)
            ->where('is_read', false)
            ->update(['is_read' => true, 'read_at' => now(), 'updated_at' => now()]);

        AuditLogger::record($request->user(), 'transaction', 'notifications', 'mark_all_read', null, [], ['count' => $count], $request, 'info', 'User marked all notifications as read.');

        return response()->json(['data' => ['updated_count' => $count]]);
    }

    public function destroy(Request $request, Notification $notification)
    {
        abort_unless($notification->recipient_user_id === $request->user()->id, 403);
        $notification->delete();

        return response()->json(['ok' => true]);
    }

    public function preferences(Request $request)
    {
        $preference = NotificationPreference::firstOrCreate(
            ['user_id' => $request->user()->id],
            $this->defaultPreferenceValues()
        );

        return response()->json(['data' => $preference]);
    }

    public function updatePreferences(Request $request)
    {
        $data = $request->validate([
            'in_app_enabled' => ['nullable', 'boolean'],
            'popup_enabled' => ['nullable', 'boolean'],
            'email_enabled' => ['nullable', 'boolean'],
            'sms_enabled' => ['nullable', 'boolean'],
            'system_enabled' => ['nullable', 'boolean'],
            'warning_enabled' => ['nullable', 'boolean'],
            'critical_enabled' => ['nullable', 'boolean'],
            'reminder_enabled' => ['nullable', 'boolean'],
            'channels' => ['nullable', 'array'],
        ]);

        $preference = NotificationPreference::updateOrCreate(
            ['user_id' => $request->user()->id],
            [...$this->defaultPreferenceValues(), ...$data]
        );

        AuditLogger::record($request->user(), 'transaction', 'notifications', 'update_preferences', null, [], $data, $request, 'info', 'User updated notification preferences.');

        return response()->json(['data' => $preference]);
    }

    public function stream(Request $request)
    {
        $user = $request->user();

        return response()->stream(function () use ($user) {
            $lastSentId = 0;
            $started = time();

            while (time() - $started < 25) {
                $latest = Notification::query()
                    ->where('recipient_user_id', $user->id)
                    ->latest()
                    ->first();

                $payload = [
                    'unread_count' => Notification::query()
                        ->where('recipient_user_id', $user->id)
                        ->where('is_read', false)
                        ->count(),
                    'latest' => $latest ? $this->serializeNotification($latest) : null,
                    'generated_at' => now()->toISOString(),
                ];

                $shouldSend = !$latest || (int) $latest->id !== $lastSentId || $lastSentId === 0;
                if ($shouldSend) {
                    $lastSentId = (int) ($latest?->id ?? 0);
                    echo "event: notification-summary\n";
                    echo 'data: '.json_encode($payload)."\n\n";
                    @ob_flush();
                    flush();
                }

                sleep(5);
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-transform',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    private function serializeNotification(Notification $notification): array
    {
        return [
            'id' => (string) $notification->id,
            'recipient_email' => $notification->recipient_email,
            'recipient_name' => $notification->recipient_name,
            'document_id' => $notification->document_id ? (string) $notification->document_id : null,
            'control_number' => $notification->control_number,
            'type' => $notification->type ?: 'system',
            'severity' => $notification->severity ?: 'info',
            'title' => $notification->title,
            'message' => $notification->message,
            'delivery_methods' => $notification->delivery_methods ?? [],
            'metadata' => $notification->metadata ?? [],
            'is_read' => (bool) $notification->is_read,
            'read_at' => optional($notification->read_at)?->toISOString(),
            'delivered_at' => optional($notification->delivered_at)?->toISOString(),
            'emailed_at' => optional($notification->emailed_at)?->toISOString(),
            'created_date' => optional($notification->created_at)?->toISOString(),
        ];
    }

    private function defaultPreferenceValues(): array
    {
        return [
            'in_app_enabled' => true,
            'popup_enabled' => true,
            'email_enabled' => true,
            'sms_enabled' => false,
            'system_enabled' => true,
            'warning_enabled' => true,
            'critical_enabled' => true,
            'reminder_enabled' => true,
            'channels' => ['in_app' => true, 'popup' => true, 'email' => true, 'sms' => false],
        ];
    }
}
