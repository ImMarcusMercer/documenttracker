<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserProfile extends Model
{
    protected $fillable = ['user_id', 'phone', 'address', 'profile_image', 'preferences'];

    protected function casts(): array
    {
        return ['preferences' => 'array'];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
