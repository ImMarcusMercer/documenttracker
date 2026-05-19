<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\Mail;

class ProfessionalPdf
{
    public static function table(string $title, array $headers, iterable $rows, array $options = []): string
    {
        $subtitle = $options['subtitle'] ?? 'Generated report from DocuTracker';
        $footer = $options['footer'] ?? 'DocuTracker • Official system-generated PDF';
        $signature = $options['signature'] ?? 'Digital signature placeholder: ______________________________';
        $rowLimit = (int) ($options['row_limit'] ?? 350);

        $normalizedRows = [];
        foreach ($rows as $row) {
            $normalizedRows[] = is_array($row) ? $row : (array) $row;
            if (count($normalizedRows) >= $rowLimit) {
                break;
            }
        }

        $lines = [
            $title,
            $subtitle,
            'Generated: '.now()->format('Y-m-d H:i:s'),
            'Rows included: '.count($normalizedRows),
            $signature,
            ' ',
            implode(' | ', array_map(fn ($header) => strtoupper((string) $header), $headers)),
        ];

        foreach ($normalizedRows as $row) {
            $lines[] = collect($headers)
                ->map(function ($header) use ($row) {
                    $value = $row[$header] ?? $row[strtolower((string) $header)] ?? $row[str_replace(' ', '_', strtolower((string) $header))] ?? '';
                    return self::clean((string) $value);
                })
                ->implode(' | ');
        }

        if (empty($normalizedRows)) {
            $lines[] = 'No records found for the selected filters.';
        }

        return self::make($lines, $footer);
    }

    public static function lines(string $title, array $lines, array $options = []): string
    {
        $footer = $options['footer'] ?? 'DocuTracker • Official system-generated PDF';
        $prefix = [
            $title,
            $options['subtitle'] ?? 'Generated report from DocuTracker',
            'Generated: '.now()->format('Y-m-d H:i:s'),
            $options['signature'] ?? 'Digital signature placeholder: ______________________________',
            ' ',
        ];

        return self::make([...$prefix, ...array_map(fn ($line) => self::clean((string) $line), $lines)], $footer);
    }

    public static function emailToUser(User $user, string $subject, string $body, string $filename, string $pdf): void
    {
        Mail::raw($body, function ($message) use ($user, $subject, $filename, $pdf) {
            $message->to($user->email, $user->name)
                ->subject($subject)
                ->attachData($pdf, $filename, ['mime' => 'application/pdf']);
        });
    }

    private static function make(array $lines, string $footer): string
    {
        $objects = [];
        $objects[] = '<< /Type /Catalog /Pages 2 0 R >>';
        $chunks = array_chunk($lines, 37);
        $pageCount = max(1, count($chunks));
        $fontObjectNumber = 3 + ($pageCount * 2);
        $kids = implode(' ', array_map(fn ($i) => (3 + ($i * 2)).' 0 R', range(0, $pageCount - 1)));
        $objects[] = '<< /Type /Pages /Kids ['.$kids.'] /Count '.$pageCount.' >>';

        foreach ($chunks as $pageIndex => $chunk) {
            $pageObjNo = 3 + ($pageIndex * 2);
            $contentObjNo = $pageObjNo + 1;
            $objects[] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '.$fontObjectNumber.' 0 R >> >> /Contents '.$contentObjNo.' 0 R >>';

            $content = "0.08 0.32 0.18 rg 0 790 595 52 re f\n";
            $content .= "0.92 0.98 0.94 rg 0 772 595 18 re f\n";
            $content .= "0.08 0.32 0.18 rg 36 765 523 1 re f\n";
            $content .= "1 1 1 rg BT /F1 9 Tf 36 824 Td (DocuTracker) Tj ET\n";
            $content .= "1 1 1 rg BT /F1 8 Tf 420 824 Td (Professional PDF Output) Tj ET\n";

            $y = 805;
            foreach ($chunk as $i => $line) {
                $safe = self::pdfEscape(mb_strimwidth(self::clean((string) $line), 0, $i === 0 ? 70 : 118, '...'));
                if ($pageIndex === 0 && $i === 0) {
                    $content .= "1 1 1 rg BT /F1 18 Tf 36 {$y} Td ({$safe}) Tj ET\n";
                    $y -= 35;
                    continue;
                }

                $fontSize = str_contains($line, ' | ') ? 7 : 9;
                $line = self::pdfEscape(mb_strimwidth(self::clean((string) $line), 0, $fontSize === 7 ? 132 : 110, '...'));
                $content .= "0 0 0 rg BT /F1 {$fontSize} Tf 36 {$y} Td ({$line}) Tj ET\n";
                $y -= $fontSize === 7 ? 15 : 18;
            }

            $pageText = 'Page '.($pageIndex + 1).' of '.$pageCount;
            $content .= "0.08 0.32 0.18 rg 36 55 523 1 re f\n";
            $content .= "0.25 0.25 0.25 rg BT /F1 8 Tf 36 38 Td (".self::pdfEscape(self::clean($footer)).") Tj ET\n";
            $content .= "0.25 0.25 0.25 rg BT /F1 8 Tf 506 38 Td (".self::pdfEscape($pageText).") Tj ET\n";

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

    private static function clean(string $value): string
    {
        $value = str_replace(["\r", "\n", "\t"], ' ', $value);
        $value = preg_replace('/\s+/', ' ', $value) ?: '';
        return trim($value);
    }

    private static function pdfEscape(string $value): string
    {
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $value);
    }
}
