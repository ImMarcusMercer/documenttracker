<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DocumentAction extends Model
{
    protected $fillable = [
        'document_id',
        'action_type',
        'from_user_id',
        'from_user',
        'from_user_name',
        'to_user_id',
        'to_user',
        'to_user_name',
        'notes',
        'new_status',
    ];

    public function document()
    {
        return $this->belongsTo(Document::class);
    }

    public function fromUser()
    {
        return $this->belongsTo(User::class, 'from_user_id');
    }

    public function toUser()
    {
        return $this->belongsTo(User::class, 'to_user_id');
    }
}
