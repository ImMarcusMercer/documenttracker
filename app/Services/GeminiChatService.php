<?php

namespace App\Services;

use App\Models\Document;
use App\Models\User;
use App\Support\DocumentAccess;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

class GeminiChatService
{
    public function reply(User $user, string $message, array $history = []): array
    {
        $message = trim($message);
        $visibleDocuments = $this->visibleDocuments($user, $message);

        if (!$this->isInScope($message, $visibleDocuments)) {
            return [
                'reply' => 'I can only help with DocuTracker topics such as document status, workflow steps, forwarding, approval, releasing, OCR extraction, and basic system use.',
                'provider' => 'system-guard',
            ];
        }

        $apiKey = (string) config('ai.gemini.api_key');
        if ($apiKey === '') {
            return [
                'reply' => $this->localFallback($user, $message, $visibleDocuments),
                'provider' => 'local-fallback',
            ];
        }

        $context = $this->buildContext($user, $visibleDocuments);
        $systemInstruction = $this->systemInstruction();
        $payload = [
            'systemInstruction' => [
                'parts' => [
                    ['text' => $systemInstruction],
                ],
            ],
            'contents' => $this->buildContents($history, $message, $context),
            'generationConfig' => [
                'temperature' => 0.2,
                'maxOutputTokens' => 700,
            ],
        ];

        try {
            $model = (string) config('ai.gemini.model', 'gemini-2.0-flash');
            $apiUrl = rtrim((string) config('ai.gemini.api_url'), '/');
            $response = Http::withHeaders([
                'x-goog-api-key' => $apiKey,
                'Content-Type' => 'application/json',
            ])
                ->timeout((int) config('ai.gemini.timeout', 30))
                ->post($apiUrl.'/models/'.$model.':generateContent', $payload);

            if (!$response->successful()) {
                return [
                    'reply' => $this->localFallback($user, $message, $visibleDocuments).'\n\nGemini could not be reached or rejected the request. Check GEMINI_API_KEY and GEMINI_MODEL in .env.',
                    'provider' => 'local-fallback',
                ];
            }

            $reply = data_get($response->json(), 'candidates.0.content.parts.0.text');
            if (!is_string($reply) || trim($reply) === '') {
                return [
                    'reply' => $this->localFallback($user, $message, $visibleDocuments),
                    'provider' => 'local-fallback',
                ];
            }

            return [
                'reply' => trim($reply),
                'provider' => 'gemini',
            ];
        } catch (Throwable) {
            return [
                'reply' => $this->localFallback($user, $message, $visibleDocuments).'\n\nGemini is temporarily unavailable. The answer above uses the local DocuTracker fallback.',
                'provider' => 'local-fallback',
            ];
        }
    }

    private function visibleDocuments(User $user, string $message): Collection
    {
        $controlNumber = $this->extractControlNumber($message);

        $query = Document::query()->with('actions');
        if ($controlNumber) {
            $query->where('control_number', $controlNumber);
        } else {
            $query->latest()->limit(12);
        }

        return $query->get()
            ->filter(fn (Document $document) => DocumentAccess::canView($user, $document))
            ->values();
    }

    private function extractControlNumber(string $message): ?string
    {
        if (preg_match('/\b\d{7}\b/', $message, $matches)) {
            return $matches[0];
        }

        if (preg_match('/\b\d{4}\d{3}\b/', $message, $matches)) {
            return $matches[0];
        }

        return null;
    }

    private function isInScope(string $message, Collection $visibleDocuments): bool
    {
        $lower = Str::lower($message);

        if (preg_match('/^(hi|hello|hey|good\s+(morning|afternoon|evening))\b/i', $message)) {
            return true;
        }

        if ($visibleDocuments->isNotEmpty()) {
            return true;
        }

        $keywords = [
            'document', 'docu', 'tracking', 'status', 'control', 'request', 'form', 'approval', 'approve',
            'receiving', 'release', 'releasing', 'forward', 'return', 'mayor', 'signature', 'office',
            'pending', 'process', 'workflow', 'ocr', 'extract', 'upload', 'memo', 'trip ticket', 'section',
        ];

        foreach ($keywords as $keyword) {
            if (str_contains($lower, $keyword)) {
                return true;
            }
        }

        return false;
    }

