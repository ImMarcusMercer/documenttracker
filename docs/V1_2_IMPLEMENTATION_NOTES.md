# DocuTracker v1.2 Implementation Notes

## OCR and Data Extraction

Server-side files added:

- `app/Services/OcrExtractionService.php`
- `app/Http/Controllers/Api/OcrController.php`
- `database/migrations/2026_05_18_210000_add_ocr_fields_to_documents_table.php`

Frontend files changed:

- `resources/js/pages/NewDocument.jsx`
- `resources/js/api/base44Client.js`

The OCR flow uses a review-first design. It extracts raw text and suggested fields from the standard request form, then requires the user to review and apply suggestions before saving the document.

## Gemini Chatbot

Server-side files added:

- `app/Services/GeminiChatService.php`
- `app/Http/Controllers/Api/ChatbotController.php`
- `config/ai.php`

Frontend files added/changed:

- `resources/js/components/chat/SystemChatbot.jsx`
- `resources/js/components/layout/AppLayout.jsx`
- `resources/js/api/base44Client.js`

The chatbot is limited by server-side rules. It only receives safe context built by Laravel after role/access checks. The Gemini API key stays in `.env` and is never exposed through Vite.

## Test Forms Included

- `public/templates/docutracker_request_form_sample.pdf`
- `public/templates/docutracker_request_form_sample.png`
- `public/templates/docutracker_request_form_blank.pdf`

Use the sample PNG for OCR testing if local PDF OCR tools are not installed.
