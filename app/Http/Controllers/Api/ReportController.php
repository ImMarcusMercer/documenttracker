<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Document;
use App\Models\DocumentAction;
use App\Models\ReportFavorite;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\ProfessionalPdf;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ReportController extends Controller
{
    public function index(Request $request)
    {
        $this->ensureAdmin($request);
        $type = $request->query('type', 'transaction_summary');
        [$start, $end] = $this->dateRange($request);

        $data = match ($type) {
            'user_activity' => $this->userActivity($start, $end, $request),
            'audit_trail' => $this->auditTrail($start, $end, $request),
            'system_usage' => $this->systemUsage($start, $end),
            default => $this->transactionSummary($start, $end, $request),
        };

        AuditLogger::record($request->user(), 'transaction', 'reports', 'view', null, [], ['type' => $type], $request, 'info', 'Report generated.');

        return response()->json(['data' => $data]);
    }

    public function favorites(Request $request)
    {
        $this->ensureAdmin($request);

        return response()->json([
            'data' => ReportFavorite::where('user_id', $request->user()->id)
                ->latest()
                ->get()
                ->map(fn (ReportFavorite $favorite) => [
                    'id' => (string) $favorite->id,
                    'name' => $favorite->name,
                    'report_type' => $favorite->report_type,
                    'filters' => $favorite->filters ?: [],
                    'created_date' => optional($favorite->created_at)?->toISOString(),
                ]),
        ]);
    }

    public function storeFavorite(Request $request)
    {
        $this->ensureAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'report_type' => ['required', 'string', 'max:64'],
            'filters' => ['nullable', 'array'],
        ]);

        $favorite = ReportFavorite::updateOrCreate(
            ['user_id' => $request->user()->id, 'name' => strip_tags($data['name'])],
            ['report_type' => $data['report_type'], 'filters' => $data['filters'] ?? []]
        );

        AuditLogger::record($request->user(), 'transaction', 'reports', 'favorite_saved', $favorite, [], $favorite->toArray(), $request, 'info', 'Report favorite configuration saved.');

        return response()->json(['data' => [
            'id' => (string) $favorite->id,
            'name' => $favorite->name,
            'report_type' => $favorite->report_type,
            'filters' => $favorite->filters ?: [],
            'created_date' => optional($favorite->created_at)?->toISOString(),
        ]], $favorite->wasRecentlyCreated ? 201 : 200);
    }

    public function destroyFavorite(Request $request, ReportFavorite $favorite)
    {
        $this->ensureAdmin($request);
        abort_unless($favorite->user_id === $request->user()->id, 403);

        $favorite->delete();
        AuditLogger::record($request->user(), 'transaction', 'reports', 'favorite_deleted', null, [], ['favorite_id' => $favorite->id], $request, 'warning', 'Report favorite configuration deleted.');

        return response()->json(['ok' => true]);
    }

    public function export(Request $request)
    {
        $this->ensureAdmin($request);
        $type = $request->query('type', 'transaction_summary');
        $format = strtolower((string) $request->query('format', 'csv'));
        [$start, $end] = $this->dateRange($request);

        $report = match ($type) {
            'user_activity' => $this->userActivity($start, $end, $request),
            'audit_trail' => $this->auditTrail($start, $end, $request),
            'system_usage' => $this->systemUsage($start, $end),
            default => $this->transactionSummary($start, $end, $request),
        };

        AuditLogger::record($request->user(), 'transaction', 'reports', 'export', null, [], ['type' => $type, 'format' => $format], $request, 'info', 'Report exported.');

        if ($format === 'pdf') {
            $pdf = $this->reportPdf($report, $start, $end);
            $filename = 'docutracker-'.$type.'-report.pdf';

            if ($this->wantsEmail($request)) {
                ProfessionalPdf::emailToUser(
                    $request->user(),
                    'DocuTracker PDF Report - '.$report['title'],
                    'Attached is the requested DocuTracker PDF report generated at '.now()->toDateTimeString().'.',
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

        if (in_array($format, ['xlsx', 'xls', 'excel'], true)) {
            return $this->exportExcelHtml($report, 'docutracker-'.$type.'-report.xls', $start, $end);
        }

        return $this->exportCsv($report, 'docutracker-'.$type.'-report.csv', $start, $end);
    }

    private function exportCsv(array $report, string $filename, Carbon $start, Carbon $end)
    {
        $handle = fopen('php://temp', 'w+');
        fputcsv($handle, ['DocTracker Report', $report['title']]);
        fputcsv($handle, ['Generated At', now()->toDateTimeString()]);
        fputcsv($handle, ['Date Range', $start->toDateString().' to '.$end->toDateString()]);
        fputcsv($handle, []);

        foreach ($report['sections'] as $section) {
            fputcsv($handle, [$section['heading']]);
            if (!empty($section['rows'])) {
                fputcsv($handle, array_keys($section['rows'][0]));
                foreach ($section['rows'] as $row) {
                    fputcsv($handle, array_values($row));
                }
            }
            fputcsv($handle, []);
        }

        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    private function exportExcelHtml(array $report, string $filename, Carbon $start, Carbon $end)
    {
        $html = '<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#111827}h1{color:#14532d}table{border-collapse:collapse;width:100%;margin-bottom:24px}th{background:#14532d;color:#fff}td,th{border:1px solid #d1d5db;padding:7px;text-align:left}tr:nth-child(even){background:#f8fafc}.meta{color:#64748b}</style></head><body>';
        $html .= '<h1>'.e($report['title']).'</h1><p class="meta">Generated: '.e(now()->toDateTimeString()).' • Date Range: '.e($start->toDateString().' to '.$end->toDateString()).'</p>';
        foreach ($report['sections'] as $section) {
            $html .= '<h2>'.e($section['heading']).'</h2><table><thead><tr>';
            foreach (array_keys($section['rows'][0] ?? ['message' => 'No data']) as $header) {
                $html .= '<th>'.e($header).'</th>';
            }
            $html .= '</tr></thead><tbody>';
            foreach ($section['rows'] ?: [['message' => 'No records found.']] as $row) {
                $html .= '<tr>';
                foreach ($row as $value) {
                    $html .= '<td>'.e((string) $value).'</td>';
                }
                $html .= '</tr>';
            }
            $html .= '</tbody></table>';
        }
        $html .= '</body></html>';

        return response($html, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    private function reportPdf(array $report, Carbon $start, Carbon $end): string
    {
        $lines = [
            'Date range: '.$start->toDateString().' to '.$end->toDateString(),
            ' ',
        ];

        foreach ($report['sections'] as $section) {
            $lines[] = $section['heading'];
            if (!empty($section['rows'])) {
                $headers = array_keys($section['rows'][0]);
                $lines[] = implode(' | ', $headers);
                foreach ($section['rows'] as $row) {
                    $lines[] = collect($headers)->map(fn ($header) => (string) ($row[$header] ?? ''))->implode(' | ');
                }
            } else {
                $lines[] = 'No records found.';
            }
            $lines[] = ' ';
        }

        return ProfessionalPdf::lines($report['title'], $lines, [
            'subtitle' => 'Professional report template with header/footer, generation date, page numbers, and signature placeholder.',
            'footer' => 'DocuTracker Reports • '.$start->toDateString().' to '.$end->toDateString(),
        ]);
    }

    private function userActivity(Carbon $start, Carbon $end, Request $request): array
    {
        $query = AuditLog::whereBetween('created_at', [$start, $end]);
        if ($request->query('role')) {
            $role = strtoupper($request->query('role'));
            $query->whereIn('user_email', User::where('role', $role)->pluck('email'));
        }

        return [
            'title' => 'User Activity Report',
            'sections' => [[
                'heading' => 'Activity by User',
                'rows' => $query->selectRaw('COALESCE(user_email, ?) as user_email, COUNT(*) as total_actions', ['system'])
                    ->groupBy('user_email')
                    ->orderByDesc('total_actions')
                    ->limit(50)
                    ->get()
                    ->map(fn ($row) => ['user_email' => $row->user_email ?: 'system', 'total_actions' => (int) $row->total_actions])
                    ->all(),
            ]],
        ];
    }

    private function transactionSummary(Carbon $start, Carbon $end, Request $request): array
    {
        $documents = Document::query()->whereBetween('created_at', [$start, $end]);
        if ($request->query('status')) {
            $documents->where('status', $request->query('status'));
        }
        if ($request->query('category')) {
            $documents->where('classification', $request->query('category'));
        }

        return [
            'title' => 'Transaction Summary Report',
            'sections' => [
                [
                    'heading' => 'Documents by Status',
                    'rows' => (clone $documents)->selectRaw('status, COUNT(*) as total')
                        ->groupBy('status')
                        ->orderBy('status')
                        ->get()
                        ->map(fn ($row) => ['status' => $row->status, 'total' => (int) $row->total])
                        ->all(),
                ],
                [
                    'heading' => 'Documents by Classification',
                    'rows' => (clone $documents)->selectRaw('classification, COUNT(*) as total')
                        ->groupBy('classification')
                        ->orderBy('classification')
                        ->get()
                        ->map(fn ($row) => ['classification' => $row->classification, 'total' => (int) $row->total])
                        ->all(),
                ],
            ],
        ];
    }

    private function auditTrail(Carbon $start, Carbon $end, Request $request): array
    {
        $logs = AuditLog::query()->whereBetween('created_at', [$start, $end])
            ->when($request->query('module'), fn ($query, $module) => $query->where('module_name', $module))
            ->when($request->query('action'), fn ($query, $action) => $query->where('action_name', $action))
            ->latest()
            ->limit(200)
            ->get();

        return [
            'title' => 'Audit Trail Report',
            'sections' => [[
                'heading' => 'Audit Events',
                'rows' => $logs->map(fn (AuditLog $log) => [
                    'date' => optional($log->created_at)?->toDateTimeString(),
                    'severity' => $log->severity,
                    'module' => $log->module_name,
                    'action' => $log->action_name,
                    'user' => $log->user_email,
                    'message' => $log->message,
                ])->all(),
            ]],
        ];
    }

    private function systemUsage(Carbon $start, Carbon $end): array
    {
        return [
            'title' => 'System Usage Statistics',
            'sections' => [[
                'heading' => 'Monthly Usage',
                'rows' => DocumentAction::whereBetween('created_at', [$start, $end])
                    ->selectRaw("TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as total_actions")
                    ->groupByRaw("TO_CHAR(created_at, 'YYYY-MM')")
                    ->orderBy('month')
                    ->get()
                    ->map(fn ($row) => ['month' => $row->month, 'total_actions' => (int) $row->total_actions])
                    ->all(),
            ]],
        ];
    }

    private function dateRange(Request $request): array
    {
        return [
            $request->query('start') ? Carbon::parse($request->query('start'))->startOfDay() : now()->startOfMonth(),
            $request->query('end') ? Carbon::parse($request->query('end'))->endOfDay() : now()->endOfMonth(),
        ];
    }

    private function wantsEmail(Request $request): bool
    {
        return $request->boolean('email') || $request->query('delivery') === 'email';
    }

    private function ensureAdmin(Request $request): void
    {
        abort_unless(strtoupper((string) $request->user()->role) === 'ADMIN', 403);
    }
}
