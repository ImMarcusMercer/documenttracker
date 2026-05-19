# DocuTracker v2.5 Implementation Notes

## Scope

Version 2.5 focuses on the remaining **Advanced User Management** and **Site Settings & Content Management** criteria.

## Advanced User Management

Implemented or strengthened:

- Admin-only `/users` access from the API layer.
- Full user edit panel for name, email, role, section, status, MFA, and optional password reset.
- User deactivation as the safe delete behavior.
- Bulk role/status updates.
- Force logout from all active sessions.
- Impersonate user for support.
- Bulk user import/export retained.
- CSV/PDF user export retained.
- Per-user activity review:
  - active database sessions,
  - IP address,
  - user-agent/device summary,
  - authentication history,
  - feature/module usage counts,
  - last login and last seen timestamps.

New API:

```http
GET /api/v1/users/{user}/activity
```

## Role and Permission Management

Added a dedicated backend controller and UI panel.

New API:

```http
GET /api/v1/roles
POST /api/v1/roles
PATCH /api/v1/roles/{role}
```

Admin users can:

- view all roles,
- view all permissions,
- assign permissions per role,
- edit role display name/description,
- create custom roles for specialized access.

All role changes are written to audit logs.

## Site Settings

Expanded structured settings editors in Admin Console > Settings:

- Branding: site name, logo URL, favicon URL, primary color, secondary color.
- Email metadata/templates: mailer, host, port, username placeholder, from address/name, subject prefix, footer.
- Security: session timeout, warning countdown, remember-me display, lockout thresholds, MFA enforcement, OTP TTL.
- Backup: schedule and retention.
- Notifications: default in-app/popup/email/SMS flags, real-time toggle, popup duration.
- Maintenance: enable flag and custom message.
- API: rate limit, API key placeholder, public documentation placeholder.
- Audit/developer/system warning settings retained.

Actual SMTP passwords and sensitive runtime values remain in `.env`.

## Validation

- PHP syntax checks passed for changed controllers and routes.
- `npm run build` passed after dependency installation.

## Notes

The advanced user delete requirement is implemented as safe deactivation instead of permanent removal to preserve audit integrity and prevent accidental loss of account history.
