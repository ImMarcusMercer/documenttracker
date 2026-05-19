# DocuTracker v2.7

DocTracker is a Laravel 12 + PostgreSQL + React/Vite web application for document receiving, routing, tracking, release monitoring, reporting, and audit control. Version 2.7 extends the criteria-oriented build with a ticket-based Help Desk module, a new Help Desk role, system-wide Need Help access points, Help Desk notifications, ticket replies, agent controls, ticket audit logs, and support workflow settings while preserving the PostgreSQL-only setup.

## Project Information

| Item | Details |
|---|---|
| Project name | DocTracker |
| Version | v2.7 |
| Backend | Laravel 12, PHP 8.2+ |
| Frontend | React 18, Vite, Tailwind CSS, shadcn-style UI components |
| Database | PostgreSQL only |
| API prefix | `/api/v1` |
| Default local URL | `http://127.0.0.1:8000` |
| Main purpose | Track office documents from receiving to routing, signing, release, audit, reports, and backups |

## Real-Life Problem Scenario

Manual office document routing often causes delayed processing, unclear current holder, weak accountability, missing proof of document movement, inconsistent release monitoring, and difficulty producing audit-ready reports. DocTracker solves this by assigning control numbers, showing document status and current holder, storing action history, generating notifications, supporting uploads/OCR-assisted encoding, exporting reports, and giving administrators audit, backup, settings, and user-management tools.

## v2.0 Requirement Implementation Summary

| Criteria Area | v2.0 Implementation |
|---|---|
| User role management | RBAC tables for roles, permissions, and role-permissions; user statuses; profile/avatar-ready fields; admin create/update/deactivate users. |
| Authentication | Secure login, remember-me persistent sessions, auto-login through existing Laravel session/remember cookie, email OTP/MFA, configurable session timeout, stricter failed-login warning/lockout, password policy, password reset API, visible forgot/reset-password pages, and social login placeholders. |
| Audit logging | Authentication, transaction, error, access, and security-simulation logs; searchable/filterable/paginated admin viewer; categorized indicators; persisted risk score/source/suspicious flags; CSV, Excel-compatible, and PDF exports; configurable auto-archive using `audit.archive_after_days`. |
| Dashboard | Comprehensive dashboard with user statistics, active-now count, document metrics, transaction activity charts, status/classification charts, system health, database size, storage usage, performance metrics, quick actions, recent actions, date range filters, AJAX refresh, and a compact live dashboard strip visible across authenticated pages. |
| Notifications | Bell/unread support, mark-all-read, delete notification, paginated and filterable notification inbox, profile-based notification preferences, routing/system/warning/critical/reminder categories, email-capable warning/critical alerts, Server-Sent Events real-time updates with polling fallback, and unified stackable bottom-left popups that auto-disappear after 5 seconds with different colors for success/info/warning/error. |
| Warning system | Failed-login warning popups after configurable threshold, temporary account lockout after configurable threshold, session-expiration warning countdown, suspicious activity badges, delete confirmation, bulk-delete warning, backup failure warnings. |
| Automated backup | Manual and scheduled backup logic for database, uploads, and full system; recoverable PostgreSQL `database-dump.sql` using `pg_dump` when available; SHA-256 and ZIP-structure verification; imported-backup verification; local storage; optional Supabase/cloud disk, external path, and email attachment destinations. |
| Import/export | Document CSV/Excel templates, CSV/XLS/XLSX/XML import parsing, preview validation, duplicate detection, skip/fail handling, import progress/status display, failed-row report, and document export to CSV, Excel, PDF, JSON, and XML; user CSV template, preview, commit, and export. |
| Reporting | Transaction summary, user activity, audit trail, system usage reports; CSV export; print/save-PDF layout; favorite report configurations; monthly scheduled report command. |
| PDF/printing | Browser print/save-PDF report template with generation date, header, page placeholder, and digital signature placeholder. |
| CRUD standards | Document soft delete, restore, audit diffs, optimistic lock version, notifications, selected bulk soft-delete from document list. |
| Form validation and UX | Server-side validation, accessible error messages, loading states, password reset flow, import preview before commit, no login account hints. |
| Advanced data controls | Search, status/type/month filters, sort controls, 10/25/50/100 page-size selector, previous/next pagination controls, column visibility toggles, selected bulk action, and expanded pagination behavior for notification and audit pages. |
| Advanced user management | Admin-only user lifecycle management with create/edit/deactivate controls, role/status/MFA assignment, role-permission matrix, custom role creation, impersonation for support, force logout from all sessions, user login history, device/session info, bulk user import/export, current-view export, and activity analytics. |
| Site settings | Branding, email template metadata, security, backup schedule/retention, notification defaults, maintenance mode/message, API placeholders, reports, audit, developer, and system-warning settings seeded in DB; Admin Console has structured quick-edit controls plus manual group/key/value editing. |
| Security/performance | API throttle of 100 requests/minute, Laravel ORM/parameter binding, CSRF token on AJAX, hashed passwords, CSP/security headers, input sanitization, response-time headers, slow/error request audit logging, live performance cache metrics, PostgreSQL default config. |
| UI/UX | Responsive phone/tablet/desktop layout, compact live dashboard strip, organized section cards, mobile-safe toast width, clean sidebar, breadcrumbs, dark mode toggle, skeleton loading states, charts, empty states, print styling, accessible login/reset forms, social auth placeholders, profile/avatar editing UI, and profile notification preferences. |
| Bonus | Help Desk ticketing replaces immediate chat for support requests; optional OCR and Gemini assistant support remain environment-backed and disabled unless configured; Developer role includes safe demonstrations for SQL injection, XSS, broken sessions, brute force, network probing, social engineering, DoS/DDoS, privilege escalation, and lateral movement as audit-log simulations only. |

