<?php

namespace App\Support;

use App\Models\SiteSetting;
use Illuminate\Support\Facades\Cache;

class SiteSettings
{
    public static function get(string $group, string $key, mixed $default = null): mixed
    {
        $cacheKey = "site_setting.{$group}.{$key}";

        try {
            return Cache::remember($cacheKey, 60, function () use ($group, $key, $default) {
                $setting = SiteSetting::query()
                    ->where('group_name', $group)
                    ->where('key_name', $key)
                    ->first();

                if (!$setting) {
                    return $default;
                }

                return self::normalizeValue($setting->value, $default);
            });
        } catch (\Throwable) {
            return $default;
        }
    }

    public static function forget(string $group, string $key): void
    {
        Cache::forget("site_setting.{$group}.{$key}");
    }

    public static function normalizeValue(mixed $value, mixed $default = null): mixed
    {
        if (is_array($value) && array_key_exists('value', $value) && count($value) === 1) {
            return $value['value'];
        }

        if ($value === null) {
            return $default;
        }

        return $value;
    }

    public static function integer(string $group, string $key, int $default): int
    {
        $value = self::get($group, $key, $default);
        return is_numeric($value) ? max(0, (int) $value) : $default;
    }

    public static function boolean(string $group, string $key, bool $default = false): bool
    {
        $value = self::get($group, $key, $default);
        if (is_bool($value)) {
            return $value;
        }

        return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $default;
    }
}
