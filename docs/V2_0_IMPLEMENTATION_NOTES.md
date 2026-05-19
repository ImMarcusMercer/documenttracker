# DocTracker v2.0 Implementation Notes

## Scope

Version 2.0 focuses on the Warning and Alert System criteria, safer soft-delete/archive workflows, configurable session/storage warnings, failed-login admin alerts, and wider document visibility for all active users.

## Warning and Alert System

Implemented warning behavior includes:

- Failed login attempts at the configured warning threshold return structured warning metadata to the frontend.
- Failed login warning/lockout events are written to the audit log.
- Warning and critical notifications are sent to admins in-app.
- If mail and recipients are configured, warning and critical notifications are also emailed to `ADMIN_ALERT_EMAIL` and/or `SECURITY_ALERT_EMAIL`.
- Storage-capacity warning thresholds are configurable through Admin Console > Settings.
- Dashboard system-health cards show capacity usage, threshold, and warning status.
- Session timeout remains configurable through Admin Console > Settings and enforced by server middleware.
- Sensitive document archive/delete actions require password re-entry through a warning modal.

## Soft Delete and Archive

Documents and audit logs now support safer archive-first flows:

- Single document archive requires password confirmation.
- Bulk document archive requires password confirmation and shows an impact summary.
- Admin users can view archived documents and restore them.
- Audit logs can be bulk archived/restored from the Admin Console.
- Scheduled audit auto-archive still uses `audit.archive_after_days`.

## Document Viewing Access

All active authenticated roles can open document details and view document attachments from All Documents > Document > View Document. Action-taking, editing, archiving, and restoring remain permission-controlled.

## Main Files Changed

| File | Purpose |
|---|---|
| `app/Http/Controllers/Api/DocumentController.php` | Document view access, password-confirmed soft delete, bulk archive, restore, and permission serialization. |
| `app/Support/DocumentAccess.php` | Centralized document access rules. |
| `app/Support/NotificationDispatcher.php` | In-app admin notifications plus optional email alert recipients. |
| `app/Http/Controllers/Api/AuthController.php` | Failed-login warning metadata and stricter lockout response. |
| `app/Http/Controllers/Api/DashboardController.php` | Storage warning metrics and admin alert dispatch. |
| `app/Http/Controllers/Api/AuditLogController.php` | Bulk audit archive/restore. |
| `app/Http/Middleware/EnforceSessionPolicy.php` | Timeout enforcement and optional access logging. |
| `resources/js/components/ActionWarningModal.jsx` | Reusable warning modal with impact summary and password field. |
| `resources/js/pages/DocumentList.jsx` | Bulk archive/restore UI and archive toggle. |
| `resources/js/pages/DocumentDetail.jsx` | View access, archive/restore controls, and archive warning modal. |
| `resources/js/pages/AdminConsole.jsx` | Audit bulk archive/restore and Warning/System settings. |
| `resources/js/pages/Dashboard.jsx` | Storage capacity warning visualization. |

## Environment Placeholders

The following optional placeholders were added/retained in `.env.example`:

```env
ADMIN_ALERT_EMAIL=
SECURITY_ALERT_EMAIL=
STORAGE_CAPACITY_LIMIT_MB=1024
STORAGE_WARNING_THRESHOLD_PERCENT=85
```

Mail alerts only send when Laravel mail is configured correctly and at least one recipient is present.

## Validation Performed

- PHP syntax checks passed for application, route, migration, and seeder files.
- `npm ci --silent` completed.
- `npm run build` completed successfully.