## v2.7 Additions

- Added a new **Help Desk** role with the seeded account `helpdesk@docutracker.local` / `Password123!`.
- Added support-ticket permissions: create, read, update, and manage. Admins retain full access; Help Desk users manage support workflow; regular users can submit and view their own tickets.
- Added `/helpdesk` and `/help` routes. The page adapts into **Need Help** mode for regular users and **Help Desk Console** mode for Help Desk/Admin/Developer users.
- Added a sidebar **Need Help** access point and a floating **Need Help?** button on authenticated pages so users do not need live chat to request assistance.
- Replaced the immediate floating chat entry point with ticket-based support access. The previous assistant endpoint remains server-side but is no longer presented as the primary Help/Chat UI.
- Added backend tables for `support_tickets` and `support_ticket_messages`, including ticket number, requester, assignee, subject, category, priority, status, resolution, message thread, internal notes, timestamps, and soft archive support.
- Added Help Desk APIs for ticket listing, ticket creation, ticket details, agent updates, replies, archive/restore, and dashboard stats.
- Added support-ticket notification logic. New tickets notify Help Desk/Admin users, Help Desk replies notify the requester, and requester replies notify Help Desk users. Email delivery uses existing `.env` mail configuration when enabled by user notification preferences.
- Added audit logging for ticket creation, viewing, updates, replies, internal notes, archive, and restore actions.
- Added Help Desk settings seeds under the `helpdesk` group for enabling the feature, email-on-new-ticket behavior, default priority, and normal-priority SLA display.
- Updated production build assets after implementing the ticketing module.





## v2.6 Additions

- Added an Admin Console **Security Monitor** tab for live security and performance demonstrations. It shows suspicious events, critical/warning counts, average risk score, API error rate, attack-simulation category charts, severity summaries, top API paths, and recent security events.
- Added `GET /api/v1/security-monitor`, restricted to Admin users, with AJAX-friendly data for the live monitor.
- Integrated the existing Developer attack-simulation logs with the Admin Security Monitor so SQLi, XSS, authentication, DDoS, privilege, network, and social-engineering simulations immediately appear in categorized charts.
- Added server-wide request performance monitoring middleware that emits `X-Request-ID`, `X-Response-Time-Ms`, and `X-DocTracker-Monitoring` response headers.
- Added live API performance aggregation in cache with request count, average response time, max response time, error count, error rate, and top API paths.
- Added slow/error request audit logging using the configurable `performance.slow_request_threshold_ms` setting.
- Strengthened security headers with CSP, HSTS-ready HTTPS handling, frame/content-type protections, referrer policy, permissions policy, and cross-origin protections.
- Added input sanitization middleware that strips HTML tags from normal text fields and logs suspicious SQLi/XSS-looking input patterns for demo visibility.
- Added seeded settings for `security.force_https`, `security.csp_enabled`, `security.strip_html_input`, `performance.*`, and `ui.*`.
- Added `.env.example` placeholders for HTTPS/security and performance monitoring.
- Added application-wide breadcrumbs, skip-to-content accessibility link, dark-mode toggle, local/system font stack, focus-visible styling, skeleton loading utilities, and stronger responsive utility classes.

## v2.5 Additions

