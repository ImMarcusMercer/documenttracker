<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\GeminiChatService;
use Illuminate\Http\Request;

class ChatbotController extends Controller
{
    public function chat(Request $request, GeminiChatService $chatService)
    {
        $data = $request->validate([
            'message' => ['required', 'string', 'max:1000'],
            'history' => ['nullable', 'array', 'max:10'],
            'history.*.role' => ['nullable', 'string', 'max:20'],
            'history.*.content' => ['nullable', 'string', 'max:1000'],
        ]);

        $reply = $chatService->reply($request->user(), $data['message'], $data['history'] ?? []);

        return response()->json([
            'data' => $reply,
        ]);
    }
}
