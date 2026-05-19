<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\NotificationPreference;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->seedRolesAndPermissions();
        $this->seedUsers();
        $this->seedSettings();
    }

    private function seedRolesAndPermissions(): void
    {
        $permissions = [
            ['documents', 'create', 'Create new document records'],
            ['documents', 'read', 'View accessible document records'],
            ['documents', 'update', 'Update and route document records'],
            ['documents', 'delete', 'Soft-delete document records'],
            ['users', 'manage', 'Create, update, deactivate, and export users'],
            ['reports', 'manage', 'View and export reports'],
            ['audit_logs', 'manage', 'View, filter, export, and archive audit logs'],
            ['settings', 'manage', 'Update branding, security, backup, and notification settings'],
            ['backups', 'manage', 'Create and download verified backups'],
            ['notifications', 'read', 'View own notifications'],
            ['developer_tools', 'manage', 'Access safe developer diagnostics and log-only attack simulations'],
        ];

        foreach ($permissions as [$module, $action, $description]) {
            Permission::firstOrCreate(
                ['module_name' => $module, 'action_name' => $action],
                ['description' => $description]
            );
        }

        $roles = [
            'ADMIN' => ['Administrator', 'Full system control for all modules.'],
            'RECEIVING' => ['Receiving Office', 'Encodes incoming documents and starts document routing.'],
            'PROCUREMENT' => ['Procurement Section', 'Handles procurement-related document processing.'],
            'MOBILIZATION' => ['Mobilization Section', 'Handles mobilization-related document processing.'],
            'MAYOR' => ['Mayor / OIC', 'Reviews and signs routed documents.'],
            'RELEASING' => ['Releasing Section', 'Releases finalized documents.'],
            'COMMS' => ['Communications', 'Processes communication letters.'],
            'RECORDS' => ['Records Section', 'Maintains communication and records trail.'],
            'DEVELOPER' => ['Developer', 'Technical support role for diagnostics, audit demonstrations, and safe security simulations.'],
        ];

        foreach ($roles as $name => [$displayName, $description]) {
            $role = Role::firstOrCreate(
                ['name' => $name],
                ['display_name' => $displayName, 'description' => $description]
            );

            $allowed = match ($name) {
                'ADMIN' => Permission::pluck('id')->all(),
                'DEVELOPER' => Permission::whereIn('module_name', ['developer_tools', 'audit_logs', 'reports', 'notifications'])->pluck('id')->all(),
                'RECEIVING' => Permission::whereIn('module_name', ['documents', 'notifications'])->pluck('id')->all(),
                default => Permission::whereIn('module_name', ['documents', 'notifications'])->whereIn('action_name', ['read', 'update'])->pluck('id')->all(),
            };

            $role->permissions()->sync($allowed);
        }
    }

    private function seedUsers(): void
    {
        $users = [
            ['name' => 'Maria Santos', 'email' => 'maria.santos@docutracker.local', 'role' => 'RECEIVING', 'section' => 'GENERAL'],
            ['name' => 'Cassy Dela Cruz', 'email' => 'cassy.delacruz@docutracker.local', 'role' => 'PROCUREMENT', 'section' => 'PROCUREMENT'],
            ['name' => 'Elvie Reyes', 'email' => 'elvie.reyes@docutracker.local', 'role' => 'COMMS', 'section' => 'COMMS'],
            ['name' => 'Mila S. Torres', 'email' => 'mila.torres@docutracker.local', 'role' => 'RECORDS', 'section' => 'COMMS'],
            ['name' => 'Joyce Manalo', 'email' => 'joyce.manalo@docutracker.local', 'role' => 'MOBILIZATION', 'section' => 'MOBILIZATION'],
            ['name' => 'Hon. Amie G. Galaro', 'email' => 'amie.galaro@docutracker.local', 'role' => 'MAYOR', 'section' => 'GENERAL'],
            ['name' => 'Greizel Galario-Fernandez', 'email' => 'greizel.fernandez@docutracker.local', 'role' => 'MAYOR', 'section' => 'GENERAL'],
            ['name' => 'Vanesa Gutierrez', 'email' => 'vanesa.gutierrez@docutracker.local', 'role' => 'RELEASING', 'section' => 'PROCUREMENT'],
            ['name' => 'System Admin', 'email' => 'admin@docutracker.local', 'role' => 'ADMIN', 'section' => 'GENERAL'],
            ['name' => 'System Developer', 'email' => 'developer@docutracker.local', 'role' => 'DEVELOPER', 'section' => 'TECHNICAL'],
        ];

        foreach ($users as $user) {
            $role = Role::where('name', $user['role'])->first();
            $createdUser = User::updateOrCreate(
                ['email' => $user['email']],
                [
                    ...$user,
                    'role_id' => $role?->id,
                    'password' => Hash::make('Password123!'),
                    'is_active' => true,
                    'status' => 'active',
                    'password_changed_at' => now(),
                    'email_verified_at' => now(),
                ]
            );

            NotificationPreference::firstOrCreate(
                ['user_id' => $createdUser->id],
                [
                    'in_app_enabled' => true,
                    'popup_enabled' => true,
                    'email_enabled' => true,
                    'sms_enabled' => false,
                    'system_enabled' => true,
                    'warning_enabled' => true,
                    'critical_enabled' => true,
                    'reminder_enabled' => true,
                    'channels' => ['in_app' => true, 'popup' => true, 'email' => true, 'sms' => false],
                ]
            );
        }
    }

    private function seedSettings(): void
    {
        $settings = [
            ['branding', 'site_name', ['value' => 'DocTracker'], 'string', 'Application display name.'],
            ['branding', 'logo_url', ['value' => ''], 'string', 'Optional logo URL/path displayed in reports and app shell.'],
            ['branding', 'favicon_url', ['value' => ''], 'string', 'Optional favicon URL/path.'],
            ['branding', 'theme_color', ['value' => '#15803d'], 'string', 'Primary green theme color.'],
            ['branding', 'secondary_color', ['value' => '#f8fafc'], 'string', 'Secondary background/accent color.'],
            ['security', 'password_policy', ['min' => 8, 'mixed_case' => true, 'numbers' => true, 'symbols' => true], 'json', 'Enforced server-side password policy: minimum 8 characters, uppercase, lowercase, number, and special character.'],
            ['security', 'session_timeout_minutes', ['value' => 120], 'integer', 'Inactivity timeout before automatic logout. Change this from Admin Console > Settings.'],
            ['security', 'session_timeout_warning_minutes', ['value' => 5], 'integer', 'Show client-side timeout warning this many minutes before expiration.'],
            ['security', 'single_session_per_user', ['value' => false], 'boolean', 'When enabled, a new login removes older active sessions for the same user.'],
            ['security', 'remember_me_days', ['value' => 30], 'integer', 'Remember-me policy display for persistent login sessions.'],
            ['security', 'failed_login_warning_threshold', ['value' => 3], 'integer', 'Show a security warning after this many failed password attempts.'],
            ['security', 'failed_login_lockout_threshold', ['value' => 5], 'integer', 'Temporarily lock the account after this many failed password attempts.'],
            ['security', 'failed_login_lockout_minutes', ['value' => 30], 'integer', 'Temporary lockout duration in minutes.'],
            ['security', 'mfa_enforcement', ['value' => false], 'boolean', 'Require email OTP/MFA for every account when enabled.'],
            ['security', 'mfa_code_ttl_minutes', ['value' => 10], 'integer', 'Email OTP expiration time in minutes.'],
            ['security', 'force_https', ['value' => false], 'boolean', 'When enabled, security headers assume HTTPS deployment and emit HSTS.'],
            ['security', 'csp_enabled', ['value' => true], 'boolean', 'Enable Content-Security-Policy headers for XSS hardening.'],
            ['security', 'strip_html_input', ['value' => true], 'boolean', 'Strip HTML tags from normal text input before validation/storage.'],
            ['backup', 'schedule', ['database' => 'weekly monday 02:00', 'uploads' => 'weekly sunday 02:30', 'full_system' => 'monthly first day 03:00'], 'json', 'Configured backup schedule used by Laravel scheduler.'],
            ['backup', 'destinations', ['local' => true, 'email_attachment' => true, 'cloud_disk_env' => 'BACKUP_CLOUD_DISK', 'supabase_enabled_env' => 'SUPABASE_BACKUP_ENABLED', 'external_path_env' => 'BACKUP_EXTERNAL_PATH'], 'json', 'Backup destination configuration backed by environment variables, including optional Supabase Storage.'],
            ['backup', 'retention_days', ['value' => 30], 'integer', 'Backup retention policy in days. Changeable from Admin Console > Settings.'],
            ['backup', 'pg_dump_binary', ['value' => 'pg_dump'], 'string', 'PostgreSQL pg_dump binary used for recoverable SQL dump backups. Override with BACKUP_PG_DUMP_BINARY in .env.'],
            ['audit', 'archive_after_days', ['value' => 90], 'integer', 'Auto-archive audit logs older than this number of days.'],
            ['audit', 'default_page_size', ['value' => 25], 'integer', 'Default audit log pagination size.'],
            ['audit', 'log_access_enabled', ['value' => true], 'boolean', 'Record protected GET page/API access as access logs.'],
            ['developer', 'max_simulation_events_per_run', ['value' => 100], 'integer', 'Maximum safe log-only attack simulation records per run.'],
            ['developer', 'safe_simulation_mode', ['value' => true], 'boolean', 'Developer attack demonstrations write logs only and do not perform real attacks.'],
            ['reports', 'monthly_schedule', ['value' => 'monthly first day 04:00'], 'string', 'Auto-generated monthly transaction report schedule.'],
            ['reports', 'favorites_enabled', ['value' => true], 'boolean', 'Allow admins to save favorite report configurations.'],
            ['notifications', 'default_channels', ['in_app' => true, 'popup' => true, 'email' => true, 'sms' => false], 'json', 'Default notification delivery channels.'],
            ['notifications', 'realtime_enabled', ['value' => true], 'boolean', 'Enable Server-Sent Events for notification refresh when the browser supports it.'],
            ['notifications', 'popup_duration_seconds', ['value' => 5], 'integer', 'Bottom-left popup duration for in-app notifications.'],
            ['email', 'smtp_mailer', ['value' => env('MAIL_MAILER', 'log')], 'string', 'SMTP mailer used for notification templates and email delivery.'],
            ['email', 'smtp_host', ['value' => env('MAIL_HOST', '127.0.0.1')], 'string', 'SMTP host. Runtime still uses .env mail configuration.'],
            ['email', 'smtp_port', ['value' => env('MAIL_PORT', 2525)], 'integer', 'SMTP port. Runtime still uses .env mail configuration.'],
            ['email', 'smtp_username', ['value' => env('MAIL_USERNAME')], 'string', 'SMTP username display placeholder. Keep secrets only in .env.'],
            ['email', 'from_address', ['value' => env('MAIL_FROM_ADDRESS', 'docutracker@example.com')], 'string', 'Default sender address.'],
            ['email', 'from_name', ['value' => env('MAIL_FROM_NAME', 'DocTracker')], 'string', 'Default sender name.'],
            ['email', 'notification_template', ['subject_prefix' => '[DocTracker]', 'footer' => 'This is an automated DocTracker notification.'], 'json', 'Default notification email template text.'],
            ['api', 'rate_limit_per_minute', ['value' => 100], 'integer', 'API rate limit per IP per minute.'],
            ['api', 'api_keys_enabled', ['value' => false], 'boolean', 'Reserved API key toggle placeholder for future API integrations.'],
            ['api', 'public_docs_enabled', ['value' => false], 'boolean', 'Reserved public API documentation toggle.'],
            ['performance', 'slow_request_threshold_ms', ['value' => 1500], 'integer', 'Log a warning when an API request exceeds this response-time threshold.'],
            ['performance', 'monitoring_window_minutes', ['value' => 60], 'integer', 'Default Security Monitor live dashboard window.'],
            ['performance', 'monitor_refresh_seconds', ['value' => 10], 'integer', 'Admin Security Monitor AJAX refresh interval.'],
            ['ui', 'dark_mode_enabled', ['value' => true], 'boolean', 'Allow users to toggle dark mode in the application shell.'],
            ['ui', 'breadcrumbs_enabled', ['value' => true], 'boolean', 'Display breadcrumb navigation above pages.'],
            ['ui', 'skeleton_loaders_enabled', ['value' => true], 'boolean', 'Show skeleton loading states for slower dashboard sections.'],
            ['system', 'storage_capacity_limit_mb', ['value' => 1024], 'integer', 'Storage warning capacity limit in MB for dashboard warnings.'],
            ['system', 'storage_warning_threshold_percent', ['value' => 85], 'integer', 'Email admins when storage usage reaches this percentage of configured capacity.'],
            ['maintenance', 'enabled', ['value' => false], 'boolean', 'Maintenance mode toggle display.'],
            ['maintenance', 'message', ['value' => 'DocTracker is temporarily under maintenance. Please try again later.'], 'string', 'Custom maintenance message shown when maintenance mode is active.'],
        ];

        foreach ($settings as [$group, $key, $value, $type, $description]) {
            SiteSetting::updateOrCreate(
                ['group_name' => $group, 'key_name' => $key],
                ['value' => $value, 'type' => $type, 'description' => $description]
            );
        }
    }
}
