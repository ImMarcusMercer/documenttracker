<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'role_id',
        'section',
        'is_active',
        'status',
        'avatar_path',
        'avatar_url',
        'mfa_enabled',
        'mfa_code_hash',
        'mfa_expires_at',
        'failed_login_attempts',
        'locked_until',
        'last_login_at',
        'last_seen_at',
        'password_changed_at',
        'email_verified_at',
    ];

    protected $hidden = ['password', 'remember_token', 'mfa_code_hash'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'is_active' => 'boolean',
            'mfa_enabled' => 'boolean',
            'mfa_expires_at' => 'datetime',
            'locked_until' => 'datetime',
            'last_login_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'password_changed_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    protected function fullName(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->name,
            set: fn (?string $value) => ['name' => $value]
        );
    }

    protected function avatarUrl(): Attribute
    {
        return Attribute::make(
            get: function ($value, array $attributes) {
                $path = $attributes['avatar_path'] ?? null;

                if ($path) {
                    return '/storage/'.ltrim((string) $path, '/');
                }

                return $value;
            }
        );
    }

    public function roleRecord()
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    public function profile()
    {
        return $this->hasOne(UserProfile::class);
    }

    public function notificationPreference()
    {
        return $this->hasOne(NotificationPreference::class);
    }

    public function documentActions()
    {
        return $this->hasMany(DocumentAction::class, 'from_user_id');
    }

    public function supportTickets()
    {
        return $this->hasMany(SupportTicket::class, 'requester_user_id');
    }

    public function assignedSupportTickets()
    {
        return $this->hasMany(SupportTicket::class, 'assigned_to_id');
    }

    public function hasPermission(string $module, string $action): bool
    {
        if (strtoupper((string) $this->role) === 'ADMIN') {
            return true;
        }

        $role = $this->roleRecord;
        if (!$role) {
            return false;
        }

        return $role->permissions()
            ->where('module_name', $module)
            ->whereIn('action_name', [$action, 'manage'])
            ->exists();
    }
}
