<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Support\AuditLogger;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function index(Request $request)
    {
        $this->ensureAdmin($request);

        return response()->json([
            'data' => [
                'roles' => Role::query()
                    ->with(['permissions' => fn ($query) => $query->orderBy('module_name')->orderBy('action_name')])
                    ->withCount('users')
                    ->orderBy('name')
                    ->get()
                    ->map(fn (Role $role) => $this->serializeRole($role))
                    ->values(),
                'permissions' => Permission::query()
                    ->orderBy('module_name')
                    ->orderBy('action_name')
                    ->get()
                    ->map(fn (Permission $permission) => $this->serializePermission($permission))
                    ->values(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $this->ensureAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_\- ]+$/'],
            'display_name' => ['nullable', 'string', 'max:128'],
            'description' => ['nullable', 'string', 'max:500'],
            'permission_ids' => ['nullable', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);

        $name = strtoupper(str_replace([' ', '-'], '_', trim($data['name'])));
        abort_if(Role::where('name', $name)->exists(), 422, 'A role with this name already exists.');

        $role = Role::create([
            'name' => $name,
            'display_name' => $data['display_name'] ?: ucwords(strtolower(str_replace('_', ' ', $name))),
            'description' => $data['description'] ?: 'Custom role created from Admin User Management.',
        ]);

        $role->permissions()->sync(array_values(array_unique($data['permission_ids'] ?? [])));

        AuditLogger::record($request->user(), 'transaction', 'roles', 'create', $role, [], $role->toArray(), $request, 'warning', 'Admin created a custom role.', [
            'permission_ids' => $data['permission_ids'] ?? [],
        ]);

        return response()->json(['data' => $this->serializeRole($role->fresh('permissions'))], 201);
    }

    public function update(Request $request, Role $role)
    {
        $this->ensureAdmin($request);

        $data = $request->validate([
            'display_name' => ['nullable', 'string', 'max:128'],
            'description' => ['nullable', 'string', 'max:500'],
            'permission_ids' => ['required', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);

        $oldValues = [
            'role' => $role->only(['name', 'display_name', 'description']),
            'permission_ids' => $role->permissions()->pluck('permissions.id')->all(),
        ];

        if (array_key_exists('display_name', $data)) {
            $role->display_name = strip_tags((string) $data['display_name']);
        }

        if (array_key_exists('description', $data)) {
            $role->description = strip_tags((string) $data['description']);
        }

        $role->save();
        $role->permissions()->sync(array_values(array_unique($data['permission_ids'])));

        AuditLogger::record($request->user(), 'transaction', 'roles', 'update_permissions', $role, $oldValues, [
            'role' => $role->fresh()->only(['name', 'display_name', 'description']),
            'permission_ids' => array_values(array_unique($data['permission_ids'])),
        ], $request, 'warning', 'Admin modified role permissions.');

        return response()->json(['data' => $this->serializeRole($role->fresh(['permissions'])->loadCount('users'))]);
    }

    private function ensureAdmin(Request $request): void
    {
        abort_unless(strtoupper((string) $request->user()->role) === 'ADMIN', 403);
    }

    private function serializeRole(Role $role): array
    {
        return [
            'id' => (string) $role->id,
            'name' => $role->name,
            'display_name' => $role->display_name,
            'description' => $role->description,
            'users_count' => (int) ($role->users_count ?? $role->users()->count()),
            'permissions' => $role->permissions->map(fn (Permission $permission) => $this->serializePermission($permission))->values(),
            'permission_ids' => $role->permissions->pluck('id')->map(fn ($id) => (int) $id)->values(),
        ];
    }

    private function serializePermission(Permission $permission): array
    {
        return [
            'id' => (int) $permission->id,
            'module_name' => $permission->module_name,
            'action_name' => $permission->action_name,
            'description' => $permission->description,
            'label' => ucwords(str_replace('_', ' ', $permission->module_name)).' / '.ucwords(str_replace('_', ' ', $permission->action_name)),
        ];
    }
}
