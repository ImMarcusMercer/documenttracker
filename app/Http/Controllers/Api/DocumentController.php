<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\DocumentAction;
use App\Models\User;
use App\Support\DocumentAccess;
use App\Support\DocumentFileStorage;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;

class DocumentController extends Controller
{
    public function index(Request $request)
    {
        /** @var User $user */
        $user = $request->user();
        $documents = $this->documentQuery($request, $user)
            ->get()
            ->filter(fn (Document $document) => DocumentAccess::canView($user, $document))
            ->values();

        if ($request->boolean('paginate')) {
            $perPage = min(max((int) $request->query('per_page', 25), 10), 100);
            $page = max((int) $request->query('page', 1), 1);
            $total = $documents->count();
            $slice = $documents->slice(($page - 1) * $perPage, $perPage)->values();

            return response()->json([
                'data' => $slice->map(fn (Document $document) => $this->serializeDocument($document, $user))->all(),
                'meta' => [
                    'current_page' => $page,
                    'per_page' => $perPage,
                    'total' => $total,
                    'last_page' => max(1, (int) ceil($total / $perPage)),
                    'from' => $total === 0 ? 0 : (($page - 1) * $perPage) + 1,
                    'to' => min($page * $perPage, $total),
                ],
            ]);
        }

        return response()->json([
            'data' => $documents
                ->take(5000)
                ->map(fn (Document $document) => $this->serializeDocument($document, $user))
                ->all(),
        ]);
    }

    public function show(Request $request, int $document)
    {
        /** @var User $user */
        $user = $request->user();
        $record = Document::withTrashed()->with('linkedDocument')->findOrFail($document);
        abort_unless(DocumentAccess::canView($user, $record), 403);
        abort_if($record->trashed() && !DocumentAccess::canRestore($user), 403, 'Only administrators can view archived documents.');

        return response()->json(['data' => $this->serializeDocument($record, $user)]);
    }

    public function store(Request $request)
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless(DocumentAccess::canCreate($user), 403);

        $data = $request->validate([
            'classification' => ['required', 'string', 'max:64'],
            'section' => ['required', 'string', 'max:32'],
            'particulars' => ['required', 'string'],
            'source_office' => ['nullable', 'string', 'max:255'],
            'requestor' => ['nullable', 'string', 'max:255'],
            'amount' => ['nullable', 'numeric'],
            'received_date' => ['required', 'date'],
            'remarks' => ['nullable', 'string'],
            'file' => ['nullable', 'file', 'mimes:pdf,doc,docx,jpg,jpeg,png', 'max:10240'],
            'file_url' => ['nullable', 'string'],
            'file_path' => ['nullable', 'string'],
            'file_name' => ['nullable', 'string'],
            'file_mime' => ['nullable', 'string'],
            'file_size' => ['nullable', 'integer'],
            'ocr_status' => ['nullable', 'string', 'max:32'],
            'ocr_text' => ['nullable', 'string'],
            'ocr_confidence' => ['nullable', 'integer', 'min:0', 'max:100'],
            'extracted_fields' => ['nullable', 'array'],
        ]);

        $fileAttributes = $this->fileAttributesFromPayload($data, 'file');
        if ($request->hasFile('file')) {
            $storedFile = DocumentFileStorage::store($request->file('file'), 'documents');
            $fileAttributes = $this->mapStoredFile($storedFile, 'file');
        }

        $document = Document::create([
            'control_number' => $this->generateControlNumber($data['received_date']),
            'classification' => $data['classification'],
            'section' => strtoupper($data['section']),
            'particulars' => $data['particulars'],
            'source_office' => $data['source_office'] ?? null,
            'requestor' => $data['requestor'] ?? null,
            'amount' => $data['amount'] ?? null,
            'received_date' => $data['received_date'],
            'remarks' => $data['remarks'] ?? null,
            'status' => 'Pending Receipt',
            'physical_received' => false,
            'ocr_status' => $data['ocr_status'] ?? null,
            'ocr_text' => $data['ocr_text'] ?? null,
            'ocr_confidence' => $data['ocr_confidence'] ?? null,
            'extracted_fields' => $data['extracted_fields'] ?? null,
            'extraction_reviewed_at' => !empty($data['extracted_fields']) ? now() : null,
            'extraction_reviewed_by_id' => !empty($data['extracted_fields']) ? $user->id : null,
            ...$fileAttributes,
            'created_by_id' => $user->id,
            'current_holder_id' => $user->id,
            'current_holder' => $user->email,
            'current_holder_name' => $user->name,
            'current_holder_role' => strtoupper((string) $user->role),
        ]);

