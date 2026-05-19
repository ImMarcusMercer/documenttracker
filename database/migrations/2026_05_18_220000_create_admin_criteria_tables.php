<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name', 64)->unique();
            $table->string('display_name')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('permissions', function (Blueprint $table) {
            $table->id();
            $table->string('module_name', 64);
            $table->string('action_name', 64);
            $table->text('description')->nullable();
            $table->timestamps();

            $table->unique(['module_name', 'action_name']);
        });

        Schema::create('role_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->foreignId('permission_id')->constrained('permissions')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['role_id', 'permission_id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('role_id')->nullable()->constrained('roles')->nullOnDelete();
            $table->string('status', 32)->default('active')->index();
            $table->string('avatar_path')->nullable();
            $table->string('avatar_url')->nullable();
            $table->boolean('mfa_enabled')->default(false);
            $table->string('mfa_code_hash')->nullable();
            $table->timestamp('mfa_expires_at')->nullable();
            $table->unsignedSmallInteger('failed_login_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('password_changed_at')->nullable();
        });

        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->string('phone')->nullable();
            $table->text('address')->nullable();
            $table->string('profile_image')->nullable();
            $table->json('preferences')->nullable();
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('user_email')->nullable();
            $table->string('event_type', 64)->index();
            $table->string('module_name', 64)->nullable()->index();
            $table->string('action_name', 64)->nullable()->index();
            $table->string('auditable_type')->nullable();
            $table->unsignedBigInteger('auditable_id')->nullable();
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->string('severity', 32)->default('info')->index();
            $table->text('message')->nullable();
            $table->timestamps();

            $table->index(['auditable_type', 'auditable_id']);
            $table->index(['created_at', 'severity']);
        });

        Schema::create('site_settings', function (Blueprint $table) {
            $table->id();
            $table->string('group_name', 64);
            $table->string('key_name', 128);
            $table->json('value')->nullable();
            $table->string('type', 32)->default('string');
            $table->text('description')->nullable();
            $table->timestamps();

            $table->unique(['group_name', 'key_name']);
        });

        Schema::create('backup_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('backup_type', 32)->default('manual');
            $table->string('status', 32)->default('pending')->index();
            $table->string('file_path')->nullable();
            $table->string('file_name')->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->string('checksum')->nullable();
            $table->text('message')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('notification_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->boolean('in_app_enabled')->default(true);
            $table->boolean('email_enabled')->default(true);
            $table->boolean('warning_enabled')->default(true);
            $table->boolean('critical_enabled')->default(true);
            $table->json('channels')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_preferences');
        Schema::dropIfExists('backup_runs');
        Schema::dropIfExists('site_settings');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('user_profiles');

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('role_id');
            $table->dropColumn([
                'status',
                'avatar_path',
                'avatar_url',
                'mfa_enabled',
                'mfa_code_hash',
                'mfa_expires_at',
                'failed_login_attempts',
                'locked_until',
                'last_login_at',
                'last_seen_at',
                'password_changed_at',
            ]);
        });

        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
    }
};
