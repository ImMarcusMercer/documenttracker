# DocTracker v2.1 Implementation Notes

## Focus area

Version 2.1 strengthens the Automated Backup System requirement.

## Implemented

- Recoverable PostgreSQL database dump backup inside backup ZIPs as `database/database-dump.sql`.
- Primary dump method uses `pg_dump` through `BACKUP_PG_DUMP_BINARY` or `PG_DUMP_BINARY`.
- Fallback SQL data export is generated if `pg_dump` is unavailable, so the backup still contains actual data SQL instead of metadata only.
- Full-system backup includes database dump, uploaded files, selected source files, and manifest data.
- Backup email notifications are attempted on success and failure using configured `.env` mail values.
- Email delivery result is stored in `backup_runs.destination_status.email_notification`.
- Backup integrity verification checks SHA-256 checksum, ZIP readability, manifest presence, and required sections.
- Stored backup verification is available from Admin Console > Backups.
- Imported backup ZIP verification is available from Admin Console > Backups with optional expected SHA-256 checksum.
- Backup retention days and backup schedule labels are editable from Admin Console > Settings.
- Optional Supabase Storage backup placeholders were added to `.env.example`.
- A `supabase` Laravel filesystem disk was added in `config/filesystems.php` for S3-compatible storage.
- Backup downloads attempt local file retrieval first, then configured cloud storage retrieval if local file is missing.
- Developer role can view relevant settings and update developer-only settings from Developer Console > Developer Settings.

## Important files

| File | Purpose |
|---|---|
| `app/Services/BackupService.php` | Backup creation, pg_dump SQL dump, ZIP packaging, integrity verification, email, local/cloud/external destinations. |
| `app/Http/Controllers/Api/BackupController.php` | Backup API endpoints for list, create, download, stored verification, and imported-file verification. |
| `routes/api.php` | Adds backup verification endpoints. |
| `routes/console.php` | Adds `docutracker:backup-verify {backupId}` command. |
| `resources/js/pages/AdminConsole.jsx` | Backups UI, imported verification UI, backup settings UI. |
| `resources/js/pages/DeveloperConsole.jsx` | Developer-only settings UI. |
| `config/filesystems.php` | Optional Supabase disk. |
| `.env.example` | pg_dump and Supabase backup placeholders. |

## Required Ubuntu package

Install PostgreSQL client tools so `pg_dump` is available:

```bash
sudo apt update
sudo apt install postgresql-client
```

Then confirm:

```bash
pg_dump --version
```

## Manual commands

```bash
php artisan docutracker:backup database
php artisan docutracker:backup uploads
php artisan docutracker:backup full_system
php artisan docutracker:backup manual
php artisan docutracker:backup-verify 1
```

## Supabase note

The integration is environment-backed. Set either:

```env
BACKUP_CLOUD_DISK=supabase
```

or:

```env
SUPABASE_BACKUP_ENABLED=true
```

Then fill the `SUPABASE_STORAGE_*` values. The code uses Laravel's S3-compatible filesystem disk named `supabase`.
