<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('support_tickets')) {
            Schema::create('support_tickets', function (Blueprint $table) {
                $table->id();
                $table->string('ticket_number', 40)->unique();
                $table->foreignId('requester_user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('assigned_to_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('subject');
                $table->text('description');
                $table->string('category', 64)->default('general')->index();
                $table->string('priority', 32)->default('normal')->index();
                $table->string('status', 32)->default('open')->index();
                $table->text('resolution')->nullable();
                $table->timestamp('last_response_at')->nullable()->index();
                $table->timestamp('closed_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->index(['requester_user_id', 'status']);
                $table->index(['assigned_to_id', 'status']);
                $table->index(['created_at', 'priority']);
            });
        }

        if (!Schema::hasTable('support_ticket_messages')) {
            Schema::create('support_ticket_messages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('support_ticket_id')->constrained('support_tickets')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->text('message');
                $table->boolean('is_internal_note')->default(false)->index();
                $table->json('attachments')->nullable();
                $table->timestamps();

                $table->index(['support_ticket_id', 'created_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('support_ticket_messages');
        Schema::dropIfExists('support_tickets');
    }
};
