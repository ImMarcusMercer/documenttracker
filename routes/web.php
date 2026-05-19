<?php

use Illuminate\Support\Facades\Route;

require __DIR__.'/api.php';

Route::view('/reset-password/{token}', 'app')->name('password.reset');
Route::view('/{any?}', 'app')->where('any', '.*');
