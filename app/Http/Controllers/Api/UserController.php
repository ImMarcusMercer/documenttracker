<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\NotificationDispatcher;
use App\Support\ProfessionalPdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password as PasswordRule;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $isAdmin = strtoupper((string) $request->user()->role) === 'ADMIN';
        if ($request->boolean('paginate')) {
            abort_unless($isAdmin, 403);
        }

        $query = $this->userQuery($request);

        if ($request->boolean('paginate')) {
            $perPage = min(max((int) $request->query('per_page', 25), 10), 100);
            $page = $query->paginate($perPage);

            return response()->json([
                'data' => $page->getCollection()->map(fn (User $user) => $this->serializeUser($user))->all(),
                'meta' => [
                    'current_page' => $page->currentPage(),
                    'per_page' => $page->perPage(),
                    'total' => $page->total(),
                    'last_page' => $page->lastPage(),
                    'from' => $page->firstItem(),
                    'to' => $page->lastItem(),
                ],
            ]);
        }

        return response()->json([
            'data' => $query
                ->limit(5000)
                ->get()
                ->map(fn (User $user) => $isAdmin ? $this->serializeUser($user) : $this->serializeDirectoryUser($user))
                ->all(),
        ]);
    }

    public function store(Request $request)
    {
        $this->ensureAdmin($request);

        $data = $request->validate([
            'full_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', PasswordRule::min(8)->mixedCase()->numbers()->symbols()],
            'role' => ['required', 'string', 'max:32'],
            'section' => ['required', 'string', 'max:32'],
            'status' => ['nullable', Rule::in(['active', 'inactive', 'suspended'])],
            'mfa_enabled' => ['nullable', 'boolean'],
        ]);

        $role = $this->findOrCreateRole($data['role']);

        $user = User::create([
            'name' => strip_tags($data['full_name']),
            'email' => strtolower($data['email']),
            'password' => Hash::make($data['password']),
            'role' => strtoupper($data['role']),
            'role_id' => $role?->id,
            'section' => strtoupper($data['section']),
            'status' => $data['status'] ?? 'active',
            'is_active' => ($data['status'] ?? 'active') === 'active',
            'mfa_enabled' => (bool) ($data['mfa_enabled'] ?? false),
            'password_changed_at' => now(),
            'email_verified_at' => now(),
        ]);

        AuditLogger::record($request->user(), 'transaction', 'users', 'create', $user, [], $user->toArray(), $request, 'info', 'Admin created a user account.');

        NotificationDispatcher::notifyUser($user, [
            'type' => 'system',
            'severity' => 'success',
            'title' => 'DocTracker account created',
            'message' => 'Your DocTracker account is ready. Please sign in and update your profile and notification preferences.',
            'metadata' => ['created_by' => $request->user()->email],
        ], $request);

        return response()->json(['data' => $this->serializeUser($user->fresh('roleRecord'))], 201);
    }

    public function update(Request $request, User $user)
    {
        $this->ensureAdmin($request);
        $oldValues = $user->only(['name', 'email', 'role', 'section', 'is_active', 'status', 'mfa_enabled']);

        $data = $request->validate([
            'full_name' => ['nullable', 'string', 'max:255'],
            'role' => ['nullable', 'string', 'max:32'],
            'section' => ['nullable', 'string', 'max:32'],
            'password' => ['nullable', 'string', PasswordRule::min(8)->mixedCase()->numbers()->symbols()],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'is_active' => ['nullable', 'boolean'],
            'status' => ['nullable', Rule::in(['active', 'inactive', 'suspended'])],
            'mfa_enabled' => ['nullable', 'boolean'],
        ]);

        if (array_key_exists('full_name', $data)) {
            $user->name = strip_tags($data['full_name']);
        }

        if (array_key_exists('role', $data)) {
            $role = $this->findOrCreateRole($data['role']);
            $user->role = strtoupper($data['role']);
            $user->role_id = $role?->id;
        }

        if (array_key_exists('section', $data)) {
            $user->section = strtoupper($data['section']);
        }

        if (array_key_exists('email', $data)) {
            $user->email = strtolower($data['email']);
        }

        if (!empty($data['password'])) {
            $user->password = Hash::make($data['password']);
            $user->password_changed_at = now();
            $user->failed_login_attempts = 0;
            $user->locked_until = null;
        }

        if (array_key_exists('status', $data)) {
            $user->status = $data['status'];
            $user->is_active = $data['status'] === 'active';
        } elseif (array_key_exists('is_active', $data)) {
            $user->is_active = $data['is_active'];
            $user->status = $data['is_active'] ? 'active' : 'inactive';
        }

        if (array_key_exists('mfa_enabled', $data)) {
            $user->mfa_enabled = (bool) $data['mfa_enabled'];
        }

        $user->save();

        AuditLogger::record($request->user(), 'transaction', 'users', 'update', $user, $oldValues, $user->only(['name', 'email', 'role', 'section', 'is_active', 'status', 'mfa_enabled']), $request, 'info', 'Admin updated a user account.');

        return response()->json(['data' => $this->serializeUser($user->fresh('roleRecord'))]);
    }

    public function destroy(Request $request, User $user)
    {
        $this->ensureAdmin($request);
        abort_if($user->id === $request->user()->id, 422, 'You cannot delete your own account.');

        $oldValues = $user->only(['email', 'status', 'is_active']);
        $user->forceFill(['status' => 'inactive', 'is_active' => false])->save();

        AuditLogger::record($request->user(), 'transaction', 'users', 'deactivate', $user, $oldValues, $user->only(['email', 'status', 'is_active']), $request, 'warning', 'Admin deactivated a user account.');

        NotificationDispatcher::notifyAdmins([
            'type' => 'warning',
            'severity' => 'warning',
            'title' => 'User account deactivated',
            'message' => $user->email.' was deactivated by '.$request->user()->email.'.',
            'metadata' => ['target_user' => $user->email],
        ], $request);

        return response()->json(['data' => $this->serializeUser($user->fresh('roleRecord'))]);
    }

    public function bulkUpdate(Request $request)
    {
        $this->ensureAdmin($request);

        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['integer', 'exists:users,id'],
            'status' => ['nullable', Rule::in(['active', 'inactive', 'suspended'])],
            'role' => ['nullable', 'string', 'max:32'],
        ]);

        abort_if(in_array($request->user()->id, array_map('intval', $data['ids']), true), 422, 'You cannot bulk-update your own account.');
        abort_unless(!empty($data['status']) || !empty($data['role']), 422, 'Choose a bulk status or role action first.');

        $users = User::query()->whereIn('id', array_unique($data['ids']))->get();
        $updated = 0;
        $oldSnapshot = [];

        foreach ($users as $target) {
            $oldSnapshot[$target->id] = $target->only(['email', 'role', 'section', 'status', 'is_active']);

            if (!empty($data['status'])) {
                $target->status = $data['status'];
                $target->is_active = $data['status'] === 'active';
            }

            if (!empty($data['role'])) {
                $role = $this->findOrCreateRole($data['role']);
                $target->role = strtoupper($data['role']);
                $target->role_id = $role?->id;
            }

            $target->save();
            $updated++;
        }

        AuditLogger::record($request->user(), 'transaction', 'users', 'bulk_update', null, $oldSnapshot, [
            'updated_count' => $updated,
            'ids' => array_values(array_unique($data['ids'])),
            'status' => $data['status'] ?? null,
            'role' => isset($data['role']) ? strtoupper($data['role']) : null,
        ], $request, 'warning', 'Admin performed a bulk user-management action.');

        return response()->json(['data' => ['updated_count' => $updated]]);
    }

    public function forceLogout(Request $request, User $user)
    {
        $this->ensureAdmin($request);

        \DB::table('sessions')->where('user_id', $user->id)->delete();
        AuditLogger::record($request->user(), 'transaction', 'users', 'force_logout', $user, [], [], $request, 'warning', 'Admin forced user logout.');

        return response()->json(['ok' => true]);
    }

    public function export(Request $request)
    {
        $this->ensureAdmin($request);

        $format = strtolower((string) $request->query('format', 'csv'));
        $rows = $this->userQuery($request)->get();
        $headers = ['id', 'name', 'email', 'role', 'section', 'status', 'last_login_at', 'created_at'];
        $exportRows = $rows->map(fn (User $user) => [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'section' => $user->section,
            'status' => $user->status ?: ($user->is_active ? 'active' : 'inactive'),
            'last_login_at' => optional($user->last_login_at)?->toDateTimeString(),
            'created_at' => optional($user->created_at)?->toDateTimeString(),
        ])->all();

        AuditLogger::record($request->user(), 'transaction', 'users', 'export', null, [], ['rows' => $rows->count(), 'format' => $format], $request, 'info', 'Admin exported user list.');

        if ($format === 'pdf') {
            $pdf = ProfessionalPdf::table('DocuTracker User Management Report', $headers, $exportRows, [
                'subtitle' => 'Admin-only user account export with status, role, and access metadata.',
                'footer' => 'DocuTracker User Management • Admin-only PDF',
            ]);
            $filename = 'docutracker-users.pdf';

            if ($request->boolean('email') || $request->query('delivery') === 'email') {
                ProfessionalPdf::emailToUser(
                    $request->user(),
                    'DocuTracker PDF Export - Users',
                    'Attached is the requested DocuTracker user management PDF generated at '.now()->toDateTimeString().'.',
                    $filename,
                    $pdf
                );

                return response()->json(['data' => ['emailed' => true, 'filename' => $filename, 'recipient' => $request->user()->email]]);
            }

            return response($pdf, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'attachment; filename="'.$filename.'"',
            ]);
        }

        $handle = fopen('php://temp', 'w+');
        fputcsv($handle, $headers);

        foreach ($exportRows as $row) {
            fputcsv($handle, array_map(fn ($header) => $row[$header] ?? '', $headers));
        }

        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="docutracker-users.csv"',
        ]);
    }

    public function analytics(Request $request)
    {
        $this->ensureAdmin($request);

        return response()->json([
            'data' => [
                'total' => User::count(),
                'active' => User::where('status', 'active')->orWhere('is_active', true)->count(),
                'inactive' => User::where('status', 'inactive')->orWhere('is_active', false)->count(),
                'suspended' => User::where('status', 'suspended')->count(),
                'by_role' => User::query()
                    ->selectRaw('UPPER(role) as role, COUNT(*) as total')
                    ->groupByRaw('UPPER(role)')
                    ->orderBy('role')
                    ->get(),
            ],
        ]);
    }



    public function activity(Request $request, User $user)
    {
        $this->ensureAdmin($request);

        $loginHistory = AuditLog::query()
            ->where('user_id', $user->id)
            ->where('event_type', 'authentication')
            ->whereIn('action_name', ['login_success', 'login_failed', 'logout', 'mfa_challenge_sent', 'mfa_failed', 'locked_login_blocked'])
            ->latest()
            ->limit(20)
            ->get()
            ->map(fn (AuditLog $log) => [
                'id' => (string) $log->id,
                'action' => $log->action_name,
                'severity' => $log->severity,
                'message' => $log->message,
                'ip_address' => $log->ip_address,
                'device' => $this->friendlyDevice((string) $log->user_agent),
                'user_agent' => $log->user_agent,
                'created_at' => optional($log->created_at)?->toISOString(),
            ])
            ->values();

        $sessions = DB::table('sessions')
            ->where('user_id', $user->id)
            ->orderByDesc('last_activity')
            ->limit(20)
            ->get()
            ->map(fn ($session) => [
                'id' => substr((string) $session->id, 0, 10).'…',
                'ip_address' => $session->ip_address,
                'device' => $this->friendlyDevice((string) $session->user_agent),
                'user_agent' => $session->user_agent,
                'last_activity' => date('Y-m-d H:i:s', (int) $session->last_activity),
                'is_current' => (string) $session->id === (string) $request->session()->getId(),
            ])
            ->values();

        $featureUsage = AuditLog::query()
            ->selectRaw('module_name, action_name, COUNT(*) as total')
            ->where('user_id', $user->id)
            ->groupBy('module_name', 'action_name')
            ->orderByDesc('total')
            ->limit(12)
            ->get()
            ->map(fn ($row) => [
                'module' => $row->module_name,
                'action' => $row->action_name,
                'total' => (int) $row->total,
            ])
            ->values();

        AuditLogger::record($request->user(), 'access', 'users', 'view_activity', $user, [], ['target_user' => $user->email], $request, 'info', 'Admin viewed user activity analytics.');

        return response()->json([
            'data' => [
                'user' => $this->serializeUser($user->fresh('roleRecord')),
                'summary' => [
                    'active_sessions' => $sessions->count(),
                    'last_login_at' => optional($user->last_login_at)?->toISOString(),
                    'last_seen_at' => optional($user->last_seen_at)?->toISOString(),
                    'total_audit_events' => AuditLog::where('user_id', $user->id)->count(),
                ],
                'login_history' => $loginHistory,
                'device_sessions' => $sessions,
                'feature_usage' => $featureUsage,
            ],
        ]);
    }

    public function impersonate(Request $request, User $user)
    {
        $this->ensureAdmin($request);
        abort_if($user->id === $request->user()->id, 422, 'You cannot impersonate your own account.');
        abort_unless($user->is_active && ($user->status ?: 'active') === 'active', 422, 'Only active users can be impersonated.');

        $admin = $request->user();
        $request->session()->put('impersonator_admin_id', $admin->id);
        Auth::login($user);
        $request->session()->regenerate();

        AuditLogger::record($admin, 'transaction', 'users', 'impersonate', $user, [], ['target_user' => $user->email], $request, 'warning', 'Admin impersonated a user for support.');

        return response()->json(['data' => $this->serializeUser($user->fresh('roleRecord'))]);
    }

    public function importTemplate(Request $request)
    {
        $this->ensureAdmin($request);

        $handle = fopen('php://temp', 'w+');
        fputcsv($handle, ['full_name', 'email', 'password', 'role', 'section', 'status', 'mfa_enabled']);
        fputcsv($handle, ['Sample User', 'sample.user@docutracker.local', 'Password123!', 'RECEIVING', 'GENERAL', 'active', '0']);
        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="docutracker-user-import-template.csv"',
        ]);
    }

    public function previewImport(Request $request)
    {
        $this->ensureAdmin($request);
        $request->validate(['file' => ['required', 'file', 'mimes:csv,txt', 'max:4096']]);

        return response()->json(['data' => $this->validateImportRows($this->readCsv($request->file('file')->getRealPath()))]);
    }

    public function commitImport(Request $request)
    {
        $this->ensureAdmin($request);
        $data = $request->validate(['rows' => ['required', 'array', 'max:500']]);
        $validated = $this->validateImportRows($data['rows']);

        if ($validated['failed_count'] > 0) {
            return response()->json(['message' => 'User import contains invalid rows.', 'data' => $validated], 422);
        }

        $created = 0;
        foreach ($validated['valid_rows'] as $row) {
            $role = $this->findOrCreateRole($row['role']);
            User::create([
                'name' => strip_tags($row['full_name']),
                'email' => strtolower($row['email']),
                'password' => Hash::make($row['password']),
                'role' => strtoupper($row['role']),
                'role_id' => $role?->id,
                'section' => strtoupper($row['section']),
                'status' => $row['status'],
                'is_active' => $row['status'] === 'active',
                'mfa_enabled' => (bool) ($row['mfa_enabled'] ?? false),
                'password_changed_at' => now(),
                'email_verified_at' => now(),
            ]);
            $created++;
        }

        AuditLogger::record($request->user(), 'transaction', 'users', 'bulk_import', null, [], ['created' => $created], $request, 'info', 'Admin bulk-imported users.');

        return response()->json(['data' => ['created_count' => $created]]);
    }

    private function readCsv(string $path): array
    {
        $handle = fopen($path, 'r');
        $header = fgetcsv($handle) ?: [];
        $rows = [];
        $rowNumber = 1;

        while (($line = fgetcsv($handle)) !== false) {
            $rowNumber++;
            if (count(array_filter($line, fn ($value) => $value !== null && $value !== '')) === 0) {
                continue;
            }
            $values = array_slice(array_pad($line, count($header), null), 0, count($header));
            $mapped = array_combine($header, $values) ?: [];
            $rows[] = ['row_number' => $rowNumber, ...$mapped];
        }

        fclose($handle);
        return $rows;
    }

    private function validateImportRows(array $rows): array
    {
        $validRows = [];
        $failedRows = [];
        $seenEmails = [];

        foreach ($rows as $index => $row) {
            $row['row_number'] = $row['row_number'] ?? ($index + 2);
            $row['email'] = strtolower(trim((string) ($row['email'] ?? '')));
            $row['role'] = strtoupper(trim((string) ($row['role'] ?? '')));
            $row['section'] = strtoupper(trim((string) ($row['section'] ?? 'GENERAL')));
            $row['status'] = strtolower(trim((string) ($row['status'] ?? 'active')));
            $row['mfa_enabled'] = filter_var($row['mfa_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN);

            $validator = Validator::make($row, [
                'full_name' => ['required', 'string', 'max:255'],
                'email' => ['required', 'email', 'max:255', 'unique:users,email'],
                'password' => ['required', 'string', PasswordRule::min(8)->mixedCase()->numbers()->symbols()],
                'role' => ['required', 'string', 'max:32'],
                'section' => ['required', 'string', 'max:32'],
                'status' => ['required', Rule::in(['active', 'inactive', 'suspended'])],
                'mfa_enabled' => ['nullable', 'boolean'],
            ]);

            $errors = $validator->errors()->all();
            if (isset($seenEmails[$row['email']])) {
                $errors[] = 'Duplicate email in import file.';
            }
            $seenEmails[$row['email']] = true;

            if ($errors) {
                $row['errors'] = $errors;
                $failedRows[] = $row;
            } else {
                $validRows[] = $validator->validated();
            }
        }

        return [
            'total_rows' => count($rows),
            'success_count' => count($validRows),
            'failed_count' => count($failedRows),
            'valid_rows' => $validRows,
            'failed_rows' => $failedRows,
        ];
    }

    private function userQuery(Request $request)
    {
        $sortBy = (string) $request->query('sort_by', 'name');
        $sortDir = strtolower((string) $request->query('sort_dir', 'asc')) === 'desc' ? 'desc' : 'asc';
        $allowedSorts = ['name', 'email', 'role', 'section', 'status', 'last_login_at', 'created_at'];
        if (!in_array($sortBy, $allowedSorts, true)) {
            $sortBy = 'name';
        }

        return User::query()
            ->with('roleRecord')
            ->when(
                strtoupper((string) $request->user()->role) !== 'ADMIN',
                fn ($query) => $query->where('is_active', true)->where('status', 'active')
            )
            ->when($request->query('search'), function ($query, $search) {
                $query->where(function ($subquery) use ($search) {
                    $subquery->where('name', 'ilike', "%{$search}%")
                        ->orWhere('email', 'ilike', "%{$search}%")
                        ->orWhere('role', 'ilike', "%{$search}%")
                        ->orWhere('section', 'ilike', "%{$search}%");
                });
            })
            ->when($request->query('role'), fn ($query, $role) => $query->whereRaw('UPPER(role) = ?', [strtoupper((string) $role)]))
            ->when($request->query('section'), fn ($query, $section) => $query->whereRaw('UPPER(section) = ?', [strtoupper((string) $section)]))
            ->when($request->query('status'), function ($query, $status) {
                if ($status === 'active') {
                    $query->where(function ($subquery) {
                        $subquery->where('status', 'active')->orWhere('is_active', true);
                    });
                } elseif ($status === 'inactive') {
                    $query->where(function ($subquery) {
                        $subquery->where('status', 'inactive')->orWhere('is_active', false);
                    });
                } else {
                    $query->where('status', $status);
                }
            })
            ->orderBy($sortBy, $sortDir);
    }


    private function friendlyDevice(string $userAgent): string
    {
        if ($userAgent === '') {
            return 'Unknown device';
        }

        $browser = str_contains($userAgent, 'Edg/') ? 'Edge' : (str_contains($userAgent, 'Chrome/') ? 'Chrome' : (str_contains($userAgent, 'Firefox/') ? 'Firefox' : (str_contains($userAgent, 'Safari/') ? 'Safari' : 'Browser')));
        $platform = str_contains($userAgent, 'Windows') ? 'Windows' : (str_contains($userAgent, 'Android') ? 'Android' : (str_contains($userAgent, 'iPhone') || str_contains($userAgent, 'iPad') ? 'iOS' : (str_contains($userAgent, 'Linux') ? 'Linux' : 'Device')));

        return $browser.' on '.$platform;
    }

    private function ensureAdmin(Request $request): void
    {
        abort_unless(strtoupper((string) $request->user()->role) === 'ADMIN', 403);
    }

    private function findOrCreateRole(string $role): ?Role
    {
        $name = strtoupper($role);

        return Role::firstOrCreate(
            ['name' => $name],
            ['display_name' => ucwords(strtolower(str_replace('_', ' ', $name))), 'description' => 'Auto-created role.']
        );
    }

    private function serializeUser(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'full_name' => $user->name,
            'email' => $user->email,
            'role' => strtoupper((string) $user->role),
            'role_id' => $user->role_id ? (string) $user->role_id : null,
            'role_name' => $user->roleRecord?->display_name,
            'section' => strtoupper((string) $user->section),
            'is_active' => (bool) $user->is_active,
            'status' => $user->status ?: ((bool) $user->is_active ? 'active' : 'inactive'),
            'mfa_enabled' => (bool) $user->mfa_enabled,
            'last_login_at' => optional($user->last_login_at)?->toISOString(),
            'last_seen_at' => optional($user->last_seen_at)?->toISOString(),
            'created_date' => optional($user->created_at)?->toISOString(),
        ];
    }

    private function serializeDirectoryUser(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'full_name' => $user->name,
            'email' => $user->email,
            'role' => strtoupper((string) $user->role),
            'role_name' => $user->roleRecord?->display_name,
            'section' => strtoupper((string) $user->section),
            'status' => $user->status ?: ((bool) $user->is_active ? 'active' : 'inactive'),
            'is_active' => (bool) $user->is_active,
        ];
    }
}
