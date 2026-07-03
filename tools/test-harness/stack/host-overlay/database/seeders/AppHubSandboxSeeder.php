<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Kennofizet\AppHub\Modules\Catalog\Database\Seeders\AppHubPilotSeeder;
use Kennofizet\PackagesCore\Models\User;
use Kennofizet\PackagesCore\Models\Zone;
use Kennofizet\PackagesCore\Services\TokenService;

class AppHubSandboxSeeder extends Seeder
{
    public function run(): void
    {
        $dev = User::query()->updateOrCreate(
            ['email' => 'dev@test.local'],
            ['name' => 'Dev Publisher', 'password' => Hash::make('password')]
        );

        $user = User::query()->updateOrCreate(
            ['email' => 'user@test.local'],
            ['name' => 'Normal User', 'password' => Hash::make('password')]
        );

        $zone = Zone::query()->firstOrCreate(
            ['name' => 'Sandbox Zone'],
            []
        );

        foreach ([$dev, $user] as $account) {
            $account->zones()->syncWithoutDetaching([$zone->id]);
        }

        /** @var TokenService $tokens */
        $tokens = app(TokenService::class);
        $tokens->createOrRefreshToken((int) $dev->id);
        $tokens->createOrRefreshToken((int) $user->id);

        $this->call(AppHubPilotSeeder::class);
    }
}
