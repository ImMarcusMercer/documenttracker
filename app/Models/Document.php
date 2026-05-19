<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Document extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'control_number',
        'classification',
        'section',
        'particulars',
        'source_office',
        'requestor',
        'amount',
        'received_date',
        'remarks',
        'status',
        'physical_received',
        'file_url',
        'file_path',
        'file_name',
        'file_mime',
        'file_size',
        'memo_file_url',
        'memo_file_path',
        'memo_file_name',
        'memo_file_mime',
        'memo_file_size',
        'trip_ticket_file_url',
        'trip_ticket_file_path',
        'trip_ticket_file_name',
        'trip_ticket_file_mime',
        'trip_ticket_file_size',
        'ocr_status',
        'ocr_text',
        'ocr_confidence',
        'extracted_fields',
        'extraction_reviewed_at',
        'extraction_reviewed_by_id',
        'return_reason',
        'released_date',
        'created_by_id',
        'current_holder_id',
        'current_holder',
        'current_holder_name',
        'current_holder_role',
        'forwarded_to',
        'linked_document_id',
        'lock_version',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'received_date' => 'date',
            'released_date' => 'date',
            'physical_received' => 'boolean',
            'extracted_fields' => 'array',
            'extraction_reviewed_at' => 'datetime',
            'lock_version' => 'integer',
        ];
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function extractionReviewedBy()
    {
        return $this->belongsTo(User::class, 'extraction_reviewed_by_id');
    }

    public function currentHolderUser()
    {
        return $this->belongsTo(User::class, 'current_holder_id');
    }

    public function linkedDocument()
    {
        return $this->belongsTo(Document::class, 'linked_document_id');
    }

    public function actions()
    {
        return $this->hasMany(DocumentAction::class);
    }
}
