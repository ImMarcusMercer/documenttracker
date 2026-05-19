<?php

namespace App\Support;

use App\Models\Document;
use App\Models\User;

class DocumentAccess
{
    public static function canCreate(User $user): bool
    {
        return strtoupper((string) $user->role) === 'RECEIVING';
    }

    /**
     * v2.0 policy: every authenticated active DocTracker user can open the All Documents
     * list, document detail page, and attached document files for tracking transparency.
     * Action permissions remain restricted by current holder/role rules in canAct().
     */
    public static function canView(User $user, Document $document): bool
    {
        return (bool) $user->is_active && strtolower((string) ($user->status ?: 'active')) === 'active';
    }

    public static function canAct(User $user, Document $document): bool
    {
        $role = strtoupper((string) $user->role);

        if ($role === 'ADMIN') {
            return false;
        }

        if (!self::canView($user, $document)) {
            return false;
        }

        if ($document->current_holder !== $user->email) {
            return false;
        }

        if ($role === 'MOBILIZATION' && $document->classification !== 'Request Letter') {
            return false;
        }

        return true;
    }

    public static function canDelete(User $user, Document $document): bool
    {
        if (strtoupper((string) $user->role) === 'ADMIN') {
            return true;
        }

        return self::canAct($user, $document);
    }

    public static function canRestore(User $user): bool
    {
        return strtoupper((string) $user->role) === 'ADMIN';
    }
}
