<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SupportTicket;
use App\Models\SupportTicketMessage;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\NotificationDispatcher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class HelpDeskTicketController extends Controller
{
    private const CATEGORIES = ['account', 'document', 'workflow', 'technical', 'security', 'other'];
    private const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
    private const STATUSES = ['open', 'in_progress', 'pending_user', 'resolved', 'closed', 'archived'];

    public function index(Request $request)
    {
        $user = $request->user();
        $isAgent = $this->isSupportAgent($user);

        $query = SupportTicket::query()
            ->with(['requester:id,name,email,role,section', 'assignedTo:id,name,email,role'])
            ->withCount('messages');

        if ($isAgent && filter_var($request->query('include_archived'), FILTER_VALIDATE_BOOLEAN)) {
            $query->withTrashed();
        }

        if (!$isAgent) {
            $query->where('requester_user_id', $user->id);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->query('search'));
            $query->where(function ($inner) use ($search) {
                $inner->where('ticket_number', 'ilike', "%{$search}%")
                    ->orWhere('subject', 'ilike', "%{$search}%")
                    ->orWhere('description', 'ilike', "%{$search}%");
            });
        }

        foreach (['status', 'priority', 'category'] as $filter) {
            if ($request->filled($filter)) {
                $query->where($filter, strtolower((string) $request->query($filter)));
            }
        }

        if ($isAgent && $request->filled('assigned_to')) {
            $assignedTo = (string) $request->query('assigned_to');
            if ($assignedTo === 'unassigned') {
                $query->whereNull('assigned_to_id');
            } elseif (is_numeric($assignedTo)) {
                $query->where('assigned_to_id', (int) $assignedTo);
            }
        }

        $sortBy = (string) $request->query('sort_by', 'created_at');
        $sortDir = strtolower((string) $request->query('sort_dir', 'desc')) === 'asc' ? 'asc' : 'desc';
        $allowedSorts = ['ticket_number', 'subject', 'status', 'priority', 'category', 'created_at', 'updated_at', 'last_response_at'];
        $sortBy = in_array($sortBy, $allowedSorts, true) ? $sortBy : 'created_at';

        $perPage = min(100, max(5, (int) $request->query('per_page', 25)));
        $paginated = $query->orderBy($sortBy, $sortDir)->paginate($perPage);

        return response()->json([
            'data' => collect($paginated->items())->map(fn (SupportTicket $ticket) => $this->serializeTicket($ticket, false))->values(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
                'is_agent' => $isAgent,
                'open_count' => $this->baseTicketQuery($user, $isAgent)->whereIn('status', ['open', 'in_progress', 'pending_user'])->count(),
                'urgent_count' => $this->baseTicketQuery($user, $isAgent)->where('priority', 'urgent')->whereNotIn('status', ['resolved', 'closed', 'archived'])->count(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'subject' => ['required', 'string', 'min:5', 'max:255'],
            'description' => ['required', 'string', 'min:10', 'max:5000'],
            'category' => ['required', Rule::in(self::CATEGORIES)],
            'priority' => ['required', Rule::in(self::PRIORITIES)],
        ]);

        $ticket = DB::transaction(function () use ($request, $data) {
            $ticket = SupportTicket::create([
                'ticket_number' => $this->generateTicketNumber(),
                'requester_user_id' => $request->user()->id,
                'subject' => strip_tags($data['subject']),
                'description' => strip_tags($data['description']),
                'category' => strtolower($data['category']),
                'priority' => strtolower($data['priority']),
                'status' => 'open',
                'last_response_at' => now(),
                'metadata' => [
                    'created_from' => 'need_help_page',
                    'requester_role' => $request->user()->role,
                ],
            ]);

            SupportTicketMessage::create([
                'support_ticket_id' => $ticket->id,
                'user_id' => $request->user()->id,
                'message' => strip_tags($data['description']),
                'is_internal_note' => false,
            ]);

            return $ticket;
        });

        $ticket->load(['requester', 'assignedTo'])->loadCount('messages');

        AuditLogger::record(
            $request->user(),
            'transaction',
            'support_tickets',
            'create',
            $ticket,
            [],
            $ticket->only(['ticket_number', 'subject', 'category', 'priority', 'status']),
            $request,
            $ticket->priority === 'urgent' ? 'warning' : 'info',
            'User submitted a Help Desk support ticket.',
            ['source' => 'help_desk']
        );

        $this->notifySupportTeam($ticket, $request, 'New Help Desk ticket', "{$ticket->ticket_number}: {$ticket->subject}");

        return response()->json(['data' => $this->serializeTicket($ticket, true)], 201);
    }

    public function show(Request $request, SupportTicket $ticket)
    {
        $this->authorizeTicketAccess($request, $ticket);

        if ($ticket->trashed() && !$this->isSupportAgent($request->user())) {
            abort(403, 'Only Help Desk staff or administrators can view archived tickets.');
        }

        $ticket->load(['requester:id,name,email,role,section', 'assignedTo:id,name,email,role', 'messages.user:id,name,email,role'])->loadCount('messages');

        AuditLogger::record(
            $request->user(),
            'access',
            'support_tickets',
            'view',
            $ticket,
            [],
            ['ticket_number' => $ticket->ticket_number],
            $request,
            'info',
            'User viewed Help Desk ticket details.',
            ['source' => 'help_desk']
        );

        return response()->json(['data' => $this->serializeTicket($ticket, true)]);
    }

    public function update(Request $request, SupportTicket $ticket)
    {
        abort_unless($this->isSupportAgent($request->user()), 403, 'Only Help Desk staff or administrators can update support tickets.');

        $data = $request->validate([
            'assigned_to_id' => ['nullable', 'integer', 'exists:users,id'],
            'status' => ['nullable', Rule::in(self::STATUSES)],
            'priority' => ['nullable', Rule::in(self::PRIORITIES)],
            'category' => ['nullable', Rule::in(self::CATEGORIES)],
            'resolution' => ['nullable', 'string', 'max:5000'],
        ]);

        $oldValues = $ticket->only(['assigned_to_id', 'status', 'priority', 'category', 'resolution', 'closed_at']);
        $ticket->fill($data);

        if (isset($data['status']) && in_array($data['status'], ['resolved', 'closed'], true)) {
            $ticket->closed_at = now();
        }
        if (isset($data['status']) && !in_array($data['status'], ['resolved', 'closed'], true)) {
            $ticket->closed_at = null;
        }

        $ticket->save();
        $ticket->load(['requester', 'assignedTo'])->loadCount('messages');

        AuditLogger::record(
            $request->user(),
            'transaction',
            'support_tickets',
            'update',
            $ticket,
            $oldValues,
            $ticket->only(['assigned_to_id', 'status', 'priority', 'category', 'resolution', 'closed_at']),
            $request,
            ($ticket->priority === 'urgent' || $ticket->status === 'archived') ? 'warning' : 'info',
            'Help Desk ticket was updated.',
            ['source' => 'help_desk']
        );

        NotificationDispatcher::notifyUser($ticket->requester, [
            'type' => 'support_ticket',
            'severity' => in_array($ticket->status, ['resolved', 'closed'], true) ? 'success' : 'info',
            'title' => 'Help Desk ticket updated',
            'message' => "{$ticket->ticket_number} is now {$ticket->status}.",
            'delivery_methods' => ['in_app' => true, 'popup' => true, 'email' => true, 'sms' => false],
            'metadata' => ['ticket_id' => $ticket->id, 'ticket_number' => $ticket->ticket_number],
        ], $request);

        return response()->json(['data' => $this->serializeTicket($ticket, true)]);
    }

    public function reply(Request $request, SupportTicket $ticket)
    {
        $this->authorizeTicketAccess($request, $ticket);

        if (in_array($ticket->status, ['closed', 'archived'], true) && !$this->isSupportAgent($request->user())) {
            abort(422, 'This ticket is already closed. Create a new ticket for another concern.');
        }

        $isAgent = $this->isSupportAgent($request->user());
        $data = $request->validate([
            'message' => ['required', 'string', 'min:2', 'max:5000'],
            'is_internal_note' => ['nullable', 'boolean'],
        ]);

        $isInternal = (bool) ($data['is_internal_note'] ?? false);
        abort_if($isInternal && !$isAgent, 403, 'Only Help Desk staff can add internal notes.');

        $message = SupportTicketMessage::create([
            'support_ticket_id' => $ticket->id,
            'user_id' => $request->user()->id,
            'message' => strip_tags($data['message']),
            'is_internal_note' => $isInternal,
        ]);

        $oldStatus = $ticket->status;
        $ticket->last_response_at = now();
        if (!$isInternal) {
            if ($isAgent && !in_array($ticket->status, ['resolved', 'closed'], true)) {
                $ticket->status = 'pending_user';
            } elseif (!$isAgent && $ticket->status === 'pending_user') {
                $ticket->status = 'open';
            }
        }
        $ticket->save();
        $ticket->load(['requester', 'assignedTo', 'messages.user'])->loadCount('messages');

        AuditLogger::record(
            $request->user(),
            'transaction',
            'support_tickets',
            $isInternal ? 'internal_note' : 'reply',
            $ticket,
            ['status' => $oldStatus],
            ['status' => $ticket->status, 'message_id' => $message->id, 'internal' => $isInternal],
            $request,
            'info',
            $isInternal ? 'Help Desk internal note was added.' : 'Help Desk ticket reply was added.',
            ['source' => 'help_desk']
        );

        if (!$isInternal) {
            if ($isAgent) {
                NotificationDispatcher::notifyUser($ticket->requester, [
                    'type' => 'support_ticket',
                    'severity' => 'info',
                    'title' => 'Help Desk replied to your ticket',
                    'message' => "{$ticket->ticket_number}: {$ticket->subject}",
                    'delivery_methods' => ['in_app' => true, 'popup' => true, 'email' => true, 'sms' => false],
                    'metadata' => ['ticket_id' => $ticket->id, 'ticket_number' => $ticket->ticket_number],
                ], $request);
            } else {
                $this->notifySupportTeam($ticket, $request, 'User replied to Help Desk ticket', "{$ticket->ticket_number}: {$ticket->subject}");
            }
        }

        return response()->json(['data' => $this->serializeTicket($ticket, true)]);
    }

    public function destroy(Request $request, SupportTicket $ticket)
    {
        abort_unless($this->isSupportAgent($request->user()), 403, 'Only Help Desk staff or administrators can archive support tickets.');

        $oldValues = $ticket->only(['status', 'deleted_at']);
        $ticket->forceFill(['status' => 'archived'])->save();
        $ticket->delete();

        AuditLogger::record($request->user(), 'transaction', 'support_tickets', 'archive', $ticket, $oldValues, ['status' => 'archived'], $request, 'warning', 'Help Desk ticket was archived.', ['source' => 'help_desk']);

        return response()->json(['data' => ['archived' => true, 'ticket_number' => $ticket->ticket_number]]);
    }

    public function restore(Request $request, int $ticketId)
    {
        abort_unless($this->isSupportAgent($request->user()), 403, 'Only Help Desk staff or administrators can restore support tickets.');
        $ticket = SupportTicket::withTrashed()->findOrFail($ticketId);
        $ticket->restore();
        $ticket->forceFill(['status' => 'open'])->save();

        AuditLogger::record($request->user(), 'transaction', 'support_tickets', 'restore', $ticket, ['status' => 'archived'], ['status' => 'open'], $request, 'info', 'Help Desk ticket was restored.', ['source' => 'help_desk']);

        return response()->json(['data' => $this->serializeTicket($ticket->load(['requester', 'assignedTo'])->loadCount('messages'), true)]);
    }

    public function stats(Request $request)
    {
        $user = $request->user();
        $isAgent = $this->isSupportAgent($user);
        $base = $this->baseTicketQuery($user, $isAgent);

        $statusCounts = (clone $base)
            ->select('status', DB::raw('COUNT(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        $priorityCounts = (clone $base)
            ->select('priority', DB::raw('COUNT(*) as total'))
            ->groupBy('priority')
            ->pluck('total', 'priority');

        return response()->json(['data' => [
            'is_agent' => $isAgent,
            'total' => (clone $base)->count(),
            'open' => (clone $base)->whereIn('status', ['open', 'in_progress', 'pending_user'])->count(),
            'resolved' => (clone $base)->whereIn('status', ['resolved', 'closed'])->count(),
            'urgent' => (clone $base)->where('priority', 'urgent')->count(),
            'status_counts' => $statusCounts,
            'priority_counts' => $priorityCounts,
        ]]);
    }

    private function baseTicketQuery(User $user, bool $isAgent)
    {
        $query = SupportTicket::query();
        if (!$isAgent) {
            $query->where('requester_user_id', $user->id);
        }
        return $query;
    }

    private function authorizeTicketAccess(Request $request, SupportTicket $ticket): void
    {
        $user = $request->user();
        if ($this->isSupportAgent($user) || (int) $ticket->requester_user_id === (int) $user->id) {
            return;
        }

        abort(403, 'You do not have access to this Help Desk ticket.');
    }

    private function isSupportAgent(User $user): bool
    {
        $role = strtoupper((string) $user->role);
        return in_array($role, ['ADMIN', 'HELPDESK', 'HELP_DESK', 'DEVELOPER'], true)
            || $user->hasPermission('support_tickets', 'manage')
            || $user->hasPermission('support_tickets', 'update');
    }

    private function notifySupportTeam(SupportTicket $ticket, Request $request, string $title, string $message): void
    {
        $recipients = User::query()
            ->where('is_active', true)
            ->where('status', 'active')
            ->where(function ($query) {
                $query->whereRaw('UPPER(role) in (?, ?, ?)', ['ADMIN', 'HELPDESK', 'HELP_DESK'])
                    ->orWhereHas('roleRecord.permissions', function ($permissionQuery) {
                        $permissionQuery->where('module_name', 'support_tickets')
                            ->whereIn('action_name', ['manage', 'update']);
                    });
            })
            ->get()
            ->unique('id');

        foreach ($recipients as $recipient) {
            NotificationDispatcher::notifyUser($recipient, [
                'type' => 'support_ticket',
                'severity' => $ticket->priority === 'urgent' ? 'warning' : 'info',
                'title' => $title,
                'message' => $message,
                'delivery_methods' => ['in_app' => true, 'popup' => true, 'email' => true, 'sms' => false],
                'metadata' => ['ticket_id' => $ticket->id, 'ticket_number' => $ticket->ticket_number],
            ], $request);
        }
    }

    private function generateTicketNumber(): string
    {
        $nextId = (int) (SupportTicket::withTrashed()->max('id') ?? 0) + 1;
        return 'HD-'.now()->format('Ymd').'-'.str_pad((string) $nextId, 5, '0', STR_PAD_LEFT);
    }

    private function serializeTicket(SupportTicket $ticket, bool $includeMessages = false): array
    {
        $data = [
            'id' => (string) $ticket->id,
            'ticket_number' => $ticket->ticket_number,
            'subject' => $ticket->subject,
            'description' => $ticket->description,
            'category' => $ticket->category,
            'priority' => $ticket->priority,
            'status' => $ticket->status,
            'resolution' => $ticket->resolution,
            'requester_user_id' => (string) $ticket->requester_user_id,
            'requester' => $ticket->relationLoaded('requester') && $ticket->requester ? [
                'id' => (string) $ticket->requester->id,
                'name' => $ticket->requester->name,
                'email' => $ticket->requester->email,
                'role' => $ticket->requester->role,
                'section' => $ticket->requester->section,
            ] : null,
            'assigned_to_id' => $ticket->assigned_to_id ? (string) $ticket->assigned_to_id : null,
            'assigned_to' => $ticket->relationLoaded('assignedTo') && $ticket->assignedTo ? [
                'id' => (string) $ticket->assignedTo->id,
                'name' => $ticket->assignedTo->name,
                'email' => $ticket->assignedTo->email,
                'role' => $ticket->assignedTo->role,
            ] : null,
            'messages_count' => $ticket->messages_count ?? $ticket->messages()->count(),
            'metadata' => $ticket->metadata ?? [],
            'last_response_at' => optional($ticket->last_response_at)?->toISOString(),
            'closed_at' => optional($ticket->closed_at)?->toISOString(),
            'created_at' => optional($ticket->created_at)?->toISOString(),
            'updated_at' => optional($ticket->updated_at)?->toISOString(),
            'deleted_at' => optional($ticket->deleted_at)?->toISOString(),
        ];

        if ($includeMessages) {
            $data['messages'] = $ticket->messages
                ->filter(fn (SupportTicketMessage $message) => !$message->is_internal_note || request()->user()?->hasPermission('support_tickets', 'update') || $this->isSupportAgent(request()->user()))
                ->map(fn (SupportTicketMessage $message) => [
                    'id' => (string) $message->id,
                    'message' => $message->message,
                    'is_internal_note' => (bool) $message->is_internal_note,
                    'user' => $message->relationLoaded('user') && $message->user ? [
                        'id' => (string) $message->user->id,
                        'name' => $message->user->name,
                        'email' => $message->user->email,
                        'role' => $message->user->role,
                    ] : null,
                    'created_at' => optional($message->created_at)?->toISOString(),
                ])
                ->values();
        }

        return $data;
    }
}
