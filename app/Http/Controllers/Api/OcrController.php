<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\OcrExtractionService;
use App\Support\DocumentAccess;
use Illuminate\Http\Request;

class OcrController extends Controller
{
    public function extract(Request $request, OcrExtractionService $ocr)
    {
        abort_unless(DocumentAccess::canUseOcr($request->user()), 403);

        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,tif,tiff,bmp,webp', 'max:10240'],
        ]);

        return response()->json([
            'data' => $ocr->extract($data['file']),
        ]);
    }
}
