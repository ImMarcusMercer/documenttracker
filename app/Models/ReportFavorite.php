<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReportFavorite extends Model
{
    protected $fillable = ['user_id', 'name', 'report_type', 'filters'];

    protected function casts(): array
    {
        return ['filters' => 'array'];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
