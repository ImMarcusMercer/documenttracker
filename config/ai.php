<?php

return [
    'gemini' => [
        'api_key' => env('GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL', 'gemini-2.0-flash'),
        'api_url' => rtrim(env('GEMINI_API_URL', 'https://generativelanguage.googleapis.com/v1beta'), '/'),
        'timeout' => (int) env('GEMINI_TIMEOUT', 30),
    ],

    'ocr' => [
        'enabled' => filter_var(env('OCR_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
        'tesseract_path' => env('TESSERACT_PATH', 'tesseract'),
        'pdftotext_path' => env('PDFTOTEXT_PATH', 'pdftotext'),
        'pdftoppm_path' => env('PDFTOPPM_PATH', 'pdftoppm'),
        'max_pages' => (int) env('OCR_MAX_PDF_PAGES', 3),
    ],
];
