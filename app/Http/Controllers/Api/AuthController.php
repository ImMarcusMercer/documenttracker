<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\SiteSettings;
use App\Support\NotificationDispatcher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $email = strtolower(trim((string) $credentials['email']));

        /** @var User|null $user */
        $user = User::query()
            ->where('email', $email)
            ->first();

        if (!$user) {
            AuditLogger::record(null, 'authentication', 'auth', 'login_failed', null, [], ['email' => $email], $request, 'warning', 'Unknown email login attempt.');
            throw ValidationException::withMessages([
                'email' => ['No account was found for that email address.'],
            ]);
        }

        if ($user->locked_until && $user->locked_until->isFuture()) {
            AuditLogger::record($user, 'authentication', 'auth', 'locked_login_blocked', $user, [], [], $request, 'critical', 'Blocked login because account is temporarily locked.');

            return response()->json([
                'message' => 'This account is temporarily locked. Try again after '.$user->locked_until->format('Y-m-d H:i:s').'.',
                'type' => 'account_locked',
                'severity' => 'critical',
                'locked_until' => $user->locked_until->toISOString(),
            ], 423);
        }

        if (!$user->is_active || ($user->status && strtolower((string) $user->status) !== 'active')) {
            AuditLogger::record($user, 'authentication', 'auth', 'inactive_login_blocked', $user, [], [], $request, 'warning', 'Inactive account login attempt.');
            throw ValidationException::withMessages([
                'email' => ['This account is inactive or suspended. Please contact an administrator.'],
            ]);
        }

        if (!Hash::check($credentials['password'], $user->password)) {
            return $this->handleFailedLogin($request, $user);
        }

        if ($this->mfaRequired($user)) {
            $code = (string) random_int(100000, 999999);
            $ttl = SiteSettings::integer('security', 'mfa_code_ttl_minutes', (int) env('MFA_CODE_TTL_MINUTES', 10));

            $user->forceFill([
                'mfa_code_hash' => Hash::make($code),
                'mfa_expires_at' => now()->addMinutes(max(1, $ttl)),
            ])->save();

            try {
                Mail::raw("Your DocTracker sign-in code is {$code}. It expires in {$ttl} minutes.", function ($message) use ($user) {
                    $message->to($user->email)->subject('DocTracker One-Time Password');
                });
            } catch (\Throwable $exception) {
                AuditLogger::record($user, 'authentication', 'auth', 'mfa_send_failed', $user, [], ['error' => $exception->getMessage()], $request, 'critical', 'MFA email could not be sent.');

                return response()->json([
                    'message' => 'The sign-in code could not be sent. Check the mail settings in .env and Admin Site Settings.',
                    'type' => 'mfa_email_failed',
                    'severity' => 'critical',
                ], 500);
            }

            AuditLogger::record($user, 'authentication', 'auth', 'mfa_challenge_sent', $user, [], ['ttl_minutes' => $ttl], $request, 'info', 'MFA challenge sent by email.');

            return response()->json([
                'mfa_required' => true,
                'email' => $user->email,
                'message' => 'A one-time verification code was sent to your email.',
                'expires_in_minutes' => $ttl,
            ]);
        }

        $this->completeLogin($request, $user, (bool) ($credentials['remember'] ?? false));

        return response()->json([
            'user' => $this->serializeUser($user->fresh(['roleRecord', 'profile'])),
            'session_policy' => $this->sessionPolicy(),
        ]);
    }

    public function verifyMfa(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'code' => ['required', 'digits:6'],
            'remember' => ['nullable', 'boolean'],
        ]);

        /** @var User $user */
        $user = User::query()->where('email', strtolower($data['email']))->firstOrFail();

        if (!$user->mfa_expires_at || $user->mfa_expires_at->isPast() || !Hash::check($data['code'], (string) $user->mfa_code_hash)) {
            AuditLogger::record($user, 'authentication', 'auth', 'mfa_failed', $user, [], [], $request, 'warning', 'Invalid or expired MFA code.');
            throw ValidationException::withMessages([
                'code' => ['The verification code is invalid or expired.'],
            ]);
        }

        $user->forceFill([
            'mfa_code_hash' => null,
            'mfa_expires_at' => null,
        ])->save();

        $this->completeLogin($request, $user, (bool) ($data['remember'] ?? false));

        return response()->json([
            'user' => $this->serializeUser($user->fresh(['roleRecord', 'profile'])),
            'session_policy' => $this->sessionPolicy(),
        ]);
    }

    public function forgotPassword(Request $request)
    {
        $data = $request->validate(['email' => ['required', 'email']]);

        $status = Password::sendResetLink(['email' => strtolower($data['email'])]);

        AuditLogger::record(null, 'authentication', 'auth', 'password_reset_requested', null, [], ['email' => $data['email'], 'status' => $status], $request, 'info', 'Password reset link requested.');

        return response()->json([
            'message' => __($status),
        ]);
    }

    public function resetPassword(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', $this->passwordRule()],
        ]);

        $status = Password::reset($data, function (User $user, string $password) {
            $user->forceFill([
                'password' => Hash::make($password),
                'password_changed_at' => now(),
                'failed_login_attempts' => 0,
                'locked_until' => null,
            ])->save();
        });

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => [__($status)]]);
        }

        AuditLogger::record(null, 'authentication', 'auth', 'password_reset_completed', null, [], ['email' => $data['email']], $request, 'info', 'Password reset completed.');

        return response()->json(['message' => __($status)]);
    }

    public function me(Request $request)
    {
        /** @var User $user */
        $user = $request->user();
        $user->forceFill(['last_seen_at' => now()])->save();

        return response()->json([
            'user' => $this->serializeUser($user->fresh(['roleRecord', 'profile'])),
            'session_policy' => $this->sessionPolicy(),
        ]);
    }

    public function logout(Request $request)
    {
        AuditLogger::record($request->user(), 'authentication', 'auth', 'logout', $request->user(), [], [], $request, 'info', 'User logged out.');

        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    private function handleFailedLogin(Request $request, User $user)
    {
        $warningThreshold = max(1, SiteSettings::integer('security', 'failed_login_warning_threshold', 3));
        $lockoutThreshold = max($warningThreshold + 1, SiteSettings::integer('security', 'failed_login_lockout_threshold', 5));
        $lockoutMinutes = max(1, SiteSettings::integer('security', 'failed_login_lockout_minutes', 30));

        $user->failed_login_attempts = (int) $user->failed_login_attempts + 1;
        $severity = $user->failed_login_attempts >= $warningThreshold ? 'warning' : 'info';
        $message = 'Incorrect password login attempt.';
        $httpStatus = 422;
        $publicMessage = 'The password you entered is incorrect.';

        if ($user->failed_login_attempts >= $lockoutThreshold) {
            $user->locked_until = now()->addMinutes($lockoutMinutes);
            $severity = 'critical';
            $message = "Account locked after {$lockoutThreshold} failed login attempts.";
            $publicMessage = "Account locked after {$lockoutThreshold} failed login attempts. Try again in {$lockoutMinutes} minutes.";
            $httpStatus = 423;
        } elseif ($user->failed_login_attempts >= $warningThreshold) {
            $remaining = max(0, $lockoutThreshold - $user->failed_login_attempts);
            $publicMessage = "Incorrect password. Warning: {$remaining} attempt(s) remaining before temporary lockout.";
        }

        $user->save();
        AuditLogger::record($user, 'authentication', 'auth', 'login_failed', $user, [], ['failed_login_attempts' => $user->failed_login_attempts, 'lockout_threshold' => $lockoutThreshold], $request, $severity, $message);

        if (in_array($severity, ['warning', 'critical'], true)) {
            NotificationDispatcher::notifyAdmins([
                'type' => $severity === 'critical' ? 'critical' : 'warning',
                'severity' => $severity,
                'title' => $severity === 'critical' ? 'Account lockout triggered' : 'Repeated failed login attempts',
                'message' => $user->email.' has '.$user->failed_login_attempts.' failed login attempt(s). IP: '.$request->ip(),
                'metadata' => [
                    'email' => $user->email,
                    'failed_login_attempts' => $user->failed_login_attempts,
                    'lockout_threshold' => $lockoutThreshold,
                    'ip_address' => $request->ip(),
                ],
            ], $request);
        }

        return response()->json([
            'message' => $publicMessage,
            'errors' => ['password' => [$publicMessage]],
            'type' => $httpStatus === 423 ? 'account_locked' : 'failed_login',
            'severity' => $severity,
            'failed_login_attempts' => $user->failed_login_attempts,
            'lockout_threshold' => $lockoutThreshold,
            'locked_until' => optional($user->locked_until)?->toISOString(),
            'captcha_required' => $user->failed_login_attempts >= $warningThreshold,
            'admin_alert_email_configured' => filled(env('ADMIN_ALERT_EMAIL')) || filled(env('SECURITY_ALERT_EMAIL')),
        ], $httpStatus);
    }

    private function completeLogin(Request $request, User $user, bool $remember): void
    {
        $timeoutMinutes = SiteSettings::integer('security', 'session_timeout_minutes', (int) config('session.lifetime', 120));
        config(['session.lifetime' => max(1, $timeoutMinutes)]);

        Auth::login($user, $remember);
        $request->session()->regenerate();
        $request->session()->put('last_activity_at', time());

        if (SiteSettings::boolean('security', 'single_session_per_user', false)) {
            DB::table('sessions')
                ->where('user_id', $user->id)
                ->where('id', '!=', $request->session()->getId())
                ->delete();
        }

        $user->forceFill([
            'failed_login_attempts' => 0,
            'locked_until' => null,
            'last_login_at' => now(),
            'last_seen_at' => now(),
        ])->save();

        AuditLogger::record($user, 'authentication', 'auth', 'login_success', $user, [], ['remember' => $remember, 'timeout_minutes' => $timeoutMinutes], $request, 'info', 'User logged in successfully.');
    }

    private function mfaRequired(User $user): bool
    {
        if (!filter_var(env('MFA_EMAIL_ENABLED', true), FILTER_VALIDATE_BOOLEAN)) {
            return false;
        }

        return (bool) $user->mfa_enabled || SiteSettings::boolean('security', 'mfa_enforcement', filter_var(env('MFA_FORCE_FOR_ALL', false), FILTER_VALIDATE_BOOLEAN));
    }

    private function passwordRule(): PasswordRule
    {
        $policy = SiteSettings::get('security', 'password_policy', ['min' => 8, 'mixed_case' => true, 'numbers' => true, 'symbols' => true]);
        $rule = PasswordRule::min((int) ($policy['min'] ?? 8));

        if (($policy['mixed_case'] ?? true) === true) {
            $rule = $rule->mixedCase();
        }
        if (($policy['numbers'] ?? true) === true) {
            $rule = $rule->numbers();
        }
        if (($policy['symbols'] ?? true) === true) {
            $rule = $rule->symbols();
        }

        return $rule;
    }

    private function sessionPolicy(): array
    {
        return [
            'session_timeout_minutes' => SiteSettings::integer('security', 'session_timeout_minutes', (int) config('session.lifetime', 120)),
            'session_timeout_warning_minutes' => SiteSettings::integer('security', 'session_timeout_warning_minutes', 5),
            'single_session_per_user' => SiteSettings::boolean('security', 'single_session_per_user', false),
            'remember_me_days' => SiteSettings::integer('security', 'remember_me_days', 30),
        ];
    }

    private function serializeUser(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'full_name' => $user->name,
            'email' => $user->email,
            'email_verified_at' => optional($user->email_verified_at)?->toISOString(),
            'role' => strtoupper((string) $user->role),
            'role_id' => $user->role_id ? (string) $user->role_id : null,
            'role_name' => $user->roleRecord?->display_name,
            'section' => strtoupper((string) $user->section),
            'is_active' => (bool) $user->is_active,
            'status' => $user->status ?: ((bool) $user->is_active ? 'active' : 'inactive'),
            'avatar_url' => $user->avatar_url,
            'phone' => $user->profile?->phone,
            'address' => $user->profile?->address,
            'mfa_enabled' => (bool) $user->mfa_enabled,
            'last_login_at' => optional($user->last_login_at)?->toISOString(),
            'last_seen_at' => optional($user->last_seen_at)?->toISOString(),
            'created_date' => optional($user->created_at)?->toISOString(),
        ];
    }
}
