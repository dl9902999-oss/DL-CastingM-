import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from './types';

// Staged adapter: not activated until auth memberships and RLS are deployed.
// Uses real Auth email credentials; employee-number lookup must be server-side.
export function createVerifiedAuth(client: SupabaseClient) {
  async function currentProfile(): Promise<UserProfile> {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error('請重新登入');
    const result = await client.from('employee_memberships')
      .select('auth_user_id,employee_id,name,role,permissions,enabled')
      .eq('auth_user_id', data.user.id).single();
    const profile = result.data;
    if (result.error || !profile || profile.enabled !== true || profile.auth_user_id !== data.user.id ||
        !['Admin', 'Production', 'QC', 'Warehouse'].includes(profile.role) ||
        !Array.isArray(profile.permissions) || !profile.permissions.every((p: unknown) => typeof p === 'string')) {
      throw new Error('帳號尚未啟用或無法確認權限，請聯絡管理員');
    }
    return { id: profile.auth_user_id, employee_id: profile.employee_id,
      name: profile.name, role: profile.role, permissions: profile.permissions, password: '' };
  }
  async function login(email: string, password: string): Promise<UserProfile> {
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error('登入失敗，請確認帳號、密碼與網路連線');
    try { return await currentProfile(); }
    catch (error) {
      await client.auth.signOut({ scope: 'local' });
      throw error;
    }
  }
  return { login, currentProfile };
}
