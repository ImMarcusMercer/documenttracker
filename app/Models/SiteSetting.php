<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SiteSetting extends Model
{
    protected $fillable = ['group_name', 'key_name', 'value', 'type', 'description'];

    protected function casts(): array
    {
        return ['value' => 'array'];
    }
}