- Strengthened Advanced User Management as an admin-only module. The Users page now includes account creation, full edit controls, status/role/MFA updates, deactivation, impersonation, force logout, bulk role/status actions, import/export, and current-view PDF/CSV export.
- Added a Role and Permission Assignment panel. Admins can view existing roles, change their assigned permissions per module, and create custom roles for specialized access.
- Added backend role-management endpoints: `GET /api/v1/roles`, `POST /api/v1/roles`, and `PATCH /api/v1/roles/{role}`. All changes are audit-logged.
- Added per-user activity inspection through `GET /api/v1/users/{user}/activity`, including login history, device/session information, active sessions, last seen/login timestamps, total audit events, and most-used feature summary.
- User Management now exposes login/device review controls directly from the table, plus activity cards for active sessions, recent authentication logs, and feature usage.
- Site Settings now includes structured editors for branding, email metadata/templates, default notification preferences, maintenance mode, and API placeholders in addition to the existing security, backup, audit, developer, and storage-warning settings.
- Seeded site settings were expanded with `branding.logo_url`, `branding.favicon_url`, `branding.secondary_color`, `email.*`, `api.*`, and `maintenance.message` defaults. Actual SMTP secrets remain in `.env`; settings store visible configuration/documentation values.
- Admin-only enforcement was tightened on user listing APIs to match the grading requirement that advanced user management is Admin only.

## v2.4 Additions

- Added inline validation on blur, red required-field indicators, accessible error messages, loading states on submit, auto-save drafts for long forms, and unsaved-change confirmation.
- Added email, phone, date, number, password, and file validation helpers for user-facing forms.
- Expanded Advanced Data Controls with server-backed pagination, page-size selector, search, filters, sorting, bulk actions, column visibility preferences, and current-view exports for users and documents.

## v2.3 Additions

- Added a reusable professional PDF generator with DocuTracker-themed header/footer, generation date, page numbers, and digital signature placeholder.
- Reports now support CSV, Excel-compatible, downloadable PDF, email PDF, and browser print/save-PDF actions.
- Audit log PDF exports now preserve categorized indicators, risk score, severity, user, and message context, with downloadable and email options.
- Document exports now support emailed PDF delivery using the configured Laravel mail `.env` settings.
- User Management now supports user-list PDF export and email PDF delivery in addition to CSV export.
- Document detail pages now include Print, PDF download, and Email PDF actions for official document-view printing.
- User-management create/update/status/deactivate actions now show consistent success, warning, and failure popup notifications.
- Archived-document visibility remains admin-only; non-admin users cannot enable archive view or fetch archived document details.
- Fixed duplicate soft-delete execution in document archiving logic.

## v2.2 Additions

- Document import now supports CSV, TXT, XLS, XLSX, and XML-style spreadsheet files.
- Added CSV and Excel import templates from Admin Console > Import.
- Import preview now validates required fields, dates, amounts, allowed statuses, duplicate rows inside the file, existing control-number duplicates, and possible existing document duplicates by subject/date/requestor.
- Duplicate handling is selectable during commit: skip invalid/duplicate rows and import valid rows, or fail the import if any invalid/duplicate row exists.
- Import progress/status UI was added with success, failed, skipped, and duplicate counters.
- Failed rows can be downloaded as a detailed CSV error report containing original row data, errors, warnings, and recommended action.
- Document export now supports CSV, Excel `.xlsx` with `.xls` fallback, PDF, JSON, and XML outputs.
- Import/export actions are recorded in the audit log with row counts, format details, and warning severity when failures or duplicates are detected.
- The Import page was reorganized into dedicated Import and Export sections so the feature is easier to demo.

## v2.1 Additions

- Database backups now include a recoverable SQL dump at `database/database-dump.sql` inside the backup ZIP. PostgreSQL `pg_dump` is used when available; a data SQL export fallback is generated if `pg_dump` cannot run.
- Full-system backups now include the database SQL dump, uploaded files, selected source files, and a manifest in one compressed ZIP.
- Backup success/failure email notifications now record visible delivery status in each backup run. Attachments are sent when the file is within `BACKUP_EMAIL_ATTACH_LIMIT_MB`.
- Backup integrity checking can be run from the Backups list. It verifies SHA-256 checksum, ZIP readability, manifest presence, and required sections such as the database dump and source files.
- Imported backup files can be uploaded to the Backups tab for validation before recovery. Optional expected SHA-256 checksum matching is supported.
- Backup retention and schedule labels are editable from Admin Console > Settings > Automated Backup Settings.
- Optional Supabase Storage placeholders were added to `.env.example`, and the `supabase` Laravel filesystem disk was added for S3-compatible backup storage.
- Backup downloads can retrieve a missing local file from configured cloud storage when the backup metadata contains a stored cloud path.
- Developer users can view relevant site settings and edit only developer-specific settings from Developer Console > Developer Settings.

