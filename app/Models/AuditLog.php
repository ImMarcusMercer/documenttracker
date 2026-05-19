<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $fillable = [
        'user_id',
        'user_email',
        'event_type',
        'module_name',
        'action_name',
        'auditable_type',
        'auditable_id',
        'old_values',
        'new_values',
        'ip_address',
        'user_agent',
        'severity',
        'category',
        'risk_score',
        'source',
        'is_suspicious',
        'metadata',
        'message',
        'archived_at',
    ];

    protected function casts(): array
    {
        return [
            'old_values' => 'array',
            'new_values' => 'array',
            'archived_at' => 'datetime',
            'metadata' => 'array',
            'is_suspicious' => 'boolean',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
