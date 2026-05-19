<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Support\SiteSettings;
use App\Support\ProfessionalPdf;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $this->ensurePrivileged($request);

        $perPage = min(100, max(10, (int) $request->query('per_page', 25)));
        $sortBy = $this->safeSortColumn((string) $request->query('sort_by', 'created_at'));
        $sortDir = strtolower((string) $request->query('sort_dir', 'desc')) === 'asc' ? 'asc' : 'desc';

        $page = $this->query($request)
            ->orderBy($sortBy, $sortDir)
            ->paginate($perPage)
            ->through(fn (AuditLog $log) => $this->serialize($log));

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'from' => $page->firstItem(),
                'to' => $page->lastItem(),
                'sort_by' => $sortBy,
                'sort_dir' => $sortDir,
            ],
        ]);
    }

    public function export(Request $request)
    {
        $this->ensurePrivileged($request);

        $format = strtolower((string) $request->query('format', 'csv'));
        $rows = $this->query($request)->latest()->limit(5000)->get();

        return match ($format) {
            'xlsx', 'excel' => $this->exportExcel($rows),
            'pdf' => $this->exportPdf($rows, $request),
            default => $this->exportCsv($rows),
        };
    }

    public function archive(Request $request)
    {
        $this->ensurePrivileged($request);

        $days = (int) $request->input('days', SiteSettings::integer('audit', 'archive_after_days', 90));
        $days = max(1, $days);
        $before = now()->subDays($days);
        $count = AuditLog::whereNull('archived_at')->where('created_at', '<', $before)->count();
        AuditLog::whereNull('archived_at')->where('created_at', '<', $before)->update(['archived_at' => now()]);

        return response()->json(['data' => ['archived_count' => $count, 'before' => $before->toDateString(), 'days' => $days]]);
    }

    public function bulkArchive(Request $request)
    {
        $this->ensurePrivileged($request);

        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:500'],
            'ids.*' => ['integer'],
        ]);

        $ids = array_values(array_unique($data['ids']));
        $count = AuditLog::whereIn('id', $ids)->whereNull('archived_at')->update(['archived_at' => now()]);

        return response()->json([
            'data' => [
                'requested_count' => count($ids),
                'archived_count' => $count,
                'summary' => "Moved {$count} audit log(s) to the archive. Archived logs remain restorable.",
            ],
        ]);
    }

    public function bulkRestore(Request $request)
    {
        $this->ensurePrivileged($request);

        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:500'],
            'ids.*' => ['integer'],
        ]);

        $ids = array_values(array_unique($data['ids']));
        $count = AuditLog::whereIn('id', $ids)->whereNotNull('archived_at')->update(['archived_at' => null]);

        return response()->json([
            'data' => [
                'requested_count' => count($ids),
                'restored_count' => $count,
                'summary' => "Restored {$count} audit log(s) from the archive.",
            ],
        ]);
    }

    private function query(Request $request)
    {
        return AuditLog::query()
            ->when(! $request->boolean('include_archived'), fn ($query) => $query->whereNull('archived_at'))
            ->when($request->query('search'), function ($query, $search) {
                $query->where(function ($subquery) use ($search) {
                    $subquery->where('user_email', 'ilike', "%{$search}%")
                        ->orWhere('message', 'ilike', "%{$search}%")
                        ->orWhere('module_name', 'ilike', "%{$search}%")
                        ->orWhere('action_name', 'ilike', "%{$search}%")
                        ->orWhere('event_type', 'ilike', "%{$search}%")
                        ->orWhere('category', 'ilike', "%{$search}%");
                });
            })
            ->when($request->query('severity'), fn ($query, $severity) => $query->where('severity', $severity))
            ->when($request->query('category'), fn ($query, $category) => $query->where('category', $category))
            ->when($request->query('module'), fn ($query, $module) => $query->where('module_name', $module))
            ->when($request->query('event_type'), fn ($query, $eventType) => $query->where('event_type', $eventType))
            ->when($request->query('source'), fn ($query, $source) => $query->where('source', $source))
            ->when($request->boolean('suspicious_only'), fn ($query) => $query->where('is_suspicious', true))
            ->when($request->query('start'), fn ($query, $start) => $query->where('created_at', '>=', Carbon::parse($start)->startOfDay()))
            ->when($request->query('end'), fn ($query, $end) => $query->where('created_at', '<=', Carbon::parse($end)->endOfDay()));
    }

    private function serialize(AuditLog $log): array
    {
        return [
            'id' => (string) $log->id,
            'user_email' => $log->user_email,
            'event_type' => $log->event_type,
            'module_name' => $log->module_name,
            'action_name' => $log->action_name,
            'severity' => $log->severity,
            'category' => $log->category ?: 'system',
            'risk_score' => (int) ($log->risk_score ?? 10),
            'source' => $log->source ?: 'application',
            'is_suspicious' => (bool) ($log->is_suspicious ?? false),
            'indicator' => data_get($log->metadata, 'indicator'),
            'metadata' => $log->metadata,
            'message' => $log->message,
            'old_values' => $log->old_values,
            'new_values' => $log->new_values,
            'ip_address' => $log->ip_address,
            'user_agent' => $log->user_agent,
            'created_date' => optional($log->created_at)?->toISOString(),
            'archived_at' => optional($log->archived_at)?->toISOString(),
            'suspicious' => (bool) ($log->is_suspicious ?? false) || in_array($log->severity, ['warning', 'critical'], true),
        ];
    }

    private function exportCsv($rows)
    {
        $handle = fopen('php://temp', 'w+');
        fputcsv($handle, ['timestamp', 'category', 'indicator', 'risk_score', 'severity', 'event_type', 'module', 'action', 'user_email', 'ip_address', 'source', 'message']);

        foreach ($rows as $log) {
            fputcsv($handle, $this->exportRow($log));
        }

        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="docutracker-audit-logs.csv"',
        ]);
    }

    private function exportExcel($rows)
    {
        $html = '<html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial,sans-serif}th{background:#14532d;color:#fff}td,th{border:1px solid #d1d5db;padding:6px}.critical{background:#fee2e2}.warning{background:#fef3c7}.info{background:#dcfce7}</style></head><body>';
        $html .= '<h2>DocTracker Categorized Audit Logs</h2><table><thead><tr>';
        foreach (['Timestamp','Category','Indicator','Risk','Severity','Event','Module','Action','User','IP','Source','Message'] as $header) {
            $html .= '<th>'.e($header).'</th>';
        }
        $html .= '</tr></thead><tbody>';
        foreach ($rows as $log) {
            $class = e((string) $log->severity);
            $html .= '<tr class="'.$class.'">';
            foreach ($this->exportRow($log) as $value) {
                $html .= '<td>'.e((string) $value).'</td>';
            }
            $html .= '</tr>';
        }
        $html .= '</tbody></table></body></html>';

        return response($html, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="docutracker-audit-logs.xls"',
        ]);
    }

    private function exportPdf($rows, ?Request $request = null)
    {
        $data = $rows->take(500)->map(fn (AuditLog $log) => [
            'time' => optional($log->created_at)?->format('Y-m-d H:i'),
            'category' => $log->category ?: 'system',
            'indicator' => data_get($log->metadata, 'indicator'),
            'risk' => (string) ($log->risk_score ?? 10),
            'severity' => $log->severity,
            'user' => $log->user_email ?: 'system',
            'message' => $log->message,
        ])->all();

        $pdf = ProfessionalPdf::table(
            'DocTracker Categorized Audit Logs',
            ['time', 'category', 'indicator', 'risk', 'severity', 'user', 'message'],
            $data,
            [
                'subtitle' => 'Audit export with categorized suspicious activity indicators preserved.',
                'footer' => 'DocuTracker Audit Logs • Admin and Developer review only',
            ]
        );

        $filename = 'docutracker-audit-logs.pdf';
        if ($request && ($request->boolean('email') || $request->query('delivery') === 'email')) {
            ProfessionalPdf::emailToUser(
                $request->user(),
                'DocuTracker PDF Export - Audit Logs',
                'Attached is the requested DocuTracker audit log PDF generated at '.now()->toDateTimeString().'.',
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

    private function makeSimplePdf(array $lines): string
    {
        $objects = [];
        $objects[] = '<< /Type /Catalog /Pages 2 0 R >>';
        $pageObjects = [];
        $contentObjects = [];
        $chunks = array_chunk($lines, 42);
        $pageCount = count($chunks);
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

    private function exportRow(AuditLog $log): array
    {
        return [
            optional($log->created_at)?->toDateTimeString(),
            $log->category ?: 'system',
            data_get($log->metadata, 'indicator'),
            (string) ($log->risk_score ?? 10),
            $log->severity,
            $log->event_type,
            $log->module_name,
            $log->action_name,
            $log->user_email ?: 'system',
            $log->ip_address,
            $log->source ?: 'application',
            $log->message,
        ];
    }

    private function safeSortColumn(string $column): string
    {
        return in_array($column, ['created_at', 'severity', 'category', 'risk_score', 'event_type', 'module_name', 'action_name', 'user_email'], true)
            ? $column
            : 'created_at';
    }

    private function ensurePrivileged(Request $request): void
    {
        $role = strtoupper((string) $request->user()->role);
        abort_unless(in_array($role, ['ADMIN', 'DEVELOPER'], true), 403);
    }
}
