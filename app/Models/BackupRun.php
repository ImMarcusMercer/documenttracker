<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BackupRun extends Model
{
    protected $fillable = [
        'created_by_id',
        'backup_type',
        'status',
        'file_path',
        'file_name',
        'file_size',
        'checksum',
        'destination_status',
        'integrity_verified',
        'message',
        'completed_at',
        'retention_expires_at',
    ];

    protected function casts(): array
    {
        return [
            'destination_status' => 'array',
            'integrity_verified' => 'boolean',
            'completed_at' => 'datetime',
            'retention_expires_at' => 'datetime',
        ];
    }
}
