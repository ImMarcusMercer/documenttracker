<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->string('ocr_status', 32)->nullable()->after('trip_ticket_file_size');
            $table->longText('ocr_text')->nullable()->after('ocr_status');
            $table->unsignedTinyInteger('ocr_confidence')->nullable()->after('ocr_text');
            $table->json('extracted_fields')->nullable()->after('ocr_confidence');
            $table->timestamp('extraction_reviewed_at')->nullable()->after('extracted_fields');
            $table->foreignId('extraction_reviewed_by_id')->nullable()->after('extraction_reviewed_at')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('extraction_reviewed_by_id');
            $table->dropColumn([
                'ocr_status',
                'ocr_text',
                'ocr_confidence',
                'extracted_fields',
                'extraction_reviewed_at',
            ]);
        });
    }
};
