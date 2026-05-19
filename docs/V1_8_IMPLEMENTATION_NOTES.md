# DocTracker v1.8 Implementation Notes

## Main scope

Version 1.8 focuses on the Audit Logging and Transaction Tracking criteria and adds a dedicated Developer role for safe security-demo workflows.

## Implemented

- Added persistent audit-log classification columns: `category`, `risk_score`, `source`, `is_suspicious`, and `metadata`.
- Upgraded `AuditLogger` to classify authentication, transaction, error, access, SQL injection, XSS, DoS/DDoS, network, social-engineering, and privilege-related events.
- Reworked Admin Console > Audit Logs into a proper audit module with search, filters, sorting, pagination, suspicious-only view, archived-log toggle, and visual indicators.
- Added CSV, Excel-compatible, and PDF audit exports while preserving category/risk indicators.
- Added configurable audit archive settings in Admin Console > Settings.
- Updated the scheduled audit archive command to use the `audit.archive_after_days` site setting when no explicit value is passed.
- Added the `DEVELOPER` role, seeded developer permissions, and seeded `developer@docutracker.local` / `Password123!`.
- Added Developer Console at `/developer` with safe log-only simulations and runtime diagnostics.
- Added simulations for SQL injection, XSS, broken sessions, spam failed logins, brute force, port scanning, MitM, firewall/IDS evasion, phishing, physical testing, DoS/DDoS, privilege escalation, and lateral movement.
- Improved the document list Pagination Feature with page-size, sorting, previous/next controls, and record ranges.

## Safety boundary

The Developer Console does not perform real attacks. It only writes audit-log records that look like attack events for demonstration and grading evidence. It does not send traffic, scan ports, brute-force accounts, exploit input fields, or contact external systems.
