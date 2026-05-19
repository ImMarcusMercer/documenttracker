<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('backup_runs', function (Blueprint $table) {
            if (!Schema::hasColumn('backup_runs', 'destination_status')) {
                $table->json('destination_status')->nullable()->after('checksum');
            }
            if (!Schema::hasColumn('backup_runs', 'integrity_verified')) {
                $table->boolean('integrity_verified')->default(false)->after('destination_status');
            }
            if (!Schema::hasColumn('backup_runs', 'retention_expires_at')) {
                $table->timestamp('retention_expires_at')->nullable()->after('completed_at');
            }
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('audit_logs', 'archived_at')) {
                $table->timestamp('archived_at')->nullable()->index()->after('message');
            }
        });

        Schema::create('report_favorites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name');
            $table->string('report_type', 64)->index();
            $table->json('filters')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'name']);
        });

        Schema::create('scheduled_report_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('report_type', 64)->default('transaction_summary');
            $table->json('filters')->nullable();
            $table->string('status', 32)->default('pending')->index();
            $table->string('file_path')->nullable();
            $table->string('file_name')->nullable();
            $table->text('message')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scheduled_report_runs');
        Schema::dropIfExists('report_favorites');

        Schema::table('audit_logs', function (Blueprint $table) {
            if (Schema::hasColumn('audit_logs', 'archived_at')) {
                $table->dropColumn('archived_at');
            }
        });

        Schema::table('backup_runs', function (Blueprint $table) {
            $columns = [];
            foreach (['destination_status', 'integrity_verified', 'retention_expires_at'] as $column) {
                if (Schema::hasColumn('backup_runs', $column)) {
                    $columns[] = $column;
                }
            }
            if ($columns) {
                $table->dropColumn($columns);
            }
        });
    }
};