## v2.0 Additions

- Added password-confirmed warning modals before sensitive document archive/delete actions, including impact summaries for single and bulk operations.
- Strengthened failed-login warnings: attempts at or above the configured warning threshold now return clear warning metadata, produce security logs, notify admins in-app, and email configured admin/security recipients when mail is configured.
- Added configurable storage-capacity warning settings in Admin Console > Settings, with dashboard visual warning indicators and admin email alerts when usage reaches the threshold.
- Added archive/restore workflows for document records and audit logs. Bulk operations move records to an archive/soft-deleted state first instead of immediately purging them.
- Expanded audit logging to include protected page/API access logging when `audit.log_access_enabled` is enabled.
- Updated document access so all active roles can view document details and attachments through All Documents > Document > View Document while action/update/delete permissions remain role-controlled.
- Added bulk audit log archive and restore endpoints for admin review workflows.
- Preserved PostgreSQL as the default database and kept current environment-backed mail, backup, OCR, and Gemini logic.

## Default Test Accounts

After running `php artisan migrate --seed`, these accounts are available:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@docutracker.local` | `Password123!` |
| Developer | `developer@docutracker.local` | `Password123!` |
| Help Desk | `helpdesk@docutracker.local` | `Password123!` |
| Receiving Office | `maria.santos@docutracker.local` | `Password123!` |
| Procurement | `cassy.delacruz@docutracker.local` | `Password123!` |
| Communications | `elvie.reyes@docutracker.local` | `Password123!` |
| Records Section | `mila.torres@docutracker.local` | `Password123!` |
| Mobilization | `joyce.manalo@docutracker.local` | `Password123!` |
| Mayor / OIC | `amie.galaro@docutracker.local` | `Password123!` |
| Mayor / OIC | `greizel.fernandez@docutracker.local` | `Password123!` |
| Releasing Section | `vanesa.gutierrez@docutracker.local` | `Password123!` |

The login page intentionally does not show these account hints.

## PostgreSQL-Only Setup

SQLite setup is intentionally skipped. Use PostgreSQL.

### 1. Create database

```sql
CREATE DATABASE docutracker;
```

### 2. Install dependencies

```bash
composer install
npm install
```

For Excel `.xlsx` import/export and backup ZIP validation, make sure PHP ZIP support is installed on Ubuntu:

```bash
sudo apt update
sudo apt install php-zip postgresql-client
php -m | grep -i zip
```

### 3. Configure environment

```bash
cp .env.example .env
php artisan key:generate
nano .env
```

Set your PostgreSQL values:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=docutracker
DB_USERNAME=postgres
DB_PASSWORD=your_postgres_password
```

### 4. Run migrations and seeders

```bash
php artisan migrate:fresh --seed
php artisan storage:link
```

### 5. Build/run

Development:

```bash
npm run dev
php artisan serve
```

Production-style assets:

```bash
npm run build
php artisan serve
```

Open:

```text
http://127.0.0.1:8000
```

## Required Ubuntu Scheduler Setup

The Laravel scheduled tasks are defined in `routes/console.php`. On Ubuntu, enable the scheduler using cron:

```bash
crontab -e
```

Add this line, replacing the path with your actual project directory:

```bash
* * * * * cd /path/to/DocuTracker && php artisan schedule:run >> /dev/null 2>&1
```

Scheduled tasks included in v2.2:

| Task | Command | Schedule |
|---|---|---|
| Database backup | `php artisan docutracker:backup database` | Weekly Monday at 2:00 AM |
| File upload backup | `php artisan docutracker:backup uploads` | Weekly Sunday at 2:30 AM |
| Full system backup | `php artisan docutracker:backup full_system` | Monthly, first day at 3:00 AM |
| Audit log archive | `php artisan docutracker:audit-archive` | Daily at 1:30 AM; uses `audit.archive_after_days` from Admin Settings |
| Monthly report | `php artisan docutracker:monthly-report` | Monthly, first day at 4:00 AM |
| Backup verification | `php artisan docutracker:backup-verify {backupId}` | Manual command for validating a stored backup ZIP |

Manual backup examples:

```bash
php artisan docutracker:backup database
php artisan docutracker:backup uploads
php artisan docutracker:backup full_system
php artisan docutracker:backup manual
```

## Authentication, OTP, and Session Settings

Mail-backed password reset and email OTP/MFA use the same SMTP configuration from `.env`. Version 1.7 adds explicit placeholders for OTP, verification, failed-login, and reset-token behavior:

