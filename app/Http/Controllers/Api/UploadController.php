<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\DocumentFileStorage;
use Illuminate\Http\Request;

class UploadController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:pdf,doc,docx,jpg,jpeg,png', 'max:10240'],
            'category' => ['nullable', 'string', 'in:documents,memorandums,trip-tickets'],
        ]);

        $storedFile = DocumentFileStorage::store(
            $data['file'],
            $data['category'] ?? 'documents'
        );

        return response()->json([
            'file_url' => $storedFile['url'],
            'file_path' => $storedFile['path'],
            'file_name' => $storedFile['name'],
            'file_mime' => $storedFile['mime'],
            'file_size' => $storedFile['size'],
        ], 201);
    }
}