        $document->actions()->create([
            'action_type' => 'Created',
            'from_user_id' => $user->id,
            'from_user' => $user->email,
            'from_user_name' => $user->name,
            'notes' => 'Document received and logged into the system.',
            'new_status' => 'Pending Receipt',
        ]);

        AuditLogger::record($user, 'transaction', 'documents', 'create', $document, [], $document->toArray(), $request, 'info', 'Document created.');

        return response()->json(['data' => $this->serializeDocument($document->fresh('linkedDocument'), $user)], 201);
    }

    public function update(Request $request, Document $document)
    {
        abort_unless(DocumentAccess::canAct($request->user(), $document), 403);

        $data = $request->validate([
            'lock_version' => ['nullable', 'integer'],
            'section' => ['nullable', 'string', 'max:32'],
            'particulars' => ['nullable', 'string'],
            'source_office' => ['nullable', 'string', 'max:255'],
            'requestor' => ['nullable', 'string', 'max:255'],
            'amount' => ['nullable', 'numeric'],
            'remarks' => ['nullable', 'string'],
            'status' => ['nullable', 'string', 'max:32'],
            'physical_received' => ['nullable', 'boolean'],
            'return_reason' => ['nullable', 'string'],
            'released_date' => ['nullable', 'date'],
            'current_holder' => ['nullable', 'email'],
            'current_holder_name' => ['nullable', 'string', 'max:255'],
            'current_holder_role' => ['nullable', 'string', 'max:32'],
            'forwarded_to' => ['nullable', 'string', 'max:255'],
            'linked_document_id' => ['nullable', 'integer', 'exists:documents,id'],

            'file' => ['nullable', 'file', 'mimes:pdf,doc,docx,jpg,jpeg,png', 'max:10240'],
            'file_url' => ['nullable', 'string'],
            'file_path' => ['nullable', 'string'],
            'file_name' => ['nullable', 'string'],
            'file_mime' => ['nullable', 'string'],
            'file_size' => ['nullable', 'integer'],

            'memo_file' => ['nullable', 'file', 'mimes:pdf,doc,docx,jpg,jpeg,png', 'max:10240'],
            'memo_file_url' => ['nullable', 'string'],
            'memo_file_path' => ['nullable', 'string'],
            'memo_file_name' => ['nullable', 'string'],
            'memo_file_mime' => ['nullable', 'string'],
            'memo_file_size' => ['nullable', 'integer'],

            'trip_ticket_file' => ['nullable', 'file', 'mimes:pdf,doc,docx,jpg,jpeg,png', 'max:10240'],
            'trip_ticket_file_url' => ['nullable', 'string'],
            'trip_ticket_file_path' => ['nullable', 'string'],
            'trip_ticket_file_name' => ['nullable', 'string'],
            'trip_ticket_file_mime' => ['nullable', 'string'],
            'trip_ticket_file_size' => ['nullable', 'integer'],
            'ocr_status' => ['nullable', 'string', 'max:32'],
            'ocr_text' => ['nullable', 'string'],
            'ocr_confidence' => ['nullable', 'integer', 'min:0', 'max:100'],
            'extracted_fields' => ['nullable', 'array'],
            'extraction_reviewed_at' => ['nullable', 'date'],
        ]);

        if (array_key_exists('lock_version', $data) && (int) $data['lock_version'] !== (int) $document->lock_version) {
            abort(409, 'This document was updated by another user. Refresh the page before saving again.');
        }
        unset($data['lock_version']);

        $oldValues = $document->only(array_keys($data));

        if (array_key_exists('section', $data)) {
            $data['section'] = strtoupper($data['section']);
        }

        if (array_key_exists('current_holder_role', $data) && $data['current_holder_role']) {
            $data['current_holder_role'] = strtoupper($data['current_holder_role']);
        }

        if (!empty($data['current_holder'])) {
            $holder = User::query()->where('email', $data['current_holder'])->first();
            $data['current_holder_id'] = $holder?->id;
            $data['current_holder_name'] = $data['current_holder_name'] ?? $holder?->name;
            $data['current_holder_role'] = strtoupper((string) ($data['current_holder_role'] ?? $holder?->role));
        }

        if (($data['status'] ?? null) === 'Released' && empty($data['released_date'])) {
            $data['released_date'] = now()->toDateString();
        }

        if (array_key_exists('extracted_fields', $data) && !empty($data['extracted_fields'])) {
            $data['extraction_reviewed_at'] = $data['extraction_reviewed_at'] ?? now();
            $data['extraction_reviewed_by_id'] = $request->user()->id;
        }

        $data = $this->mergeStoredFileIfUploaded($request, $data, 'file', 'documents');
        $data = $this->mergeStoredFileIfUploaded($request, $data, 'memo_file', 'memorandums');
        $data = $this->mergeStoredFileIfUploaded($request, $data, 'trip_ticket_file', 'trip-tickets');
        unset($data['file'], $data['memo_file'], $data['trip_ticket_file']);

        $document->fill($data);
        $document->lock_version = (int) $document->lock_version + 1;
        $document->save();

        AuditLogger::record($request->user(), 'transaction', 'documents', 'update', $document, $oldValues, $document->only(array_keys($data)), $request, 'info', 'Document updated.');

        return response()->json(['data' => $this->serializeDocument($document->fresh('linkedDocument'), $request->user())]);
    }


    public function destroy(Request $request, Document $document)
    {
        abort_unless(DocumentAccess::canDelete($request->user(), $document), 403);
        $this->requirePasswordConfirmation($request);

        $this->softDeleteDocument($request, $document, 'Document was soft-deleted after password-confirmed warning modal.');

        return response()->json(['ok' => true, 'data' => ['deleted_count' => 1, 'archived_count' => 1]]);
    }

    public function bulkDestroy(Request $request)
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['integer'],
            'confirm_password' => ['required', 'string'],
        ]);

        $this->requirePasswordConfirmation($request);

        $documents = Document::query()
            ->whereIn('id', array_unique($data['ids']))
            ->get();

        $deleted = 0;
        $skipped = [];

        foreach ($documents as $document) {
            if (!DocumentAccess::canDelete($request->user(), $document)) {
                $skipped[] = $document->control_number;
                continue;
            }

            $this->softDeleteDocument($request, $document, 'Document was soft-deleted through bulk warning modal.');
            $deleted++;
        }

        AuditLogger::record($request->user(), 'transaction', 'documents', 'bulk_delete', null, [], [
            'requested_ids' => array_unique($data['ids']),
            'deleted_count' => $deleted,
            'skipped' => $skipped,
        ], $request, 'warning', 'Bulk document soft-delete completed after impact summary and password confirmation.');

        return response()->json([
            'ok' => true,
            'data' => [
                'requested_count' => count(array_unique($data['ids'])),
                'deleted_count' => $deleted,
                'archived_count' => $deleted,
                'skipped_count' => count($skipped),
                'skipped' => $skipped,
            ],
        ]);
    }

    public function bulkStatus(Request $request)
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['integer'],
            'status' => ['required', 'string', 'max:32'],
        ]);

        $documents = Document::query()->whereIn('id', array_unique($data['ids']))->get();
        $updated = 0;
        $skipped = [];

        foreach ($documents as $document) {
            if (!DocumentAccess::canAct($request->user(), $document)) {
                $skipped[] = $document->control_number;
                continue;
            }

            $oldValues = $document->only(['status']);
            $document->status = $data['status'];
            if ($data['status'] === 'Released' && empty($document->released_date)) {
                $document->released_date = now()->toDateString();
            }
            $document->lock_version = (int) $document->lock_version + 1;
            $document->save();

            $document->actions()->create([
                'action_type' => 'Bulk Status Update',
                'from_user_id' => $request->user()->id,
                'from_user' => $request->user()->email,
                'from_user_name' => $request->user()->name,
                'notes' => 'Bulk status update from advanced data controls.',
                'new_status' => $document->status,
            ]);

            AuditLogger::record($request->user(), 'transaction', 'documents', 'bulk_status_update', $document, $oldValues, $document->only(['status']), $request, 'info', 'Document status updated through bulk controls.');
            $updated++;
        }

        return response()->json(['data' => [
            'requested_count' => count(array_unique($data['ids'])),
            'updated_count' => $updated,
            'skipped_count' => count($skipped),
            'skipped' => $skipped,
        ]]);
    }

    public function restore(Request $request, int $document)
    {
        abort_unless(DocumentAccess::canRestore($request->user()), 403);

        $restoredDocument = Document::withTrashed()->findOrFail($document);
        $restoredDocument->restore();

        $restoredDocument->actions()->create([
            'action_type' => 'Restored',
            'from_user_id' => $request->user()->id,
            'from_user' => $request->user()->email,
            'from_user_name' => $request->user()->name,
            'notes' => 'Admin restored the deleted document.',
            'new_status' => $restoredDocument->status,
        ]);

        AuditLogger::record($request->user(), 'transaction', 'documents', 'restore', $restoredDocument, [], [], $request, 'info', 'Document restored.');

        return response()->json(['data' => $this->serializeDocument($restoredDocument->fresh('linkedDocument'), $request->user())]);
    }


    private function documentQuery(Request $request, User $user)
    {
        $sortMap = [
            'control_number' => 'control_number',
            'received_date' => 'received_date',
            'created_date' => 'created_at',
            'created_at' => 'created_at',
            'status' => 'status',
            'classification' => 'classification',
            'particulars' => 'particulars',
            'amount' => 'amount',
            'source_office' => 'source_office',
            'current_holder' => 'current_holder_name',
        ];
        $sortBy = (string) $request->query('sort_by', 'created_at');
        $sortDir = strtolower((string) $request->query('sort_dir', 'desc')) === 'asc' ? 'asc' : 'desc';
        $sortColumn = $sortMap[$sortBy] ?? 'created_at';

        return Document::query()
            ->when($request->boolean('with_deleted') && DocumentAccess::canRestore($user), fn ($query) => $query->withTrashed())
            ->with(['linkedDocument'])
            ->when($request->query('status'), fn ($query, $status) => $query->where('status', $status))
            ->when($request->query('classification'), fn ($query, $classification) => $query->where('classification', $classification))
            ->when($request->query('section'), fn ($query, $section) => $query->whereRaw('UPPER(section) = ?', [strtoupper((string) $section)]))
            ->when($request->query('date_from'), fn ($query, $date) => $query->whereDate('received_date', '>=', $date))
            ->when($request->query('date_to'), fn ($query, $date) => $query->whereDate('received_date', '<=', $date))
            ->when($request->query('control_number'), fn ($query, $value) => $query->where('control_number', 'ilike', "%{$value}%"))
            ->when($request->query('source_office'), fn ($query, $value) => $query->where('source_office', 'ilike', "%{$value}%"))
            ->when($request->query('requestor'), fn ($query, $value) => $query->where('requestor', 'ilike', "%{$value}%"))
            ->when($request->query('search'), function ($query, $search) {
                $query->where(function ($subquery) use ($search) {
                    $subquery->where('control_number', 'ilike', "%{$search}%")
                        ->orWhere('particulars', 'ilike', "%{$search}%")
                        ->orWhere('requestor', 'ilike', "%{$search}%")
                        ->orWhere('source_office', 'ilike', "%{$search}%")
                        ->orWhere('current_holder_name', 'ilike', "%{$search}%");
                });
            })
            ->orderBy($sortColumn, $sortDir);
    }

    private function requirePasswordConfirmation(Request $request): void
    {
        $data = $request->validate([
            'confirm_password' => ['required', 'string'],
        ]);

        abort_unless(Hash::check($data['confirm_password'], (string) $request->user()->password), 422, 'Password confirmation failed. The record was not archived.');
    }

    private function softDeleteDocument(Request $request, Document $document, string $notes): void
    {
        $document->actions()->create([
            'action_type' => 'Deleted',
            'from_user_id' => $request->user()->id,
            'from_user' => $request->user()->email,
            'from_user_name' => $request->user()->name,
            'notes' => $notes.' Admin users may restore it from the archive.',
            'new_status' => $document->status,
        ]);

        $document->delete();

        AuditLogger::record($request->user(), 'transaction', 'documents', 'delete', $document, [], [
            'deleted_at' => now()->toISOString(),
            'archive_restore_available' => true,
            'password_reentry_verified' => true,
        ], $request, 'warning', 'Document moved to archive by soft delete.');
    }

    private function generateControlNumber(string $receivedDate): string
    {
        $date = Carbon::parse($receivedDate);
        $prefix = $date->format('md');

        $lastControlNumber = Document::query()
            ->whereDate('received_date', $date->toDateString())
            ->where('control_number', 'like', $prefix.'%')
            ->orderByDesc('control_number')
            ->value('control_number');

        $nextSequence = $lastControlNumber ? ((int) substr($lastControlNumber, 4)) + 1 : 1;

        do {
            $candidate = $prefix.str_pad((string) $nextSequence, 3, '0', STR_PAD_LEFT);
            $nextSequence++;
        } while (Document::query()->where('control_number', $candidate)->exists());

        return $candidate;
    }

    private function mergeStoredFileIfUploaded(Request $request, array $data, string $inputName, string $folder): array
    {
        if (!$request->hasFile($inputName)) {
            return $data;
        }

        $storedFile = DocumentFileStorage::store($request->file($inputName), $folder);

        return [
            ...$data,
            ...$this->mapStoredFile($storedFile, $inputName),
        ];
    }

    private function mapStoredFile(array $storedFile, string $inputName): array
    {
        $prefix = match ($inputName) {
            'memo_file' => 'memo_file',
            'trip_ticket_file' => 'trip_ticket_file',
            default => 'file',
        };

        return [
            $prefix.'_url' => $storedFile['url'],
            $prefix.'_path' => $storedFile['path'],
            $prefix.'_name' => $storedFile['name'],
            $prefix.'_mime' => $storedFile['mime'],
            $prefix.'_size' => $storedFile['size'],
        ];
    }

    private function fileAttributesFromPayload(array $data, string $prefix): array
    {
        return array_filter([
            $prefix.'_url' => $data[$prefix.'_url'] ?? null,
            $prefix.'_path' => $data[$prefix.'_path'] ?? null,
            $prefix.'_name' => $data[$prefix.'_name'] ?? null,
            $prefix.'_mime' => $data[$prefix.'_mime'] ?? null,
            $prefix.'_size' => $data[$prefix.'_size'] ?? null,
        ], fn ($value) => $value !== null && $value !== '');
    }

    private function serializeDocument(Document $document, ?User $user = null): array
    {
        $canView = $user ? DocumentAccess::canView($user, $document) : false;
        $canAct = $user ? DocumentAccess::canAct($user, $document) : false;

        return [
            'id' => (string) $document->id,
            'control_number' => $document->control_number,
            'classification' => $document->classification,
            'section' => strtoupper((string) $document->section),
            'particulars' => $document->particulars,
            'source_office' => $document->source_office,
            'requestor' => $document->requestor,
            'amount' => $document->amount !== null ? (float) $document->amount : null,
            'received_date' => optional($document->received_date)?->format('Y-m-d'),
            'remarks' => $document->remarks,
            'status' => $document->status,
            'physical_received' => (bool) $document->physical_received,
            'file_url' => $document->file_url,
            'file_path' => $document->file_path,
            'file_name' => $document->file_name,
            'file_mime' => $document->file_mime,
            'file_size' => $document->file_size,
            'memo_file_url' => $document->memo_file_url,
            'memo_file_path' => $document->memo_file_path,
            'memo_file_name' => $document->memo_file_name,
            'memo_file_mime' => $document->memo_file_mime,
            'memo_file_size' => $document->memo_file_size,
            'trip_ticket_file_url' => $document->trip_ticket_file_url,
            'trip_ticket_file_path' => $document->trip_ticket_file_path,
            'trip_ticket_file_name' => $document->trip_ticket_file_name,
            'trip_ticket_file_mime' => $document->trip_ticket_file_mime,
            'trip_ticket_file_size' => $document->trip_ticket_file_size,
            'ocr_status' => $document->ocr_status,
            'ocr_text' => $document->ocr_text,
            'ocr_confidence' => $document->ocr_confidence,
            'extracted_fields' => $document->extracted_fields,
            'extraction_reviewed_at' => optional($document->extraction_reviewed_at)?->toISOString(),
            'return_reason' => $document->return_reason,
            'released_date' => optional($document->released_date)?->format('Y-m-d'),
            'current_holder' => $document->current_holder,
            'current_holder_name' => $document->current_holder_name,
            'current_holder_role' => $document->current_holder_role,
            'forwarded_to' => $document->forwarded_to,
            'linked_document_id' => $document->linked_document_id ? (string) $document->linked_document_id : null,
            'lock_version' => (int) $document->lock_version,
            'deleted_at' => optional($document->deleted_at)?->toISOString(),
            'can_view' => $canView,
            'can_act' => $canAct,
            'can_delete' => $user ? DocumentAccess::canDelete($user, $document) && !$document->trashed() : false,
            'can_restore' => $user ? DocumentAccess::canRestore($user) && $document->trashed() : false,
            'can_open_file' => $canView,
            'created_date' => optional($document->created_at)?->toISOString(),
            'updated_date' => optional($document->updated_at)?->toISOString(),
        ];
    }
}