```env
MFA_EMAIL_ENABLED=true
MFA_FORCE_FOR_ALL=false
MFA_CODE_TTL_MINUTES=10
EMAIL_VERIFICATION_REQUIRED=false
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=60
FAILED_LOGIN_WARNING_THRESHOLD=3
FAILED_LOGIN_LOCKOUT_THRESHOLD=5
FAILED_LOGIN_LOCKOUT_MINUTES=30
```

The runtime values used by the application are stored in the `site_settings` table and can be changed at:

```text
Admin Console > Settings > Security, Session, OTP, and Lockout Settings
```

Important setting keys:

| Setting key | Purpose | Default |
|---|---|---|
| `security.session_timeout_minutes` | Server-side inactivity timeout before automatic logout | `120` |
| `security.session_timeout_warning_minutes` | Frontend warning countdown before timeout | `5` |
| `security.single_session_per_user` | Removes older active sessions when a user logs in | `false` |
| `security.remember_me_days` | Display policy for persistent login sessions | `30` |
| `security.failed_login_warning_threshold` | Shows warning popup after failed attempts | `3` |
| `security.failed_login_lockout_threshold` | Temporarily locks account after failed attempts | `5` |
| `security.failed_login_lockout_minutes` | Lockout duration | `30` |
| `security.mfa_enforcement` | Requires email OTP for all users | `false` |
| `security.mfa_code_ttl_minutes` | OTP expiration duration | `10` |

## Unified In-App Notification Popup

The React app uses a single Sonner-based popup system mounted globally in `resources/js/App.jsx` through `resources/js/components/ui/sonner.jsx`. Popups appear at the bottom-left, stack, use a 5-second default duration, and use different colors for `success`, `info`, `warning`, and `error`. Login warnings, lockout messages, password reset feedback, profile saves, imports, backups, and admin actions use this same notification layer.

## Backup Environment Variables

Backups are always stored locally under `storage/app/backups`. Optional destinations are environment-backed so existing server logic remains controlled by `.env`:

```env
BACKUP_NOTIFICATION_EMAIL=admin@example.com
BACKUP_CLOUD_DISK=supabase
BACKUP_EXTERNAL_PATH=/mnt/external/docutracker-backups
BACKUP_EMAIL_ATTACH_LIMIT_MB=20
BACKUP_PG_DUMP_BINARY=pg_dump
PG_DUMP_BINARY=pg_dump
BACKUP_PROCESS_TIMEOUT_SECONDS=300

# Optional Supabase Storage backup integration
SUPABASE_BACKUP_ENABLED=true
SUPABASE_BACKUP_PREFIX=docutracker-backups
SUPABASE_STORAGE_ACCESS_KEY_ID=your_supabase_s3_access_key
SUPABASE_STORAGE_SECRET_ACCESS_KEY=your_supabase_s3_secret_key
SUPABASE_STORAGE_REGION=us-east-1
SUPABASE_STORAGE_BUCKET=docutracker-backups
SUPABASE_STORAGE_ENDPOINT=https://your-project-ref.supabase.co/storage/v1/s3
SUPABASE_STORAGE_URL=https://your-project-ref.supabase.co/storage/v1/object/public/docutracker-backups
SUPABASE_STORAGE_USE_PATH_STYLE_ENDPOINT=true
REPORT_NOTIFICATION_EMAIL=admin@example.com
ADMIN_ALERT_EMAIL=admin@example.com
SECURITY_ALERT_EMAIL=security@example.com
STORAGE_CAPACITY_LIMIT_MB=1024
STORAGE_WARNING_THRESHOLD_PERCENT=85
```

If `BACKUP_CLOUD_DISK` is blank and `SUPABASE_BACKUP_ENABLED=false`, cloud copy is skipped. If `BACKUP_EXTERNAL_PATH` is blank, external-drive copy is skipped. If the email recipient is blank or still uses the local placeholder domain, backup/report email sending is skipped. Install PostgreSQL client tools on Ubuntu so `pg_dump` is available for full database dumps.

## Password Reset Access

User-facing password reset is now accessible from the login page.

| Page | Path |
|---|---|
| Forgot password | `/forgot-password` |
| Reset password | `/reset-password/{token}` |

Backend endpoints:

```text
POST /api/v1/forgot-password
POST /api/v1/reset-password
```

Mail must be configured in `.env` for reset links to send.

## Main Pages

