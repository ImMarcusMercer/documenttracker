# DocuTracker v2.6 Implementation Notes

## Scope

Version 2.6 implements the Security & Performance and Professional UI/UX pass. It adds a live Admin Security Monitor page, server-wide performance metrics, stricter security headers, input sanitization, and site-wide UX refinements.

## Security & Performance

- `app/Http/Middleware/SecurityHeaders.php` now applies CSP, HSTS-ready HTTPS headers, frame/content-type protection, referrer policy, permissions policy, and cross-origin protections.
- `app/Http/Middleware/SanitizeRequestInput.php` strips HTML tags from regular text fields and logs suspicious SQLi/XSS-looking input patterns as audit events.
- `app/Http/Middleware/RequestPerformanceMonitor.php` adds `X-Request-ID`, `X-Response-Time-Ms`, and `X-DocTracker-Monitoring` headers to responses and aggregates API performance data in cache.
- Slow requests and server errors are audit-logged when they exceed the configured `performance.slow_request_threshold_ms` threshold.
- The route group keeps the existing `throttle:100,1` policy for rate limiting.

## Admin Security Monitor

- New endpoint: `GET /api/v1/security-monitor`.
- New controller: `app/Http/Controllers/Api/SecurityMonitorController.php`.
- New UI tab: `Admin Console > Security Monitor`.
- The monitor shows suspicious events, critical/warning event counts, failed login counts, simulated attack counts, average risk score, category charts, severity summaries, recent security events, request count, average/max response time, error rate, and top API paths.
- Developer attack simulations remain safe log-only demonstrations. The Admin Security Monitor displays the resulting logs in real time through AJAX refresh.

## UI/UX

- Added `PageBreadcrumbs`, `ThemeToggle`, and `EmptyState` components.
- Added skip-to-content link and `main#main-content` focus target for accessibility.
- Added dark mode using the existing Tailwind dark class.
- Removed the external Google Fonts import to align with the self-hosted CSP posture and use a local/system font stack.
- Added skeleton/empty-state utility classes and responsive page utility classes.

## New Site Settings

Seeded settings were expanded with:

- `security.force_https`
- `security.csp_enabled`
- `security.strip_html_input`
- `performance.slow_request_threshold_ms`
- `performance.monitoring_window_minutes`
- `performance.monitor_refresh_seconds`
- `ui.dark_mode_enabled`
- `ui.breadcrumbs_enabled`
- `ui.skeleton_loaders_enabled`

## Environment Placeholders

`.env.example` now includes:

```env
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
FORCE_HTTPS=false
CSP_ENABLED=true
STRIP_HTML_INPUT=true
SLOW_REQUEST_THRESHOLD_MS=1500
PERFORMANCE_MONITORING_WINDOW_MINUTES=60
```

## Demo Flow

1. Log in as Admin.
2. Open `Admin Console > Security Monitor`.
3. In another tab, log in as Developer and run safe attack simulations.
4. Return to the Security Monitor and wait for AJAX refresh or click Refresh.
5. Confirm category charts, recent events, risk indicators, and performance metrics update without a full page reload.
