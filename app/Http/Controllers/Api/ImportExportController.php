<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Support\AuditLogger;
use App\Support\DocumentAccess;
use App\Support\ProfessionalPdf;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use ZipArchive;

class ImportExportController extends Controller
{
    private const TEMPLATE_HEADERS = [
        'control_number',
        'classification',
        'section',
        'particulars',
        'source_office',
        'requestor',
        'amount',
        'received_date',
        'status',
        'remarks',
    ];

    private const ALLOWED_STATUSES = [
        'Pending Receipt',
        'Received',
        'Forwarded',
        'Returned',
        'Released',
        'Archived',
    ];

    public function exportDocuments(Request $request)
    {
        $user = $request->user();
        $format = strtolower((string) $request->query('format', 'csv'));
        $rows = $this->documentQuery($request)->limit(5000)->get()
            ->filter(fn (Document $document) => DocumentAccess::canView($user, $document))
            ->values();
        $exportRows = $rows->map(fn (Document $document) => $this->documentExportRow($document))->values()->all();

        AuditLogger::record(
            $user,
            'transaction',
            'documents',
            'export',
            null,
            [],
            ['rows' => $rows->count(), 'format' => $format],
            $request,
            'info',
            'Documents exported.',
            ['source' => 'import_export_module']
        );

        return match ($format) {
            'xlsx', 'excel' => $this->exportXlsx($exportRows, 'docutracker-documents.xlsx'),
            'xls' => $this->exportExcelHtml($exportRows, 'docutracker-documents.xls', 'DocuTracker Documents'),
            'pdf' => $this->exportPdf($exportRows, 'docutracker-documents.pdf', 'DocuTracker Document Export', $request),
            'json' => response()->json([
                'generated_at' => now()->toISOString(),
                'row_count' => count($exportRows),
                'data' => $exportRows,
            ])->withHeaders([
                'Content-Disposition' => 'attachment; filename="docutracker-documents.json"',
            ]),
            'xml' => $this->exportXml($exportRows, 'docutracker-documents.xml'),
            default => $this->exportCsv($exportRows, 'docutracker-documents.csv'),
        };
    }

    public function template(Request $request)
    {
        $format = strtolower((string) $request->query('format', 'csv'));
        $rows = [[
            'control_number' => '',
            'classification' => 'Commu Letter',
            'section' => 'COMMS',
            'particulars' => 'Sample document subject',
            'source_office' => 'City Office',
            'requestor' => 'Juan Dela Cruz',
            'amount' => '1500.00',
            'received_date' => now()->toDateString(),
            'status' => 'Pending Receipt',
            'remarks' => 'Sample remarks',
        ]];

        return match ($format) {
            'xlsx', 'excel' => $this->exportXlsx($rows, 'docutracker-import-template.xlsx'),
            'xls' => $this->exportExcelHtml($rows, 'docutracker-import-template.xls', 'DocuTracker Import Template'),
            default => $this->exportCsv($rows, 'docutracker-import-template.csv'),
        };
    }

    public function previewImport(Request $request)
    {
        $request->validate(['file' => ['required', 'file', 'max:10240']]);

        $file = $request->file('file');
        $extension = strtolower($file->getClientOriginalExtension() ?: $file->extension());
        abort_unless(in_array($extension, ['csv', 'txt', 'xls', 'xlsx', 'xml'], true), 422, 'Only CSV, TXT, XLS, XLSX, and XML spreadsheet files are supported.');

        $rows = $this->readImportFile($file->getRealPath(), $extension);
        $validated = $this->validateRows($rows);

        AuditLogger::record(
            $request->user(),
            'transaction',
            'documents',
            'import_preview',
            null,
            [],
            [
                'file_name' => $file->getClientOriginalName(),
                'total_rows' => $validated['total_rows'],
                'success_count' => $validated['success_count'],
                'failed_count' => $validated['failed_count'],
                'duplicate_count' => $validated['duplicate_count'],
            ],
            $request,
            $validated['failed_count'] > 0 ? 'warning' : 'info',
            'Document import file previewed.',
            ['source' => 'import_export_module']
        );

        return response()->json(['data' => $validated]);
    }