| Page | Path | Purpose |
|---|---|---|
| Login | `/login` | Secure login with remember-me, failed-login warning popups, email OTP/MFA prompt, password reset link, and disabled social placeholder buttons. |
| Forgot Password | `/forgot-password` | Request password reset link by email. |
| Reset Password | `/reset-password/{token}` | Set a new password using the secure reset token. |
| Dashboard | `/` | Operational summary and document status overview. |
| Documents | `/documents` | Search, filter, sort, column toggle, select, export, and soft-delete documents. |
| New Document | `/documents/new` | Encode new document with optional OCR-assisted extraction. |
| Document Detail | `/documents/{id}` | View file links, details, progress tracker, action trail, and routing actions. |
| Notifications | `/notifications` | Read, mark-read, and delete notifications. |
| My Profile | `/profile` | All users can update name, phone, address, avatar, and personal email OTP/MFA preference. |
| User Management | `/users` | Admin user creation, role/status control, impersonation, force logout, bulk import/export. |
| Admin Console | `/admin` | Dashboard metrics, audit logs, reports, backups, integrity checks, settings, document import/export. |
| Developer Console | `/developer` | Developer diagnostics, safe attack simulation logs, simulation history, and developer-specific site settings. |

## API Endpoint Groups

| Group | Endpoint examples |
|---|---|
| Authentication | `POST /api/v1/login`, `POST /api/v1/mfa/verify`, `GET /api/v1/me`, `POST /api/v1/logout`, `POST /api/v1/forgot-password`, `POST /api/v1/reset-password` |
| Dashboard | `GET /api/v1/dashboard/stats` |
| Users | `GET /api/v1/users`, `POST /api/v1/users`, `PATCH /api/v1/users/{id}`, `DELETE /api/v1/users/{id}`, `POST /api/v1/users/{id}/force-logout`, `POST /api/v1/users/{id}/impersonate` |
| User Import/Export | `GET /api/v1/users-export`, `GET /api/v1/users-import/template`, `POST /api/v1/users-import/preview`, `POST /api/v1/users-import/commit` |
| Documents | `GET /api/v1/documents`, `POST /api/v1/documents`, `PATCH /api/v1/documents/{id}`, `DELETE /api/v1/documents/{id}`, `DELETE /api/v1/documents/bulk-delete`, `POST /api/v1/documents/{id}/restore` |
| Actions | `GET /api/v1/document-actions`, `POST /api/v1/documents/{id}/actions` |
| Notifications | `GET /api/v1/notifications`, `PATCH /api/v1/notifications/mark-all-read`, `DELETE /api/v1/notifications/{id}` |
| Audit Logs | `GET /api/v1/audit-logs`, `GET /api/v1/audit-logs/export`, `POST /api/v1/audit-logs/archive`, `POST /api/v1/audit-logs/bulk-archive`, `POST /api/v1/audit-logs/bulk-restore` |
| Reports | `GET /api/v1/reports`, `GET /api/v1/reports/export`, `GET/POST/DELETE /api/v1/reports/favorites` |
| Backups | `GET /api/v1/backups`, `POST /api/v1/backups`, `POST /api/v1/backups/{id}/verify`, `POST /api/v1/backups/verify-upload`, `GET /api/v1/backups/{id}/download` |
| Profile | `GET /api/v1/profile`, `PATCH /api/v1/profile` |
| Settings | `GET /api/v1/settings`, `PATCH /api/v1/settings` |
| Document Import/Export | `GET /api/v1/documents-export?format=csv/excel/pdf/json/xml`, `GET /api/v1/documents-import/template?format=csv/excel`, `POST /api/v1/documents-import/preview`, `POST /api/v1/documents-import/commit`, `POST /api/v1/documents-import/error-report` |
| OCR / AI | `POST /api/v1/ocr/extract`, `POST /api/v1/assistant/chat` |

## Database Tables Added for Criteria Support

| Table | Purpose |
|---|---|
| `roles` | Role catalog for RBAC. |
| `permissions` | Module/action permissions. |
| `role_permissions` | Role-permission assignments. |
| `user_profiles` | Profile, phone, address, image, and preferences. |
| `audit_logs` | Authentication, access, error, warning, and transaction logs. |
| `site_settings` | Branding, security, backup, report, notification, and maintenance settings. |
| `backup_runs` | Backup execution history, checksum, destination status, and retention. |
| `notification_preferences` | Per-user notification settings. |
| `report_favorites` | Saved report filter/configuration presets. |
| `scheduled_report_runs` | Stored history for monthly scheduled report generation. |

## Security Notes

Do not commit `.env` or real API keys. If a Gemini or mail password was exposed publicly, revoke it and generate a new credential before deployment.

