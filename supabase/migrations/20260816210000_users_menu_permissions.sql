-- Per-user sidebar module access for college staff (role = user).
-- NULL / empty = full menu (backward compatible). Non-empty jsonb array = allowed module keys.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS menu_permissions jsonb DEFAULT NULL;

COMMENT ON COLUMN public.users.menu_permissions IS
  'Optional list of menu module keys (e.g. admissions, financeAffairs). Null/empty = all menus for the role.';
