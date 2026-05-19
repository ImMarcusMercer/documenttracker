# DocuTracker v2.4 Implementation Notes

## Scope
This version strengthens the Form Validation & User Experience and Advanced Data Controls requirements.

## Implemented

### Form Validation & User Experience
- Added reusable field-error and required-label UI helpers.
- Added client-side inline validation on blur for key forms.
- Added accessible error output using `role="alert"`, `aria-invalid`, and `aria-describedby`.
- Added strong password validation feedback for user creation.
- Added email format validation for user creation.
- Added phone format validation for profile updates.
- Added date validation, numeric min/max/decimal validation, and file type/size validation for new document creation.
- Added submit loading indicators for profile, user creation, import preview, and document creation paths.
- Added local auto-save draft behavior for the New Document form.
- Added browser leave-warning behavior for unsaved New Document and Profile changes.

### Advanced Data Controls
- Added pagination controls with 10/25/50/100 records per page on document and user-heavy views.
- Added server-backed search, filters, sorting, and pagination for users.
- Added server-backed search, filters, sorting, and pagination support for documents.
- Added global search and column-specific search controls for documents.
- Added date-range filters for documents.
- Added clickable sortable table headers for documents and users.
- Added bulk user status/role update actions.
- Added bulk document status update action.
- Preserved bulk document archive and restore.
- Added column visibility preferences using local browser storage.
- Added current-view export filters for document and user CSV/PDF exports.

### Environment Placeholders
- Merged the provided existing `.env` placeholders into `.env.example` where missing.
- Preserved PostgreSQL as the default database connection.
- Added placeholders for app maintenance, bcrypt rounds, broadcast connection, Vite app name, Gemini API URL/timeout, and OCR max PDF pages.

## Notes
- Bulk document archive remains soft delete and requires password confirmation.
- Archive visibility remains admin-only.
- Column preferences are saved locally per browser, which is sufficient for a student demo and avoids additional database complexity.
