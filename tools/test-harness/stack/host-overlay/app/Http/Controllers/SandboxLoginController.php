<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Kennofizet\PackagesCore\Models\User;
use Illuminate\Http\Request;
use Kennofizet\PackagesCore\Services\TokenService;

class SandboxLoginController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $userId = (int) $request->query('user_id', 1);
        $user = User::query()->find($userId);

        if (!$user) {
            return response()->json(['success' => false, 'error' => 'User not found'], 404);
        }

        /** @var TokenService $tokens */
        $tokens = app(TokenService::class);
        $token = $tokens->getToken($user->id) ?: $tokens->createOrRefreshToken($user->id);

        $baseUrl = rtrim(config('app.url', $request->getSchemeAndHttpHost()), '/');
        $corePrefix = config('packages-core.api_prefix', 'api/knf');
        $apphubPrefix = $corePrefix.'/'.config('apphub.api_prefix', 'apphub');

        return response()->json([
            'success' => true,
            'rewardplay_token' => $token,
            'user' => ['id' => $user->id, 'email' => $user->email, 'name' => $user->name],
            'base_url' => $baseUrl,
            'api_base' => $baseUrl.'/api',
            'urls' => [
                'core' => $baseUrl.'/'.$corePrefix,
                'apphub' => $baseUrl.'/'.$apphubPrefix,
            ],
        ]);
    }
}
