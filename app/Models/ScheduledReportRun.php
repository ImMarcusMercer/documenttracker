<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ScheduledReportRun extends Model
{
    protected $fillable = [
        'created_by_id',
        'report_type',
        'filters',
        'status',
        'file_path',
        'file_name',
        'message',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'filters' => 'array',
            'completed_at' => 'datetime',
        ];
    }
}