The app uses Laravel CSRF protection, database sessions, hashed passwords, API throttling, output escaping through React, ORM queries, and security headers. For live deployment, enable HTTPS at Nginx/Apache level and set secure production values in `.env`.

## Optional OCR and AI Setup

OCR is optional and controlled by `.env`:

```env
OCR_ENABLED=true
TESSERACT_PATH=tesseract
PDFTOTEXT_PATH=pdftotext
PDFTOPPM_PATH=pdftoppm
```

Gemini assistant support is optional:

```env
GEMINI_API_KEY=your_new_private_key
GEMINI_MODEL=gemini-2.5-flash
```

## v1.7 Key Files

| File | Purpose |
|---|---|
| `app/Http/Controllers/Api/AuthController.php` | Login, remember-me, email OTP/MFA, password reset, lockout, session policy response. |
| `app/Http/Middleware/EnforceSessionPolicy.php` | Server-side inactivity timeout using Admin Site Settings. |
| `app/Support/SiteSettings.php` | Cached typed helper for DB-backed site settings. |
| `app/Http/Controllers/Api/ProfileController.php` | User profile show/update, avatar upload, phone/address, personal MFA toggle. |
| `resources/js/components/ui/sonner.jsx` | Unified bottom-left popup notification system. |
| `resources/js/pages/Profile.jsx` | User profile page available to all authenticated users. |
| `resources/js/pages/Login.jsx` | Remember-me login, MFA prompt, lockout warning popups, social placeholders. |
| `resources/js/components/layout/AppLayout.jsx` | Client-side session warning countdown. |
| `resources/js/pages/AdminConsole.jsx` | Quick-edit security/session/OTP/lockout settings. |


## v2.1/v2.2 Key Files

| File | Purpose |
|---|---|
| `app/Services/BackupService.php` | Creates PostgreSQL SQL dumps, upload/full-system ZIPs, SHA-256 checksums, destination copies, email notifications, cloud retrieval, and integrity verification. |
| `app/Http/Controllers/Api/BackupController.php` | Backup list/run/download endpoints plus stored-backup and imported-backup verification endpoints. |
| `config/filesystems.php` | Adds the optional `supabase` S3-compatible disk for cloud backup storage. |
| `routes/console.php` | Scheduled backup commands and manual `docutracker:backup-verify` command. |
| `resources/js/pages/AdminConsole.jsx` | Backups tab with backup schedule cards, run controls, imported ZIP verification, stored backup verification, and destination status display. |
| `resources/js/pages/DeveloperConsole.jsx` | Developer-specific site settings panel. |

## v2.0 Warning, Archive, and Access-Control Key Files

| File | Purpose |
|---|---|
| `app/Http/Controllers/Api/DocumentController.php` | Password-confirmed single/bulk soft-delete, archive listing, restore, document serialization permissions, and all-role view access for active users. |
| `app/Support/DocumentAccess.php` | Centralized document view/action/delete/restore permission rules. |
| `resources/js/components/ActionWarningModal.jsx` | Reusable warning modal with impact summary and optional password re-entry. |
| `resources/js/pages/DocumentList.jsx` | Bulk document archive/restore controls, archive toggle, and warning modal integration. |
| `resources/js/pages/DocumentDetail.jsx` | View-document access for all active users, archive/restore buttons, and password-confirmed archive modal. |
| `app/Http/Controllers/Api/AuditLogController.php` | Audit log search/filter/export plus bulk archive/restore. |
| `app/Support/NotificationDispatcher.php` | In-app notifications plus configured admin/security email alerts for warnings and critical events. |
| `app/Http/Controllers/Api/DashboardController.php` | Storage health metrics, threshold warnings, and admin alert dispatch. |
| `app/Http/Middleware/EnforceSessionPolicy.php` | Configurable timeout handling and optional access logging. |

## v2.0 Warning and Alert Settings

These settings are seeded in the `site_settings` table and can be edited in Admin Console > Settings:

| Setting key | Purpose | Default |
|---|---|---|
| `security.failed_login_warning_threshold` | Shows warning state and admin alert when failed logins reach this count. | `3` |
| `security.failed_login_lockout_threshold` | Temporarily locks the account at this failed-attempt count. | `5` |
| `security.failed_login_lockout_minutes` | Lockout duration. | `30` |
| `security.session_timeout_minutes` | Server-side inactivity timeout. | `120` |
| `security.session_timeout_warning_minutes` | Frontend warning countdown before logout. | `5` |
| `system.storage_capacity_limit_mb` | Manual logical storage capacity used by warning calculations. | `1024` |
| `system.storage_warning_threshold_percent` | Storage warning threshold. | `85` |
| `audit.archive_after_days` | Number of days before scheduled audit auto-archive. | `90` |
| `audit.log_access_enabled` | Enables protected access/page usage logging. | `true` |

