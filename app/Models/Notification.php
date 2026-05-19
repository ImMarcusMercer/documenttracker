<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $fillable = [
        'recipient_user_id',
        'recipient_email',
        'recipient_name',
        'document_id',
        'control_number',
        'type',
        'severity',
        'title',
        'message',
        'delivery_methods',
        'metadata',
        'is_read',
        'read_at',
        'delivered_at',
        'emailed_at',
    ];

    protected function casts(): array
    {
        return [
            'is_read' => 'boolean',
            'delivery_methods' => 'array',
            'metadata' => 'array',
            'read_at' => 'datetime',
            'delivered_at' => 'datetime',
            'emailed_at' => 'datetime',
        ];
    }

    public function recipient()
    {
        return $this->belongsTo(User::class, 'recipient_user_id');
    }

    public function document()
    {
        return $this->belongsTo(Document::class);
    }
}
