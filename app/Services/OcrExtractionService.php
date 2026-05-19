<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Throwable;

class OcrExtractionService
{
    public function extract(UploadedFile $file): array
    {
        if (!config('ai.ocr.enabled')) {
            return $this->response('disabled', '', [], 0, 'OCR is disabled in the environment configuration.');
        }

        $tempDir = storage_path('app/temp/ocr/'.Str::uuid()->toString());
        File::ensureDirectoryExists($tempDir);

        $extension = strtolower($file->getClientOriginalExtension() ?: $file->extension() ?: 'upload');
        $inputPath = $tempDir.'/input.'.$extension;
        File::copy($file->getRealPath(), $inputPath);

        try {
            $text = match (true) {
                in_array($extension, ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'webp'], true) => $this->extractImageText($inputPath),
                $extension === 'pdf' => $this->extractPdfText($inputPath, $tempDir),
                default => '',
            };

            $text = $this->cleanText($text);
            $fields = $this->extractFields($text);
            $confidence = $this->estimateConfidence($text, $fields);
            $status = $text === '' ? 'failed' : ($fields === [] ? 'text_only' : 'extracted');
            $message = match ($status) {
                'failed' => 'No readable text was extracted. Check if Tesseract OCR is installed and the scan is clear.',
                'text_only' => 'Text was extracted, but no known request-form fields were detected.',
                default => 'OCR extraction completed. Review all suggested fields before saving.',
            };

            return $this->response($status, $text, $fields, $confidence, $message);
        } catch (Throwable $exception) {
            return $this->response('failed', '', [], 0, $exception->getMessage());
        } finally {
            File::deleteDirectory($tempDir);
        }
    }

    private function extractImageText(string $imagePath): string
    {
        if (!$this->isCommandAvailable((string) config('ai.ocr.tesseract_path', 'tesseract'))) {
            throw new \RuntimeException('Image OCR is unavailable because Tesseract is not installed or not in PATH. Install Tesseract or upload a searchable PDF instead.');
        }

        $tesseract = (string) config('ai.ocr.tesseract_path', 'tesseract');
        $attempts = [
            ['6', '3'],
            ['4', '3'],
            ['11', '3'],
        ];

        $bestText = '';
        $bestScore = -1;
        $lastError = '';

        foreach ($attempts as [$psm, $oem]) {
            $process = new Process([
                $tesseract,
                $imagePath,
                'stdout',
                '--psm',
                $psm,
                '--oem',
                $oem,
                '-c',
                'preserve_interword_spaces=1',
            ]);
            $process->setTimeout(90);
            $process->run();

            if (!$process->isSuccessful()) {
                $lastError = trim($process->getErrorOutput()) ?: trim($process->getOutput());
                continue;
            }

            $text = $this->cleanText($process->getOutput());
            $score = $this->scoreExtractedText($text);

            if ($score > $bestScore) {
                $bestScore = $score;
                $bestText = $text;
            }
        }

        if ($bestText === '') {
            throw new \RuntimeException('Tesseract OCR failed or is not installed. Set TESSERACT_PATH in .env if needed. '.$lastError);
        }

        return $bestText;
    }

    private function extractPdfText(string $pdfPath, string $tempDir): string
    {
        $text = $this->extractSearchablePdfText($pdfPath);
        if (mb_strlen(trim($text)) >= 30) {
            return $text;
        }

        if (
            !$this->isCommandAvailable((string) config('ai.ocr.pdftoppm_path', 'pdftoppm'))
            || !$this->isCommandAvailable((string) config('ai.ocr.tesseract_path', 'tesseract'))
        ) {
            throw new \RuntimeException('This PDF does not contain enough searchable text, and scanned-PDF OCR is unavailable because `pdftoppm` or Tesseract is missing. Install both tools or upload a searchable PDF.');
        }

        return $this->extractScannedPdfText($pdfPath, $tempDir);
    }

    private function extractSearchablePdfText(string $pdfPath): string
    {
        $pdftotext = (string) config('ai.ocr.pdftotext_path', 'pdftotext');
        if (!$this->isCommandAvailable($pdftotext)) {
            return '';
        }

        $process = new Process([$pdftotext, '-layout', $pdfPath, '-']);
        $process->setTimeout(60);
        $process->run();

        return $process->isSuccessful() ? $process->getOutput() : '';
    }

    private function extractScannedPdfText(string $pdfPath, string $tempDir): string
    {
        $pdftoppm = (string) config('ai.ocr.pdftoppm_path', 'pdftoppm');
        $prefix = $tempDir.'/page';
        $maxPages = max(1, (int) config('ai.ocr.max_pages', 3));

        $render = new Process([$pdftoppm, '-png', '-r', '200', '-f', '1', '-l', (string) $maxPages, $pdfPath, $prefix]);
        $render->setTimeout(90);
        $render->run();

        if (!$render->isSuccessful()) {
            throw new \RuntimeException('PDF OCR requires either searchable PDF text or pdftoppm + Tesseract installed locally. '.$render->getErrorOutput());
        }

        $pages = glob($prefix.'-*.png') ?: [];
        sort($pages);

        $chunks = [];
        foreach ($pages as $page) {
            $chunks[] = $this->extractImageText($page);
        }

        return implode("\n", $chunks);
    }

    private function cleanText(string $text): string
    {
        $text = preg_replace('/\r\n|\r/', "\n", $text) ?? $text;
        $text = preg_replace('/[ \t]+/', ' ', $text) ?? $text;
        $text = preg_replace('/\n{3,}/', "\n\n", $text) ?? $text;

        return trim($text);
    }

    private function extractFields(string $text): array
    {
        if ($text === '') {
            return [];
        }

        $fields = [];
        $patterns = [
            'control_number' => ['Control Number', 'Control No', 'Tracking Number', 'Document Number'],
            'received_date' => ['Date Received', 'Date Requested', 'Request Date', 'Date'],
            'classification' => ['Classification', 'Document Type', 'Type of Request', 'Request Type'],
            'section' => ['Section', 'Department', 'Assigned Section', 'Receiving Section'],
            'particulars' => ['Particulars', 'Subject', 'Purpose', 'Description'],
            'source_office' => ['Source Office', 'Office', 'Originating Office', 'Department Office'],
            'requestor' => ['Requestor', 'Requester', 'Requested By', 'Name of Requestor', 'Submitted By', 'Requesting Person', 'Full Name', 'Name'],
            'amount' => ['Amount', 'Budget', 'Estimated Amount', 'Cost', 'Total Amount', 'Amount Requested', 'Project Cost'],
            'remarks' => ['Remarks', 'Notes', 'Additional Notes'],
        ];

        foreach ($patterns as $field => $labels) {
            $value = $this->matchFieldValue($text, $field, $labels);
            if ($value === null || $value === '') {
                continue;
            }

            $value = $this->normalizeFieldValue($field, $value);
            if ($value === null || $value === '') {
                continue;
            }

            $fields[$field] = [
                'value' => $value,
                'confidence' => $this->fieldConfidence($field, $value),
            ];
        }

        if (isset($fields['classification']) && !isset($fields['section'])) {
            $section = $this->sectionFromClassification((string) $fields['classification']['value']);
            if ($section) {
                $fields['section'] = [
                    'value' => $section,
                    'confidence' => 78,
                ];
            }
        }

        return $fields;
    }

    private function matchFieldValue(string $text, string $field, array $labels): ?string
    {
        $lines = preg_split('/\n+/', $text) ?: [];
        $normalizedLabels = [];
        foreach ($labels as $label) {
            $normalizedLabels[$this->normalizeLabel($label)] = true;
        }

        foreach ($lines as $index => $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }

            $inline = $this->matchInlineFieldValue($line, $labels);
            if ($inline !== null) {
                return $inline;
            }

            $parts = preg_split('/\s*[:\-]\s*/', $line, 2);
            $candidateLabel = $parts[0] ?? '';
            if (!isset($normalizedLabels[$this->normalizeLabel($candidateLabel)])) {
                continue;
            }

            $candidateValue = trim($parts[1] ?? '');
            if ($candidateValue !== '') {
                return $candidateValue;
            }

            for ($offset = 1; $offset <= 2; $offset++) {
                $nextLine = trim($lines[$index + $offset] ?? '');
                if ($nextLine === '' || $this->looksLikeAnotherLabel($nextLine)) {
                    break;
                }

                return $nextLine;
            }
        }

        foreach ($labels as $label) {
            $quoted = preg_quote($label, '/');
            $pattern = '/(?:^|\n)\s*'.$quoted.'\s*[:\-]?\s*(.+?)(?=\n\s*(?:Control Number|Control No|Tracking Number|Document Number|Date Received|Date Requested|Request Date|Date|Classification|Document Type|Type of Request|Request Type|Section|Department|Assigned Section|Receiving Section|Particulars|Subject|Purpose|Description|Source Office|Office|Originating Office|Department Office|Requestor|Requester|Requested By|Name of Requestor|Submitted By|Amount|Budget|Estimated Amount|Cost|Remarks|Notes|Additional Notes)\s*[:\-]|\n\s*\n|$)/is';
            if (preg_match($pattern, $text, $matches)) {
                return trim($matches[1]);
            }
        }

        return $this->fallbackFieldValue($text, $field);
    }

    private function matchInlineFieldValue(string $line, array $labels): ?string
    {
        foreach ($labels as $label) {
            $pattern = '/(?:^|\b)'.preg_quote($label, '/').'\s*[:\-]?\s*(.+)$/i';
            if (preg_match($pattern, $line, $matches)) {
                $value = trim($matches[1] ?? '');
                if ($value !== '') {
                    return $value;
                }
            }
        }

        return null;
    }

    private function normalizeFieldValue(string $field, string $value): ?string
    {
        $value = trim(preg_replace('/\s+/', ' ', $value) ?? $value);
        $value = trim($value, " \t\n\r\0\x0B:_-|");

        if ($value === '' || preg_match('/^[_\-\.\s]+$/', $value)) {
            return null;
        }

        return match ($field) {
            'classification' => $this->normalizeClassification($value),
            'section' => strtoupper($value),
            'amount' => $this->normalizeAmount($value),
            'requestor' => $this->normalizeRequestor($value),
            'received_date' => $this->normalizeDate($value) ?? $value,
            default => $value,
        };
    }

    private function normalizeRequestor(string $value): ?string
    {
        $value = trim(preg_replace('/\s+/', ' ', $value) ?? $value);
        $value = preg_replace('/^(name|full name)\s*[:\-]?\s*/i', '', $value) ?? $value;
        $value = trim($value, " \t\n\r\0\x0B:_-|");

        return $value !== '' ? $value : null;
    }

    private function normalizeClassification(string $value): string
    {
        $lower = strtolower($value);
        if (str_contains($lower, 'purchase')) {
            return 'Purchase Request';
        }
        if (str_contains($lower, 'commu') || str_contains($lower, 'communication')) {
            return 'Commu Letter';
        }
        if (str_contains($lower, 'request')) {
            return 'Request Letter';
        }

        return $value;
    }

    private function sectionFromClassification(string $classification): ?string
    {
        return match ($this->normalizeClassification($classification)) {
            'Commu Letter' => 'COMMS',
            'Purchase Request' => 'PROCUREMENT',
            'Request Letter' => 'MOBILIZATION',
            default => null,
        };
    }

    private function normalizeAmount(string $value): ?string
    {
        if (preg_match('/-?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\d+(?:\.\d{2})?/', $value, $matches)) {
            $value = $matches[0];
        }

        $clean = preg_replace('/[^0-9.\-]/', '', str_replace(',', '', $value));
        if ($clean === null || $clean === '' || !is_numeric($clean)) {
            return null;
        }

        return number_format((float) $clean, 2, '.', '');
    }

    private function normalizeDate(string $value): ?string
    {
        $value = trim($value);
        foreach (['Y-m-d', 'm/d/Y', 'm-d-Y', 'F j, Y', 'M j, Y'] as $format) {
            $date = \DateTime::createFromFormat($format, $value);
            if ($date instanceof \DateTime) {
                return $date->format('Y-m-d');
            }
        }

        $timestamp = strtotime($value);
        return $timestamp ? date('Y-m-d', $timestamp) : null;
    }

    private function fieldConfidence(string $field, string $value): int
    {
        return match ($field) {
            'received_date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) ? 92 : 70,
            'classification' => in_array($value, ['Commu Letter', 'Purchase Request', 'Request Letter'], true) ? 92 : 72,
            'section' => in_array($value, ['COMMS', 'PROCUREMENT', 'MOBILIZATION'], true) ? 90 : 70,
            'amount' => is_numeric($value) ? 90 : 65,
            default => mb_strlen($value) > 2 ? 82 : 55,
        };
    }

    private function estimateConfidence(string $text, array $fields): int
    {
        if ($text === '') {
            return 0;
        }

        if ($fields === []) {
            return 35;
        }

        $fieldScores = array_map(fn (array $field) => (int) ($field['confidence'] ?? 60), $fields);
        $average = array_sum($fieldScores) / max(count($fieldScores), 1);
        $coverageBonus = min(count($fields) * 3, 18);

        return max(1, min(99, (int) round($average + $coverageBonus - 10)));
    }

    private function scoreExtractedText(string $text): int
    {
        if ($text === '') {
            return 0;
        }

        $fields = $this->extractFields($text);
        $score = $this->estimateConfidence($text, $fields) + min(mb_strlen($text), 400) / 20;

        foreach (['requestor', 'amount', 'classification', 'particulars'] as $priorityField) {
            if (isset($fields[$priorityField])) {
                $score += 12;
            }
        }

        return (int) round($score);
    }

    private function response(string $status, string $text, array $fields, int $confidence, string $message): array
    {
        $suggestions = [];
        foreach ($fields as $key => $data) {
            $suggestions[$key] = $data['value'] ?? null;
        }

        return [
            'status' => $status,
            'message' => $message,
            'text' => $text,
            'confidence' => $confidence,
            'fields' => $fields,
            'suggestions' => array_filter($suggestions, fn ($value) => $value !== null && $value !== ''),
            'capabilities' => $this->capabilities(),
        ];
    }

    private function capabilities(): array
    {
        $tesseract = $this->isCommandAvailable((string) config('ai.ocr.tesseract_path', 'tesseract'));
        $pdftotext = $this->isCommandAvailable((string) config('ai.ocr.pdftotext_path', 'pdftotext'));
        $pdftoppm = $this->isCommandAvailable((string) config('ai.ocr.pdftoppm_path', 'pdftoppm'));

        return [
            'enabled' => (bool) config('ai.ocr.enabled'),
            'image_supported' => $tesseract,
            'searchable_pdf_supported' => $pdftotext,
            'scanned_pdf_supported' => $pdftoppm && $tesseract,
        ];
    }

    private function isCommandAvailable(string $command): bool
    {
        if ($command === '') {
            return false;
        }

        if (File::exists($command)) {
            return true;
        }

        $locator = DIRECTORY_SEPARATOR === '\\' ? 'where' : 'which';
        $process = new Process([$locator, $command]);
        $process->setTimeout(10);
        $process->run();

        return $process->isSuccessful() && trim($process->getOutput()) !== '';
    }

    private function normalizeLabel(string $value): string
    {
        $value = strtolower($value);
        $value = preg_replace('/[^a-z0-9]+/', ' ', $value) ?? $value;

        return trim($value);
    }

    private function looksLikeAnotherLabel(string $line): bool
    {
        $beforeColon = preg_split('/\s*[:\-]\s*/', $line, 2)[0] ?? $line;
        $normalized = $this->normalizeLabel($beforeColon);

        $knownLabels = [
            'control number', 'control no', 'tracking number', 'document number',
            'date received', 'date requested', 'request date', 'date',
            'classification', 'document type', 'type of request', 'request type',
            'section', 'department', 'assigned section', 'receiving section',
            'particulars', 'subject', 'purpose', 'description',
            'source office', 'office', 'originating office', 'department office',
            'requestor', 'requester', 'requested by', 'name of requestor', 'submitted by', 'requesting person', 'full name', 'name',
            'amount', 'budget', 'estimated amount', 'cost', 'total amount', 'amount requested', 'project cost',
            'remarks', 'notes', 'additional notes',
        ];

        return in_array($normalized, $knownLabels, true);
    }

    private function fallbackFieldValue(string $text, string $field): ?string
    {
        if ($field === 'amount') {
            if (preg_match('/(?:amount|budget|cost|total)\s*[:\-]?\s*(?:php|phps?|pesos?|p|₱)?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\d+(?:\.\d{2})?)/i', $text, $matches)) {
                return $matches[1];
            }
        }

        if ($field === 'requestor') {
            if (preg_match('/(?:requestor|requester|requested by|submitted by|requesting person|name of requestor|full name|name)\s*[:\-]?\s*([A-Za-z][A-Za-z .,\']{2,})/i', $text, $matches)) {
                return trim($matches[1]);
            }
        }

        return null;
    }
}
