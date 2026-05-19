<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserProfile;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    public function show(Request $request)
    {
        $user = $request->user()->load('profile', 'roleRecord');

        return response()->json(['data' => $this->serializeProfile($user)]);
    }

    public function update(Request $request)
    {
        $user = $request->user()->load('profile');
        $data = $request->validate([
            'full_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40', 'regex:/^[+0-9() .-]{7,40}$/'],
            'address' => ['nullable', 'string', 'max:1000'],
            'mfa_enabled' => ['nullable', 'boolean'],
            'avatar' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048', 'dimensions:min_width=64,min_height=64'],
        ]);

        $oldValues = [
            ...$user->only(['name', 'avatar_url', 'mfa_enabled']),
            'phone' => $user->profile?->phone,
            'address' => $user->profile?->address,
        ];

        if (array_key_exists('full_name', $data)) {
            $user->name = strip_tags($data['full_name']);
        }

        if (array_key_exists('mfa_enabled', $data)) {
            $user->mfa_enabled = (bool) $data['mfa_enabled'];
        }

        if ($request->hasFile('avatar')) {
            if ($user->avatar_path) {
                Storage::disk('public')->delete($user->avatar_path);
            }

            $path = $request->file('avatar')->store('avatars', 'public');
            $user->avatar_path = $path;
            $user->avatar_url = Storage::disk('public')->url($path);
        }

        $user->save();

        UserProfile::updateOrCreate(
            ['user_id' => $user->id],
            [
                'phone' => array_key_exists('phone', $data) ? strip_tags((string) $data['phone']) : $user->profile?->phone,
                'address' => array_key_exists('address', $data) ? strip_tags((string) $data['address']) : $user->profile?->address,
                'profile_image' => $user->avatar_url,
            ]
        );

        $user->refresh()->load('profile', 'roleRecord');

        AuditLogger::record($user, 'transaction', 'profile', 'update', $user, $oldValues, [
            ...$user->only(['name', 'avatar_url', 'mfa_enabled']),
            'phone' => $user->profile?->phone,
            'address' => $user->profile?->address,
        ], $request, 'info', 'User updated profile.');

        return response()->json(['data' => $this->serializeProfile($user)]);
    }

    private function serializeProfile($user): array
    {
        return [
            'id' => (string) $user->id,
            'full_name' => $user->name,
            'email' => $user->email,
            'role' => strtoupper((string) $user->role),
            'role_name' => $user->roleRecord?->display_name,
            'section' => strtoupper((string) $user->section),
            'status' => $user->status ?: ($user->is_active ? 'active' : 'inactive'),
            'avatar_url' => $user->avatar_url,
            'phone' => $user->profile?->phone,
            'address' => $user->profile?->address,
            'mfa_enabled' => (bool) $user->mfa_enabled,
            'last_login_at' => optional($user->last_login_at)?->toISOString(),
            'last_seen_at' => optional($user->last_seen_at)?->toISOString(),
            'created_date' => optional($user->created_at)?->toISOString(),
        ];
    }
}
