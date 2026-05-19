<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documents', function (Blueprint $table) {
            $table->id();
            $table->string('control_number', 32)->unique();
            $table->string('classification', 64);
            $table->string('section', 32);
            $table->text('particulars');
            $table->string('source_office')->nullable();
            $table->string('requestor')->nullable();
            $table->decimal('amount', 15, 2)->nullable();
            $table->date('received_date');
            $table->text('remarks')->nullable();
            $table->string('status', 32)->default('Pending Receipt');
            $table->boolean('physical_received')->default(false);
            $table->string('file_url')->nullable();
            $table->string('memo_file_url')->nullable();
            $table->string('trip_ticket_file_url')->nullable();
            $table->text('return_reason')->nullable();
            $table->date('released_date')->nullable();
            $table->foreignId('created_by_id')->constrained('users');
            $table->foreignId('current_holder_id')->nullable()->constrained('users');
            $table->string('current_holder')->nullable();
            $table->string('current_holder_name')->nullable();
            $table->string('current_holder_role', 32)->nullable();
            $table->string('forwarded_to')->nullable();
            $table->foreignId('linked_document_id')->nullable()->constrained('documents')->nullOnDelete();
            $table->timestamps();

            $table->index(['section', 'status']);
            $table->index('received_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents');
    }
};
