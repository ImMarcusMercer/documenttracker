<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\DocumentAction;
use App\Models\User;
use App\Support\DocumentAccess;
use App\Support\AuditLogger;
use App\Support\NotificationDispatcher;
use Illuminate\Http\Request;

class DocumentActionController extends Controller
{
    public function all(Request $request)
    {
        $actions = DocumentAction::query()
            ->with('document')
            ->latest()
            ->get()
            ->filter(fn (DocumentAction $action) => $action->document && DocumentAccess::canView($request->user(), $action->document))
            ->values()
            ->map(fn (DocumentAction $action) => $this->serializeAction($action))
            ->all();

        return response()->json(['data' => $actions]);
    }

    public function index(Request $request, int $document)
    {
        $record = Document::withTrashed()->findOrFail($document);
        abort_unless(DocumentAccess::canView($request->user(), $record), 403);

        return response()->json([
            'data' => $record->actions()
                ->latest()
                ->get()
                ->map(fn (DocumentAction $action) => $this->serializeAction($action))
                ->all(),
        ]);
    }

    public function store(Request $request, Document $document)
    {
        abort_unless(DocumentAccess::canAct($request->user(), $document), 403);

        $data = $request->validate([
            'action_type' => ['required', 'string', 'max:64'],
            'from_user' => ['nullable', 'email'],
            'from_user_name' => ['nullable', 'string', 'max:255'],
            'to_user' => ['nullable', 'email'],
            'to_user_name' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'new_status' => ['nullable', 'string', 'max:32'],
        ]);

        $fromUser = !empty($data['from_user']) ? User::query()->where('email', $data['from_user'])->first() : $request->user();
        $toUser = !empty($data['to_user']) ? User::query()->where('email', $data['to_user'])->first() : null;
        $actionType = strtolower(trim((string) $data['action_type']));

        $oldValues = $document->only(['status', 'current_holder', 'current_holder_name', 'current_holder_role']);

        $action = $document->actions()->create([
            'action_type' => $data['action_type'],
            'from_user_id' => $fromUser?->id,
            'from_user' => $data['from_user'] ?? $fromUser?->email,
            'from_user_name' => $data['from_user_name'] ?? $fromUser?->name,
            'to_user_id' => $toUser?->id,
            'to_user' => $data['to_user'] ?? $toUser?->email,
            'to_user_name' => $data['to_user_name'] ?? $toUser?->name,
            'notes' => $data['notes'] ?? null,
            'new_status' => $data['new_status'] ?? null,
        ]);

        if ($actionType === 'received') {
            $document->status = $data['new_status'] ?? 'Received';
            $document->physical_received = true;
        }

        if ($actionType === 'signed') {
            $document->status = $data['new_status'] ?? 'Signed';
            $document->physical_received = true;
        }

        if ($actionType === 'released') {
            $document->status = $data['new_status'] ?? 'Released';
            $document->released_date = $document->released_date ?: now()->toDateString();
        }

        if ($actionType === 'returned') {
            $document->status = $data['new_status'] ?? 'Returned';
            $document->return_reason = $data['notes'] ?? null;
            $document->physical_received = false;
        }

        if ($actionType === 'forwarded') {
            $document->status = $data['new_status'] ?? 'Forwarded';
            $document->physical_received = false;
            $document->return_reason = null;
        }

        if (
            $toUser
            && in_array($actionType, ['forwarded', 'returned'], true)
        ) {
            $document->current_holder_id = $toUser->id;
            $document->current_holder = $toUser->email;
            $document->current_holder_name = $toUser->name;
            $document->current_holder_role = strtoupper((string) $toUser->role);
            $document->forwarded_to = $toUser->name;
        }

        if (!empty($data['new_status']) && !in_array($actionType, ['received', 'signed', 'released', 'returned', 'forwarded'], true)) {
            $document->status = $data['new_status'];
        }

        if ($toUser && $actionType === 'forwarded') {
            NotificationDispatcher::notifyUser($toUser, [
                'document_id' => $document->id,
                'control_number' => $document->control_number,
                'type' => 'system',
                'severity' => 'info',
                'title' => 'Document assigned to you',
                'message' => 'Control No. '.$document->control_number.' requires your action.',
                'metadata' => [
                    'action_type' => $data['action_type'],
                    'from_user' => $fromUser?->email,
                    'from_user_name' => $fromUser?->name,
                ],
            ], $request);
        }

        $document->lock_version = (int) $document->lock_version + 1;
        $document->save();

        AuditLogger::record($request->user(), 'transaction', 'document_actions', strtolower(str_replace(' ', '_', $data['action_type'])), $action, $oldValues, $document->only(['status', 'current_holder', 'current_holder_name', 'current_holder_role']), $request, 'info', 'Document action recorded.');

        return response()->json(['data' => $this->serializeAction($action)], 201);
    }

    private function serializeAction(DocumentAction $action): array
    {
        return [
            'id' => (string) $action->id,
            'document_id' => (string) $action->document_id,
            'action_type' => $action->action_type,
            'from_user' => $action->from_user,
            'from_user_name' => $action->from_user_name,
            'to_user' => $action->to_user,
            'to_user_name' => $action->to_user_name,
            'notes' => $action->notes,
            'new_status' => $action->new_status,
            'created_date' => optional($action->created_at)?->toISOString(),
        ];
    }
}