    public function commitImport(Request $request)
    {
        abort_unless(in_array(strtoupper((string) $request->user()->role), ['ADMIN', 'RECEIVING', 'DEVELOPER'], true), 403);

        $data = $request->validate([
            'rows' => ['required', 'array', 'max:1000'],
            'duplicate_strategy' => ['nullable', Rule::in(['skip', 'fail'])],
        ]);

        $strategy = $data['duplicate_strategy'] ?? 'skip';
        $validated = $this->validateRows($data['rows']);
        $created = [];
        $skipped = $validated['failed_rows'];

        if ($strategy === 'fail' && $validated['failed_count'] > 0) {
            return response()->json([
                'message' => 'Import contains invalid or duplicate rows.',
                'data' => $validated,
            ], 422);
        }

        foreach ($validated['valid_rows'] as $row) {
            $controlNumber = $row['control_number'] ?: $this->generateControlNumber($row['received_date']);
            $document = Document::create([
                'control_number' => $controlNumber,
                'classification' => $row['classification'],
                'section' => strtoupper($row['section']),
                'particulars' => strip_tags($row['particulars']),
                'source_office' => $row['source_office'] ?? null,
                'requestor' => $row['requestor'] ?? null,
                'amount' => $row['amount'] ?? null,
                'received_date' => $row['received_date'],
                'remarks' => $row['remarks'] ?? null,
                'status' => $row['status'] ?: 'Pending Receipt',
                'physical_received' => false,
                'created_by_id' => $request->user()->id,
                'current_holder_id' => $request->user()->id,
                'current_holder' => $request->user()->email,
                'current_holder_name' => $request->user()->name,
                'current_holder_role' => strtoupper((string) $request->user()->role),
            ]);
            $created[] = $document;
        }

        $summary = [
            'requested_count' => $validated['total_rows'],
            'created_count' => count($created),
            'skipped_count' => count($skipped),
            'failed_count' => $validated['failed_count'],
            'duplicate_count' => $validated['duplicate_count'],
            'failed_rows' => $skipped,
        ];

        AuditLogger::record(
            $request->user(),
            'transaction',
            'documents',
            'import_commit',
            null,
            [],
            $summary,
            $request,
            count($skipped) > 0 ? 'warning' : 'info',
            'Bulk document import committed.',
            ['source' => 'import_export_module']
        );

        return response()->json(['data' => $summary]);
    }

    public function errorReport(Request $request)
    {
        $data = $request->validate(['rows' => ['required', 'array']]);
        $headers = ['row', 'control_number', 'classification', 'section', 'particulars', 'source_office', 'requestor', 'amount', 'received_date', 'status', 'errors', 'warnings', 'recommended_action'];
        $reportRows = collect($data['rows'])->map(function ($row) {
            return [
                'row' => $row['row_number'] ?? '',
                'control_number' => $row['control_number'] ?? '',
                'classification' => $row['classification'] ?? '',
                'section' => $row['section'] ?? '',
                'particulars' => $row['particulars'] ?? '',
                'source_office' => $row['source_office'] ?? '',
                'requestor' => $row['requestor'] ?? '',
                'amount' => $row['amount'] ?? '',
                'received_date' => $row['received_date'] ?? '',
                'status' => $row['status'] ?? '',
                'errors' => implode('; ', $row['errors'] ?? []),
                'warnings' => implode('; ', $row['warnings'] ?? []),
                'recommended_action' => $row['recommended_action'] ?? 'Correct row then re-import.',
            ];
        })->all();

        return $this->exportCsvWithHeaders($reportRows, $headers, 'docutracker-import-errors.csv');
    }

    private function documentQuery(Request $request)
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
        $sortColumn = $sortMap[(string) $request->query('sort_by', 'created_at')] ?? 'created_at';
        $sortDir = strtolower((string) $request->query('sort_dir', 'desc')) === 'asc' ? 'asc' : 'desc';

