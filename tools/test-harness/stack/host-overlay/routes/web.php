<?php

use App\Http\Controllers\SandboxLoginController;
use Illuminate\Support\Facades\Route;

Route::get('/api/user/login', [SandboxLoginController::class, 'login']);
