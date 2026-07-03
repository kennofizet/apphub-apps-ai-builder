<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Kennofizet\PackagesCore\Services\TokenService;

require __DIR__.'/../vendor/autoload.php';

$app = require_once __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

/** @var TokenService $tokens */
$tokens = app(TokenService::class);

echo json_encode([
    'dev' => $tokens->getToken(1) ?: $tokens->createOrRefreshToken(1),
    'user' => $tokens->getToken(2) ?: $tokens->createOrRefreshToken(2),
], JSON_THROW_ON_ERROR);