    private function buildContext(User $user, Collection $documents): string
    {
        $lines = [
            'Current user:',
            '- Name: '.$user->name,
            '- Email: '.$user->email,
            '- Role: '.strtoupper((string) $user->role),
            '- Section: '.strtoupper((string) $user->section),
            '',
            'DocuTracker workflow summary:',
            'Receiving creates and logs the document, forwards it to the concerned section, the section reviews/processes it, the section forwards it to Mayor/OIC/highest authority for approval, and approved documents go to Records/Releasing for final release.',
            '',
            'Visible document context. Only use these records. If the answer is not present here, say it is not available to this user.',
        ];

        if ($documents->isEmpty()) {
            $lines[] = '- No matching visible documents were found.';
        }

        foreach ($documents as $document) {
            $lastAction = $document->actions->sortByDesc('created_at')->first();
            $lines[] = sprintf(
                '- Control Number: %s | Status: %s | Classification: %s | Section: %s | Particulars: %s | Requestor: %s | Current Holder: %s (%s) | Last Action: %s%s',
                $document->control_number,
                $document->status,
                $document->classification,
                $document->section,
                Str::limit((string) $document->particulars, 160),
                $document->requestor ?: 'N/A',
                $document->current_holder_name ?: 'N/A',
                $document->current_holder_role ?: 'N/A',
                $lastAction?->action_type ?: 'None',
                $lastAction ? ' on '.$lastAction->created_at?->format('Y-m-d H:i') : ''
            );
        }

        return implode("\n", $lines);
    }

    private function buildContents(array $history, string $message, string $context): array
    {
        $contents = [];

        $safeHistory = array_slice($history, -6);
        foreach ($safeHistory as $entry) {
            $role = ($entry['role'] ?? '') === 'assistant' ? 'model' : 'user';
            $text = trim((string) ($entry['content'] ?? ''));
            if ($text === '') {
                continue;
            }
            $contents[] = [
                'role' => $role,
                'parts' => [['text' => Str::limit($text, 1000, '')]],
            ];
        }

        $contents[] = [
            'role' => 'user',
            'parts' => [[
                'text' => "System data available to answer this question:\n".$context."\n\nUser question:\n".$message,
            ]],
        ];

        return $contents;
    }

    private function systemInstruction(): string
    {
        return implode("\n", [
            'You are the DocuTracker Assistant inside a municipal document tracking system.',
            'Scope: answer only about DocuTracker workflow, document status, routing, approval, releasing, OCR/data extraction, and basic system usage.',
            'Use only the server-provided context. Do not invent document records, users, approvals, or dates.',
            'Respect role-based access. If a document is not provided in context, say it is unavailable to the current user.',
            'Never request, reveal, or infer API keys, passwords, database credentials, or hidden configuration.',
            'Keep answers concise, clear, and operational.',
        ]);
    }

    private function localFallback(User $user, string $message, Collection $documents): string
    {
        if ($documents->count() === 1) {
            /** @var Document $document */
            $document = $documents->first();
            $lastAction = $document->actions->sortByDesc('created_at')->first();
            $lines = [
                'Document '.$document->control_number.' is currently marked as '.$document->status.'.',
                'Current holder: '.($document->current_holder_name ?: 'N/A').' ('.($document->current_holder_role ?: 'N/A').').',
                'Section: '.$document->section.'.',
            ];
            if ($lastAction) {
                $lines[] = 'Latest action: '.$lastAction->action_type.' on '.$lastAction->created_at?->format('Y-m-d H:i').'.';
            }
            return implode(' ', $lines);
        }

        if (Str::contains(Str::lower($message), ['workflow', 'flow', 'approval', 'approve', 'process'])) {
            return 'The normal DocuTracker flow is: Receiving logs the document, Receiving forwards it to the concerned section, the section receives and reviews it, the section processes and uploads required files, the section forwards it to Mayor/OIC for approval, then approved documents go to Records/Releasing for final release.';
        }

        if (Str::contains(Str::lower($message), ['ocr', 'extract', 'scan'])) {
            return 'For OCR, upload a clear JPG, PNG, or PDF request form on the New Document page, click Extract with OCR, review the suggested fields, then save only after verifying the values.';
        }

        return 'I can help with document status, control-number lookup, forwarding, approval, releasing, OCR extraction, and basic DocuTracker workflow questions. Include a control number like 0518001 for a specific tracking answer.';
    }
}