Optional `.env` recipients for admin/security alerts:

```env
ADMIN_ALERT_EMAIL=admin@example.com
SECURITY_ALERT_EMAIL=security@example.com
```

## Troubleshooting

If PostgreSQL login fails, confirm that PostgreSQL is running, the database exists, and the username/password match your local PostgreSQL account.

After changing `.env`, clear cached config:

```bash
php artisan config:clear
php artisan cache:clear
php artisan route:clear
```

If frontend updates do not appear, rebuild assets:

```bash
npm run build
```

If scheduled tasks do not run on Ubuntu, verify cron:

```bash
crontab -l
php artisan schedule:list
```


## v1.8 Audit Logging and Developer Simulation Features

The Audit Logs tab in the Admin Console now supports the Pagination Feature: page size controls, previous/next navigation, sorting, searching, severity filtering, category filtering, suspicious-only filtering, and archived-log visibility. Visual indicators are persisted on each log record through `category`, `risk_score`, `source`, `is_suspicious`, and `metadata.indicator`.

Audit exports are available from:

```text
Admin Console > Audit Logs
```

Supported exports:

| Format | Notes |
|---|---|
| CSV | Standard migration/back-office format. |
| Excel | Excel-compatible `.xls` table with categorized row colors. |
| PDF | Downloadable PDF summary with category, indicator, risk, severity, user, and message. |

Audit auto-archive can be changed at:

```text
Admin Console > Settings > Audit Logging, Pagination, and Developer Simulation Settings
```

The Developer Console is available at:

```text
/developer
```

The Developer role can open this page. Admins can also open it. The simulation tools are intentionally safe: they only write categorized audit records for demonstration. They do not send traffic floods, scan ports, brute-force passwords, exploit SQL/XSS, send phishing messages, or test third-party systems.

Developer simulation categories included in v1.8:

| Simulation | Log category | Purpose |
|---|---|---|
| SQL Injection | `sql_injection` | Shows database-injection attempt indicators. |
| XSS | `xss` | Shows malicious-script payload indicators stored safely as text. |
| Broken Session | `authentication` | Shows session/authentication bypass indicators. |
| Spam Failed Logins | `authentication` | Generates repeated failed-login style logs for lockout/logging demos. |
| Brute Force | `authentication` | Demonstrates credential-attack risk indicators without guessing passwords. |
| Port Scan | `network` | Demonstrates network reconnaissance indicators without scanning. |
| MitM | `network` | Demonstrates intercepted-communication alert indicators. |
| Firewall/IDS Evasion | `network` | Demonstrates encoded/fragmented-payload indicators. |
| Phishing/Physical Testing | `social_engineering` | Demonstrates human-factor security drill indicators. |
| DoS/DDoS | `dos_ddos` | Demonstrates stress-condition logs without generating traffic. |
| Privilege Escalation/Lateral Movement | `privilege` | Demonstrates post-exploitation risk indicators. |


## v2.4 Update - Form Validation and Advanced Data Controls

DocuTracker v2.4 implements the next criteria-pass items for Form Validation & User Experience and Advanced Data Controls.

Implemented validation and UX improvements:
- Required field labels now use visible red asterisks on key forms.
- User creation validates full name, email format, role, and strict password policy before submission.
- Profile update validates required full name, phone number format, and avatar file type/size.
- New document creation validates classification, section, particulars, date received, amount bounds/decimals, and uploaded file type/size.
- Inline errors appear after blur and are screen-reader friendly through `aria-invalid`, `aria-describedby`, and alert text.
- Submit buttons show loading states where appropriate.
- New Document form auto-saves a local draft in the browser.
- Unsaved-change warnings are active for long forms such as New Document and Profile.

Implemented advanced data controls:
- Document listing now includes pagination values of 10, 25, 50, and 100.
- User listing now includes pagination values of 10, 25, 50, and 100.
- Documents support global search, column-specific search, date range filters, status filters, classification filters, sortable headers, column visibility, current-view export, bulk archive, bulk restore, and bulk status updates.
- Users support global search, role/status filters, sortable headers, column visibility, current-view export, bulk role update, and bulk status update.
- Current-view export passes active filters to CSV/PDF export endpoints.

Environment update:
- `.env.example` now includes the previous project placeholders for PostgreSQL, sessions, mail, Vite, Gemini, OCR, and maintenance/security defaults while preserving PostgreSQL as the default database.