        return Document::query()
            ->when($request->query('id'), fn ($query, $id) => $query->where('id', $id))
            ->when($request->query('status'), fn ($query, $status) => $query->where('status', $status))
            ->when($request->query('classification'), fn ($query, $classification) => $query->where('classification', $classification))
            ->when($request->query('section'), fn ($query, $section) => $query->where('section', $section))
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
                        ->orWhere('source_office', 'ilike', "%{$search}%");
                });
            })
            ->orderBy($sortColumn, $sortDir);
    }

    private function documentExportRow(Document $document): array
    {
        return [
            'control_number' => $document->control_number,
            'classification' => $document->classification,
            'section' => $document->section,
            'particulars' => $document->particulars,
            'source_office' => $document->source_office,
            'requestor' => $document->requestor,
            'amount' => $document->amount,
            'received_date' => optional($document->received_date)?->format('Y-m-d'),
            'status' => $document->status,
            'current_holder' => $document->current_holder,
            'created_at' => optional($document->created_at)?->toDateTimeString(),
        ];
    }

    private function readImportFile(string $path, string $extension): array
    {
        return match ($extension) {
            'xlsx' => $this->readXlsx($path),
            'xls', 'xml' => $this->readExcelXmlOrHtml($path),
            default => $this->readCsv($path),
        };
    }

    private function readCsv(string $path): array
    {
        $handle = fopen($path, 'r');
        abort_if($handle === false, 422, 'Unable to read import file.');

        $header = $this->normalizeHeaders(fgetcsv($handle) ?: []);
        $this->validateHeader($header);
        $rows = [];
        $rowNumber = 1;

        while (($line = fgetcsv($handle)) !== false) {
            $rowNumber++;
            if (count(array_filter($line, fn ($value) => $value !== null && trim((string) $value) !== '')) === 0) {
                continue;
            }
            $values = array_slice(array_pad($line, count($header), null), 0, count($header));
            $mapped = array_combine($header, $values) ?: [];
            $rows[] = ['row_number' => $rowNumber, ...$this->normalizeRow($mapped)];
        }

        fclose($handle);
        return $rows;
    }

    private function readExcelXmlOrHtml(string $path): array
    {
        $content = file_get_contents($path);
        abort_if($content === false, 422, 'Unable to read Excel import file.');

        $tableRows = [];
        if (preg_match_all('/<tr[^>]*>(.*?)<\/tr>/is', $content, $rowMatches)) {
            foreach ($rowMatches[1] as $rowHtml) {
                preg_match_all('/<t[dh][^>]*>(.*?)<\/t[dh]>/is', $rowHtml, $cellMatches);
                $tableRows[] = array_map(fn ($cell) => html_entity_decode(trim(strip_tags($cell))), $cellMatches[1] ?? []);
            }
        } else {
            $xml = @simplexml_load_string($content);
            abort_if($xml === false, 422, 'Unsupported XLS/XML file. Use the exported Excel template or CSV template.');
            $xml->registerXPathNamespace('ss', 'urn:schemas-microsoft-com:office:spreadsheet');
            foreach ($xml->xpath('//ss:Row') ?: [] as $row) {
                $line = [];
                foreach ($row->xpath('ss:Cell/ss:Data') ?: [] as $cell) {
                    $line[] = trim((string) $cell);
                }
                $tableRows[] = $line;
            }
        }

        return $this->rowsFromTable($tableRows);
    }

    private function readXlsx(string $path): array
    {
        abort_unless(class_exists(ZipArchive::class), 422, 'XLSX import requires the PHP zip extension. Install php-zip or use CSV.');

        $zip = new ZipArchive();
        abort_unless($zip->open($path) === true, 422, 'Unable to open XLSX file.');

        $sharedStrings = [];
        $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
        $xlsxNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
        if ($sharedXml !== false) {
            $shared = @simplexml_load_string($sharedXml);
            if ($shared !== false) {
                foreach ($shared->children($xlsxNs)->si as $si) {
                    $siChildren = $si->children($xlsxNs);
                    $parts = [];
                    if (isset($siChildren->t)) {
                        $parts[] = (string) $siChildren->t;
                    }
                    foreach ($siChildren->r ?? [] as $run) {
                        $parts[] = (string) ($run->children($xlsxNs)->t ?? '');
                    }
                    $sharedStrings[] = implode('', $parts);
                }
            }
        }

        $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
        abort_if($sheetXml === false, 422, 'XLSX file does not contain xl/worksheets/sheet1.xml.');
        $sheet = @simplexml_load_string($sheetXml);
        abort_if($sheet === false, 422, 'Unable to parse XLSX sheet.');

        $tableRows = [];
        $sheetChildren = $sheet->children($xlsxNs);
        foreach ($sheetChildren->sheetData->children($xlsxNs)->row as $row) {
            $line = [];
            $lastIndex = 0;
            foreach ($row->children($xlsxNs)->c as $cell) {
                $cellChildren = $cell->children($xlsxNs);
                $reference = (string) $cell['r'];
                $index = $reference ? $this->columnIndexFromCellReference($reference) : $lastIndex;
                while ($lastIndex < $index) {
                    $line[] = '';
                    $lastIndex++;
                }
                $type = (string) $cell['t'];
                if ($type === 's') {
                    $line[] = $sharedStrings[(int) $cellChildren->v] ?? '';
                } elseif ($type === 'inlineStr') {
                    $line[] = (string) ($cellChildren->is->children($xlsxNs)->t ?? '');
                } else {
                    $line[] = (string) ($cellChildren->v ?? '');
                }
                $lastIndex++;
            }
            $tableRows[] = $line;
        }

        $zip->close();
        return $this->rowsFromTable($tableRows);
    }

    private function rowsFromTable(array $tableRows): array
    {
        $tableRows = array_values(array_filter($tableRows, fn ($row) => count(array_filter($row, fn ($cell) => trim((string) $cell) !== '')) > 0));
        abort_if(count($tableRows) < 1, 422, 'Import file is empty.');

        $header = $this->normalizeHeaders(array_shift($tableRows));
        $this->validateHeader($header);
        $rows = [];

        foreach ($tableRows as $index => $line) {
            if (count(array_filter($line, fn ($value) => $value !== null && trim((string) $value) !== '')) === 0) {
                continue;
            }
            $values = array_slice(array_pad($line, count($header), null), 0, count($header));
            $mapped = array_combine($header, $values) ?: [];
            $rows[] = ['row_number' => $index + 2, ...$this->normalizeRow($mapped)];
        }

        return $rows;
    }

    private function validateRows(array $rows): array
    {
        $validRows = [];
        $failedRows = [];
        $seenSignatures = [];
        $duplicateCount = 0;

        foreach ($rows as $index => $rawRow) {
            $row = $this->normalizeRow($rawRow);
            $row['row_number'] = $rawRow['row_number'] ?? ($index + 2);

            $validator = Validator::make($row, [
                'control_number' => ['nullable', 'string', 'max:32'],
                'classification' => ['required', 'string', 'max:64'],
                'section' => ['required', 'string', 'max:32'],
                'particulars' => ['required', 'string', 'max:2000'],
                'source_office' => ['nullable', 'string', 'max:255'],
                'requestor' => ['nullable', 'string', 'max:255'],
                'amount' => ['nullable', 'numeric', 'min:0', 'max:999999999999.99'],
                'received_date' => ['required', 'date'],
                'status' => ['nullable', Rule::in(self::ALLOWED_STATUSES)],
                'remarks' => ['nullable', 'string', 'max:4000'],
            ]);

            $isStructurallyValid = $validator->passes();
            $errors = $validator->errors()->all();
            $warnings = [];
            $duplicate = false;
            $signature = $this->duplicateSignature($row);

            if (isset($seenSignatures[$signature])) {
                $errors[] = 'Duplicate row found inside the import file.';
                $duplicate = true;
            }
            $seenSignatures[$signature] = true;

            if (!empty($row['control_number']) && Document::where('control_number', $row['control_number'])->exists()) {
                $errors[] = 'Control number already exists in the system.';
                $duplicate = true;
            }

            if ($isStructurallyValid && !empty($row['particulars']) && !empty($row['received_date'])) {
                $existing = Document::query()
                    ->where('particulars', $row['particulars'])
                    ->whereDate('received_date', Carbon::parse($row['received_date'])->toDateString())
                    ->when(!empty($row['requestor']), fn ($query) => $query->where('requestor', $row['requestor']))
                    ->exists();
                if ($existing) {
                    $errors[] = 'Possible duplicate document already exists with the same subject/date/requestor.';
                    $duplicate = true;
                }
            }

            if ($duplicate) {
                $duplicateCount++;
            }

            if (!empty($row['remarks']) && $row['remarks'] !== strip_tags($row['remarks'])) {
                $warnings[] = 'HTML tags in remarks will be stripped during import.';
            }

            if ($errors) {
                $failedRows[] = [
                    ...$row,
                    'errors' => array_values(array_unique($errors)),
                    'warnings' => $warnings,
                    'is_duplicate' => $duplicate,
                    'recommended_action' => $duplicate ? 'Review duplicate, change control number/details, or skip.' : 'Correct row then re-import.',
                ];
            } else {
                $validated = $validator->validated();
                $validated['control_number'] = $validated['control_number'] ?? null;
                $validated['status'] = $validated['status'] ?? 'Pending Receipt';
                $validated['remarks'] = isset($validated['remarks']) ? strip_tags($validated['remarks']) : null;
                $validated['warnings'] = $warnings;
                $validated['row_number'] = $row['row_number'];
                $validRows[] = $validated;
            }
        }

        return [
            'total_rows' => count($rows),
            'success_count' => count($validRows),
            'failed_count' => count($failedRows),
            'duplicate_count' => $duplicateCount,
            'valid_rows' => $validRows,
            'failed_rows' => $failedRows,
            'supported_formats' => ['csv', 'xls', 'xlsx'],
            'duplicate_policy' => 'Duplicates are detected during preview and skipped unless corrected.',
        ];
    }

    private function generateControlNumber(string $receivedDate): string
    {
        $date = Carbon::parse($receivedDate);
        $prefix = $date->format('md');
        $lastControlNumber = Document::whereDate('received_date', $date->toDateString())
            ->where('control_number', 'like', $prefix.'%')
            ->orderByDesc('control_number')
            ->value('control_number');
        $nextSequence = $lastControlNumber ? ((int) substr($lastControlNumber, 4)) + 1 : 1;

        do {
            $candidate = $prefix.str_pad((string) $nextSequence, 3, '0', STR_PAD_LEFT);
            $nextSequence++;
        } while (Document::where('control_number', $candidate)->exists());

        return $candidate;
    }

    private function normalizeHeaders(array $headers): array
    {
        return array_map(function ($header) {
            $header = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header);
            $header = strtolower(trim($header));
            $header = str_replace([' ', '-', '.'], '_', $header);
            return $header;
        }, $headers);
    }

    private function validateHeader(array $header): void
    {
        $missing = array_diff(['classification', 'section', 'particulars', 'received_date'], $header);
        abort_if($missing, 422, 'Import file is missing required column(s): '.implode(', ', $missing).'. Download the latest template and try again.');
    }

    private function normalizeRow(array $row): array
    {
        $normalized = [];
        foreach (self::TEMPLATE_HEADERS as $header) {
            $value = $row[$header] ?? '';
            $normalized[$header] = is_string($value) ? trim($value) : $value;
        }
        if ($normalized['status'] === '') {
            $normalized['status'] = 'Pending Receipt';
        }
        if ($normalized['amount'] === '') {
            $normalized['amount'] = null;
        }
        if ($normalized['control_number'] === '') {
            $normalized['control_number'] = null;
        }
        return $normalized;
    }

    private function duplicateSignature(array $row): string
    {
        return strtolower(implode('|', [
            $row['control_number'] ?: '',
            $row['classification'] ?? '',
            $row['section'] ?? '',
            $row['particulars'] ?? '',
            $row['received_date'] ?? '',
            $row['requestor'] ?? '',
        ]));
    }

    private function columnIndexFromCellReference(string $reference): int
    {
        preg_match('/^[A-Z]+/i', $reference, $matches);
        $letters = strtoupper($matches[0] ?? 'A');
        $index = 0;
        foreach (str_split($letters) as $char) {
            $index = ($index * 26) + (ord($char) - 64);
        }
        return max(0, $index - 1);
    }

    private function exportCsv(array $rows, string $filename)
    {
        $headers = $rows ? array_keys($rows[0]) : self::TEMPLATE_HEADERS;
        return $this->exportCsvWithHeaders($rows, $headers, $filename);
    }

    private function exportCsvWithHeaders(array $rows, array $headers, string $filename)
    {
        $handle = fopen('php://temp', 'w+');
        fputcsv($handle, $headers);
        foreach ($rows as $row) {
            fputcsv($handle, array_map(fn ($header) => $row[$header] ?? '', $headers));
        }
        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    private function exportExcelHtml(array $rows, string $filename, string $title)
    {
        $headers = $rows ? array_keys($rows[0]) : self::TEMPLATE_HEADERS;
        $html = '<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;width:100%}th{background:#14532d;color:#fff}td,th{border:1px solid #d1d5db;padding:7px}tr:nth-child(even){background:#f8fafc}</style></head><body>';
        $html .= '<h2>'.e($title).'</h2><p>Generated: '.e(now()->toDateTimeString()).'</p><table><thead><tr>';
        foreach ($headers as $header) {
            $html .= '<th>'.e($header).'</th>';
        }
        $html .= '</tr></thead><tbody>';
        foreach ($rows as $row) {
            $html .= '<tr>';
            foreach ($headers as $header) {
                $html .= '<td>'.e((string) ($row[$header] ?? '')).'</td>';
            }
            $html .= '</tr>';
        }
        $html .= '</tbody></table></body></html>';

        return response($html, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    private function exportXlsx(array $rows, string $filename)
    {
        if (!class_exists(ZipArchive::class)) {
            return $this->exportExcelHtml($rows, str_replace('.xlsx', '.xls', $filename), 'DocuTracker Spreadsheet Export');
        }

        $headers = $rows ? array_keys($rows[0]) : self::TEMPLATE_HEADERS;
        $tempPath = storage_path('app/temp/'.uniqid('xlsx_', true).'.xlsx');
        Storage::disk('local')->makeDirectory('temp');

        $zip = new ZipArchive();
        abort_unless($zip->open($tempPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true, 500, 'Unable to create XLSX export.');
        $zip->addFromString('[Content_Types].xml', $this->xlsxContentTypes());
        $zip->addFromString('_rels/.rels', $this->xlsxRootRels());
        $zip->addFromString('xl/workbook.xml', $this->xlsxWorkbook());
        $zip->addFromString('xl/_rels/workbook.xml.rels', $this->xlsxWorkbookRels());
        $zip->addFromString('xl/styles.xml', $this->xlsxStyles());
        $zip->addFromString('xl/worksheets/sheet1.xml', $this->xlsxSheetXml($headers, $rows));
        $zip->close();

        return response()->download($tempPath, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend(true);
    }

    private function exportPdf(array $rows, string $filename, string $title, ?Request $request = null)
    {
        $headers = $rows ? array_keys($rows[0]) : self::TEMPLATE_HEADERS;
        $visibleHeaders = array_slice($headers, 0, 8);
        $pdf = ProfessionalPdf::table($title, $visibleHeaders, array_slice($rows, 0, 500), [
            'subtitle' => 'Official document export with themed header/footer, generation date, page numbers, and signature placeholder.',
            'footer' => 'DocuTracker Document Export • Data analysis, migration, official reporting, and printing',
        ]);

        if ($request && ($request->boolean('email') || $request->query('delivery') === 'email')) {
            ProfessionalPdf::emailToUser(
                $request->user(),
                'DocuTracker PDF Export - Documents',
                'Attached is the requested DocuTracker document export PDF generated at '.now()->toDateTimeString().'.',
                $filename,
                $pdf
            );

            return response()->json(['data' => ['emailed' => true, 'filename' => $filename, 'recipient' => $request->user()->email]]);
        }

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    private function exportXml(array $rows, string $filename)
    {
        $xml = new \SimpleXMLElement('<documents/>');
        $xml->addAttribute('generated_at', now()->toISOString());
        foreach ($rows as $row) {
            $node = $xml->addChild('document');
            foreach ($row as $key => $value) {
                $node->addChild($key, htmlspecialchars((string) $value));
            }
        }

        return response($xml->asXML(), 200, [
            'Content-Type' => 'application/xml; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    private function xlsxSheetXml(array $headers, array $rows): string
    {
        $sheetRows = [];
        $sheetRows[] = $headers;
        foreach ($rows as $row) {
            $sheetRows[] = array_map(fn ($header) => $row[$header] ?? '', $headers);
        }

        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
        foreach ($sheetRows as $rowIndex => $row) {
            $xml .= '<row r="'.($rowIndex + 1).'">';
            foreach (array_values($row) as $columnIndex => $value) {
                $cell = $this->cellReference($columnIndex, $rowIndex + 1);
                $style = $rowIndex === 0 ? ' s="1"' : '';
                $xml .= '<c r="'.$cell.'" t="inlineStr"'.$style.'><is><t>'.htmlspecialchars((string) $value).'</t></is></c>';
            }
            $xml .= '</row>';
        }
        $xml .= '</sheetData></worksheet>';
        return $xml;
    }

    private function cellReference(int $columnIndex, int $rowNumber): string
    {
        $letters = '';
        $column = $columnIndex + 1;
        while ($column > 0) {
            $remainder = ($column - 1) % 26;
            $letters = chr(65 + $remainder).$letters;
            $column = intdiv($column - $remainder - 1, 26);
        }
        return $letters.$rowNumber;
    }

    private function xlsxContentTypes(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
    }

    private function xlsxRootRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    }

    private function xlsxWorkbook(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Documents" sheetId="1" r:id="rId1"/></sheets></workbook>';
    }

    private function xlsxWorkbookRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    }

    private function xlsxStyles(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF14532D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>';
    }

    private function makeSimplePdf(array $lines): string
    {
        $objects = [];
        $objects[] = '<< /Type /Catalog /Pages 2 0 R >>';
        $chunks = array_chunk($lines, 42);
        $pageCount = max(1, count($chunks));
        $fontObjectNumber = 3 + ($pageCount * 2);
        $objects[] = '<< /Type /Pages /Kids ['.implode(' ', array_map(fn ($i) => (3 + ($i * 2)).' 0 R', range(0, $pageCount - 1))).'] /Count '.$pageCount.' >>';

        foreach ($chunks as $pageIndex => $chunk) {
            $pageObjNo = 3 + ($pageIndex * 2);
            $contentObjNo = $pageObjNo + 1;
            $objects[] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '.$fontObjectNumber.' 0 R >> >> /Contents '.$contentObjNo.' 0 R >>';
            $content = "0.08 0.32 0.18 rg 0 790 595 52 re f\n";
            $y = 816;
            foreach ($chunk as $i => $line) {
                $safe = $this->pdfEscape(mb_strimwidth($line, 0, 118, '...'));
                if ($pageIndex === 0 && $i === 0) {
                    $content .= "1 1 1 rg BT /F1 18 Tf 36 {$y} Td ({$safe}) Tj ET\n";
                    $y -= 30;
                    continue;
                }
                $content .= "0 0 0 rg BT /F1 8 Tf 36 {$y} Td ({$safe}) Tj ET\n";
                $y -= 17;
            }
            $content .= "0.35 0.35 0.35 rg BT /F1 8 Tf 520 24 Td (Page ".($pageIndex + 1)." of {$pageCount}) Tj ET\n";
            $objects[] = '<< /Length '.strlen($content).' >>' . "\nstream\n".$content."endstream";
        }

        $objects[] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
        $pdf = "%PDF-1.4\n";
        $offsets = [0];
        foreach ($objects as $index => $object) {
            $offsets[] = strlen($pdf);
            $number = $index + 1;
            $pdf .= "{$number} 0 obj\n{$object}\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 ".(count($objects) + 1)."\n0000000000 65535 f \n";
        for ($i = 1; $i <= count($objects); $i++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
        }
        $pdf .= "trailer\n<< /Size ".(count($objects) + 1)." /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";
        return $pdf;
    }

    private function pdfEscape(string $value): string
    {
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $value);
    }
}
