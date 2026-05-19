<?php

use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AttackSimulationController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BackupController;
use App\Http\Controllers\Api\ChatbotController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\HelpDeskTicketController;
use App\Http\Controllers\Api\DocumentActionController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\ImportExportController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\OcrController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SecurityMonitorController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\UploadController;
use App\Http\Controllers\Api\UserController;
use App\Http\Middleware\EnforceSessionPolicy;
use Illuminate\Support\Facades\Route;

Route::prefix('api/v1')->middleware('throttle:100,1')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])->name('api.login');
    Route::post('/mfa/verify', [AuthController::class, 'verifyMfa'])->name('api.mfa.verify');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->name('api.password.email');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->name('api.password.update');

    Route::middleware(['auth', EnforceSessionPolicy::class])->group(function () {
        Route::get('/me', [AuthController::class, 'me'])->name('api.me');
        Route::post('/logout', [AuthController::class, 'logout'])->name('api.logout');
        Route::get('/profile', [ProfileController::class, 'show'])->name('api.profile.show');
        Route::patch('/profile', [ProfileController::class, 'update'])->name('api.profile.update');

        Route::get('/dashboard/stats', [DashboardController::class, 'stats'])->name('api.dashboard.stats');
        Route::get('/security-monitor', [SecurityMonitorController::class, 'index'])->name('api.security-monitor.index');

        Route::get('/roles', [RoleController::class, 'index'])->name('api.roles.index');
        Route::post('/roles', [RoleController::class, 'store'])->name('api.roles.store');
        Route::patch('/roles/{role}', [RoleController::class, 'update'])->name('api.roles.update');

        Route::get('/users', [UserController::class, 'index'])->name('api.users.index');
        Route::post('/users', [UserController::class, 'store'])->name('api.users.store');
        Route::patch('/users/{user}', [UserController::class, 'update'])->name('api.users.update');
        Route::delete('/users/{user}', [UserController::class, 'destroy'])->name('api.users.destroy');
        Route::post('/users/bulk-update', [UserController::class, 'bulkUpdate'])->name('api.users.bulk-update');
        Route::post('/users/{user}/force-logout', [UserController::class, 'forceLogout'])->name('api.users.force-logout');
        Route::get('/users/{user}/activity', [UserController::class, 'activity'])->name('api.users.activity');
        Route::post('/users/{user}/impersonate', [UserController::class, 'impersonate'])->name('api.users.impersonate');
        Route::get('/users-export', [UserController::class, 'export'])->name('api.users.export');
        Route::get('/users-import/template', [UserController::class, 'importTemplate'])->name('api.users.import.template');
        Route::post('/users-import/preview', [UserController::class, 'previewImport'])->name('api.users.import.preview');
        Route::post('/users-import/commit', [UserController::class, 'commitImport'])->name('api.users.import.commit');
        Route::get('/users-analytics', [UserController::class, 'analytics'])->name('api.users.analytics');

        Route::get('/document-actions', [DocumentActionController::class, 'all'])->name('api.document-actions.index');

        Route::get('/documents', [DocumentController::class, 'index'])->name('api.documents.index');
        Route::post('/documents', [DocumentController::class, 'store'])->name('api.documents.store');
        Route::delete('/documents/bulk-delete', [DocumentController::class, 'bulkDestroy'])->name('api.documents.bulk-delete');
        Route::post('/documents/bulk-status', [DocumentController::class, 'bulkStatus'])->name('api.documents.bulk-status');
        Route::get('/documents/{document}', [DocumentController::class, 'show'])->name('api.documents.show');
        Route::patch('/documents/{document}', [DocumentController::class, 'update'])->name('api.documents.update');
        Route::delete('/documents/{document}', [DocumentController::class, 'destroy'])->name('api.documents.destroy');
        Route::post('/documents/{document}/restore', [DocumentController::class, 'restore'])->name('api.documents.restore');

        Route::get('/documents/{document}/actions', [DocumentActionController::class, 'index'])->name('api.documents.actions.index');
        Route::post('/documents/{document}/actions', [DocumentActionController::class, 'store'])->name('api.documents.actions.store');

        Route::get('/helpdesk/tickets', [HelpDeskTicketController::class, 'index'])->name('api.helpdesk.tickets.index');
        Route::post('/helpdesk/tickets', [HelpDeskTicketController::class, 'store'])->name('api.helpdesk.tickets.store');
        Route::get('/helpdesk/tickets/stats', [HelpDeskTicketController::class, 'stats'])->name('api.helpdesk.tickets.stats');
        Route::get('/helpdesk/tickets/{ticket}', [HelpDeskTicketController::class, 'show'])->name('api.helpdesk.tickets.show')->withTrashed();
        Route::patch('/helpdesk/tickets/{ticket}', [HelpDeskTicketController::class, 'update'])->name('api.helpdesk.tickets.update')->withTrashed();
        Route::delete('/helpdesk/tickets/{ticket}', [HelpDeskTicketController::class, 'destroy'])->name('api.helpdesk.tickets.destroy');
        Route::post('/helpdesk/tickets/{ticket}/restore', [HelpDeskTicketController::class, 'restore'])->name('api.helpdesk.tickets.restore');
        Route::post('/helpdesk/tickets/{ticket}/messages', [HelpDeskTicketController::class, 'reply'])->name('api.helpdesk.tickets.reply')->withTrashed();

        Route::get('/notifications', [NotificationController::class, 'index'])->name('api.notifications.index');
        Route::get('/notifications/stream', [NotificationController::class, 'stream'])->name('api.notifications.stream');
        Route::post('/notifications', [NotificationController::class, 'store'])->name('api.notifications.store');
        Route::patch('/notifications/mark-all-read', [NotificationController::class, 'markAllRead'])->name('api.notifications.mark-all-read');
        Route::get('/notification-preferences', [NotificationController::class, 'preferences'])->name('api.notification-preferences.show');
        Route::patch('/notification-preferences', [NotificationController::class, 'updatePreferences'])->name('api.notification-preferences.update');
        Route::patch('/notifications/{notification}', [NotificationController::class, 'update'])->name('api.notifications.update');
        Route::delete('/notifications/{notification}', [NotificationController::class, 'destroy'])->name('api.notifications.destroy');

        Route::get('/audit-logs', [AuditLogController::class, 'index'])->name('api.audit-logs.index');
        Route::get('/audit-logs/export', [AuditLogController::class, 'export'])->name('api.audit-logs.export');
        Route::post('/audit-logs/archive', [AuditLogController::class, 'archive'])->name('api.audit-logs.archive');
        Route::post('/audit-logs/bulk-archive', [AuditLogController::class, 'bulkArchive'])->name('api.audit-logs.bulk-archive');
        Route::post('/audit-logs/bulk-restore', [AuditLogController::class, 'bulkRestore'])->name('api.audit-logs.bulk-restore');

        Route::get('/developer/simulations', [AttackSimulationController::class, 'index'])->name('api.developer.simulations.index');
        Route::post('/developer/simulations/run', [AttackSimulationController::class, 'run'])->name('api.developer.simulations.run');
        Route::get('/developer/simulations/history', [AttackSimulationController::class, 'history'])->name('api.developer.simulations.history');
        Route::get('/developer/diagnostics', [AttackSimulationController::class, 'diagnostics'])->name('api.developer.diagnostics');

        Route::get('/reports', [ReportController::class, 'index'])->name('api.reports.index');
        Route::get('/reports/export', [ReportController::class, 'export'])->name('api.reports.export');
        Route::get('/reports/favorites', [ReportController::class, 'favorites'])->name('api.reports.favorites');
        Route::post('/reports/favorites', [ReportController::class, 'storeFavorite'])->name('api.reports.favorites.store');
        Route::delete('/reports/favorites/{favorite}', [ReportController::class, 'destroyFavorite'])->name('api.reports.favorites.destroy');

        Route::get('/settings', [SettingController::class, 'index'])->name('api.settings.index');
        Route::patch('/settings', [SettingController::class, 'update'])->name('api.settings.update');

        Route::get('/backups', [BackupController::class, 'index'])->name('api.backups.index');
        Route::post('/backups', [BackupController::class, 'store'])->name('api.backups.store');
        Route::post('/backups/verify-upload', [BackupController::class, 'verifyUploaded'])->name('api.backups.verify-upload');
        Route::post('/backups/{backup}/verify', [BackupController::class, 'verify'])->name('api.backups.verify');
        Route::get('/backups/{backup}/download', [BackupController::class, 'download'])->name('api.backups.download');

        Route::get('/documents-export', [ImportExportController::class, 'exportDocuments'])->name('api.documents.export');
        Route::get('/documents-import/template', [ImportExportController::class, 'template'])->name('api.documents.import.template');
        Route::post('/documents-import/preview', [ImportExportController::class, 'previewImport'])->name('api.documents.import.preview');
        Route::post('/documents-import/commit', [ImportExportController::class, 'commitImport'])->name('api.documents.import.commit');
        Route::post('/documents-import/error-report', [ImportExportController::class, 'errorReport'])->name('api.documents.import.errors');

        Route::post('/uploads', [UploadController::class, 'store'])->name('api.uploads.store');
        Route::post('/ocr/extract', [OcrController::class, 'extract'])->name('api.ocr.extract');
        Route::post('/assistant/chat', [ChatbotController::class, 'chat'])->name('api.assistant.chat');
    });
});
