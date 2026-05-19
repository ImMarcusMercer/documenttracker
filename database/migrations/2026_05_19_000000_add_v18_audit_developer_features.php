<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('audit_logs', 'category')) {
                $table->string('category', 64)->default('system')->index()->after('severity');
            }
            if (!Schema::hasColumn('audit_logs', 'risk_score')) {
                $table->unsignedTinyInteger('risk_score')->default(10)->index()->after('category');
            }
            if (!Schema::hasColumn('audit_logs', 'source')) {
                $table->string('source', 64)->default('application')->index()->after('risk_score');
            }
            if (!Schema::hasColumn('audit_logs', 'is_suspicious')) {
                $table->boolean('is_suspicious')->default(false)->index()->after('source');
            }
            if (!Schema::hasColumn('audit_logs', 'metadata')) {
                $table->json('metadata')->nullable()->after('is_suspicious');
            }
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $columns = [];
            foreach (['category', 'risk_score', 'source', 'is_suspicious', 'metadata'] as $column) {
                if (Schema::hasColumn('audit_logs', $column)) {
                    $columns[] = $column;
                }
            }
            if ($columns) {
                $table->dropColumn($columns);
            }
        });
    }
};
