<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            if (!Schema::hasColumn('notifications', 'severity')) {
                $table->string('severity', 32)->default('info')->index()->after('type');
            }
            if (!Schema::hasColumn('notifications', 'delivery_methods')) {
                $table->json('delivery_methods')->nullable()->after('message');
            }
            if (!Schema::hasColumn('notifications', 'metadata')) {
                $table->json('metadata')->nullable()->after('delivery_methods');
            }
            if (!Schema::hasColumn('notifications', 'delivered_at')) {
                $table->timestamp('delivered_at')->nullable()->after('read_at');
            }
            if (!Schema::hasColumn('notifications', 'emailed_at')) {
                $table->timestamp('emailed_at')->nullable()->after('delivered_at');
            }
        });

        Schema::table('notification_preferences', function (Blueprint $table) {
            if (!Schema::hasColumn('notification_preferences', 'system_enabled')) {
                $table->boolean('system_enabled')->default(true)->after('critical_enabled');
            }
            if (!Schema::hasColumn('notification_preferences', 'reminder_enabled')) {
                $table->boolean('reminder_enabled')->default(true)->after('system_enabled');
            }
            if (!Schema::hasColumn('notification_preferences', 'popup_enabled')) {
                $table->boolean('popup_enabled')->default(true)->after('reminder_enabled');
            }
            if (!Schema::hasColumn('notification_preferences', 'sms_enabled')) {
                $table->boolean('sms_enabled')->default(false)->after('email_enabled');
            }
        });
    }

    public function down(): void
    {
        Schema::table('notification_preferences', function (Blueprint $table) {
            foreach (['sms_enabled', 'popup_enabled', 'reminder_enabled', 'system_enabled'] as $column) {
                if (Schema::hasColumn('notification_preferences', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::table('notifications', function (Blueprint $table) {
            foreach (['emailed_at', 'delivered_at', 'metadata', 'delivery_methods', 'severity'] as $column) {
                if (Schema::hasColumn('notifications', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
