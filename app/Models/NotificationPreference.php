<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotificationPreference extends Model
{
    protected $fillable = [
        'user_id',
        'in_app_enabled',
        'email_enabled',
        'sms_enabled',
        'warning_enabled',
        'critical_enabled',
        'system_enabled',
        'reminder_enabled',
        'popup_enabled',
        'channels',
    ];

    protected function casts(): array
    {
        return [
            'in_app_enabled' => 'boolean',
            'email_enabled' => 'boolean',
            'sms_enabled' => 'boolean',
            'warning_enabled' => 'boolean',
            'critical_enabled' => 'boolean',
            'system_enabled' => 'boolean',
            'reminder_enabled' => 'boolean',
            'popup_enabled' => 'boolean',
            'channels' => 'array',
        ];
    }
}
