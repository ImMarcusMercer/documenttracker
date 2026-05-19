# DocTracker v1.7 Implementation Notes

## Scope

Version 1.7 focuses on the criteria items for user role/authentication, notification UX, profile management, password recovery, remember-me behavior, email OTP/MFA, session handling, failed-login lockout, stricter password policy, and social auth placeholders.

## Implemented

- Unified Sonner-based bottom-left popup notification layer.
- Stackable 5-second popups with success, info, warning, and error coloring.
- User Profile page for all authenticated users at `/profile`.
- Profile update API for full name, phone, address, avatar upload, and personal MFA toggle.
- Remember-me login continues to use Laravel session guard and remember token; frontend `/me` check auto-loads the user when a valid session/remember cookie exists.
- Email OTP/MFA with configurable TTL.
- Password recovery via `/forgot-password` and `/reset-password/{token}`.
- Strict password policy: minimum 8 characters, uppercase, lowercase, number, and symbol.
- Failed-login warning and temporary account lockout with configurable thresholds.
- Server-side session inactivity timeout using `security.session_timeout_minutes` from Admin Site Settings.
- Client-side session warning popup based on `security.session_timeout_warning_minutes`.
- Admin Console quick editor for security, session, OTP, and lockout settings.
- `.env.example` placeholders for OTP/email verification/password reset/failed-login setup.
- Disabled social login/register placeholder buttons for Google, GitHub, and Facebook.

## Main Files

- `app/Http/Controllers/Api/AuthController.php`
- `app/Http/Middleware/EnforceSessionPolicy.php`
- `app/Support/SiteSettings.php`
- `app/Http/Controllers/Api/ProfileController.php`
- `database/seeders/DatabaseSeeder.php`
- `resources/js/components/ui/sonner.jsx`
- `resources/js/pages/Login.jsx`
- `resources/js/pages/Profile.jsx`
- `resources/js/components/layout/AppLayout.jsx`
- `resources/js/pages/AdminConsole.jsx`
- `.env.example`
- `README.md`

## Notes

Social buttons are UI placeholders only and are intentionally not wired to OAuth providers. OTP and password reset require working SMTP values in `.env`.
