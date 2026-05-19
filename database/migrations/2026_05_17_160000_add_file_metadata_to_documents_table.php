<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->string('file_path')->nullable();
            $table->string('file_name')->nullable();
            $table->string('file_mime')->nullable();
            $table->unsignedBigInteger('file_size')->nullable();

            $table->string('memo_file_path')->nullable();
            $table->string('memo_file_name')->nullable();
            $table->string('memo_file_mime')->nullable();
            $table->unsignedBigInteger('memo_file_size')->nullable();

            $table->string('trip_ticket_file_path')->nullable();
            $table->string('trip_ticket_file_name')->nullable();
            $table->string('trip_ticket_file_mime')->nullable();
            $table->unsignedBigInteger('trip_ticket_file_size')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropColumn([
                'file_path',
                'file_name',
                'file_mime',
                'file_size',
                'memo_file_path',
                'memo_file_name',
                'memo_file_mime',
                'memo_file_size',
                'trip_ticket_file_path',
                'trip_ticket_file_name',
                'trip_ticket_file_mime',
                'trip_ticket_file_size',
            ]);
        });
    }
};
