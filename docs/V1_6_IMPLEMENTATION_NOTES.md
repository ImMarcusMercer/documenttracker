# DocTracker v1.6 Implementation Notes

This version continues the mini-project criteria implementation using the existing Laravel/PostgreSQL/React structure.

## Main changes

- Added PostgreSQL-focused `.env.example`.
- Added user-facing forgot password and reset password React pages.
- Added Laravel scheduler commands in `routes/console.php` for database backups, upload backups, full-system backups, audit archiving, and monthly report generation.
- Added `BackupService` for reusable manual/scheduled backups with ZIP creation, SHA-256 verification, local storage, optional cloud disk copy, optional external-path copy, and optional email notification.
- Added report favorites and scheduled report run tables/models.
- Added Admin Console favorite report configuration controls.
- Added editable Site Settings UI.
- Added user bulk import template/preview/commit endpoints and UI.
- Added admin impersonation action for support.
- Added document list column visibility and selected bulk soft-delete controls.
- Updated README to v1.6 with PostgreSQL-only setup and Ubuntu scheduler instructions.

## Server setup reminder

Run the following after copying the project:

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
npm run build
```

On Ubuntu, enable the Laravel scheduler with cron:

```bash
* * * * * cd /path/to/DocTracker && php artisan schedule:run >> /dev/null 2>&1
```
