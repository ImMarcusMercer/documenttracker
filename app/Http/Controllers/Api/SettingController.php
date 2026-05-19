<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use App\Support\AuditLogger;
use App\Support\SiteSettings;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    public function index(Request $request)
    {
        $this->ensureSettingsViewer($request);

        $query = SiteSetting::query();
        if (strtoupper((string) $request->user()->role) === 'DEVELOPER') {
            $query->whereIn('group_name', ['developer', 'backup', 'audit', 'system']);
        }

        return response()->json([
            'data' => $query
                ->orderBy('group_name')
                ->orderBy('key_name')
                ->get()
                ->groupBy('group_name')
                ->map(fn ($group) => $group->mapWithKeys(fn (SiteSetting $setting) => [
                    $setting->key_name => [
                        'value' => $setting->value,
                        'type' => $setting->type,
                        'description' => $setting->description,
                    ],
                ])),
        ]);
    }

    public function update(Request $request)
    {
        $this->ensureSettingsViewer($request);

        $data = $request->validate([
            'group_name' => ['required', 'string', 'max:64'],
            'key_name' => ['required', 'string', 'max:128'],
            'value' => ['nullable'],
            'type' => ['nullable', 'string', 'max:32'],
            'description' => ['nullable', 'string'],
        ]);

        if (strtoupper((string) $request->user()->role) === 'DEVELOPER' && ($data['group_name'] ?? '') !== 'developer') {
            abort(403, 'Developers may only update developer settings.');
        }

        $setting = SiteSetting::updateOrCreate(
            ['group_name' => $data['group_name'], 'key_name' => $data['key_name']],
            [
                'value' => $this->normalizeValue($data['value'] ?? null),
                'type' => $data['type'] ?? 'string',
                'description' => $data['description'] ?? null,
            ]
        );

        SiteSettings::forget($setting->group_name, $setting->key_name);

        AuditLogger::record($request->user(), 'transaction', 'settings', 'update', $setting, [], $setting->toArray(), $request, 'warning', 'Admin updated site setting.');

        return response()->json(['data' => $setting]);
    }

    private function normalizeValue(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }

        return ['value' => $value];
    }

    private function ensureSettingsViewer(Request $request): void
    {
        abort_unless(in_array(strtoupper((string) $request->user()->role), ['ADMIN', 'DEVELOPER'], true), 403);
    }
}
