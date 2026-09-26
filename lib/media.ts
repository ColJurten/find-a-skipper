import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileCard } from '@/lib/database.types';

const AVATAR_PREFIX = 'storage:profile-avatars/';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function storagePath(avatarUrl: string) {
  return avatarUrl.startsWith(AVATAR_PREFIX) ? avatarUrl.slice(AVATAR_PREFIX.length) : null;
}

function safeHttpsUrl(avatarUrl: string) {
  try {
    const parsed = new URL(avatarUrl);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export async function resolveAvatarUrl(supabase: SupabaseClient, avatarUrl: string | null | undefined) {
  if (!avatarUrl) return null;
  const path = storagePath(avatarUrl);
  if (!path) return safeHttpsUrl(avatarUrl);
  const { data } = await supabase.storage.from('profile-avatars').createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl || null;
}

/** Resolves many avatars with a single storage request. Keys are the profile ids. */
export async function resolveAvatarUrls(supabase: SupabaseClient, entries: Array<{ id: string; avatar_url: string | null | undefined }>) {
  const result: Record<string, string | null> = {};
  const paths: Array<{ id: string; path: string }> = [];
  for (const entry of entries) {
    if (!entry.avatar_url) {
      result[entry.id] = null;
      continue;
    }
    const path = storagePath(entry.avatar_url);
    if (path) paths.push({ id: entry.id, path });
    else result[entry.id] = safeHttpsUrl(entry.avatar_url);
  }
  if (paths.length > 0) {
    const { data } = await supabase.storage.from('profile-avatars').createSignedUrls(paths.map((entry) => entry.path), SIGNED_URL_TTL_SECONDS);
    const byPath = new Map((data || []).map((row) => [row.path, row.signedUrl]));
    for (const entry of paths) result[entry.id] = byPath.get(entry.path) || null;
  }
  return result;
}

/** Public cards (name, company, avatar) through the get_profile_cards RPC — never phone or e-mail. */
export async function fetchProfileCards(supabase: SupabaseClient, ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {} as Record<string, ProfileCard>;
  const { data } = await supabase.rpc('get_profile_cards', { ids: unique });
  return Object.fromEntries(((data as ProfileCard[]) || []).map((card) => [card.id, card])) as Record<string, ProfileCard>;
}

export function displayName(card: Pick<ProfileCard, 'full_name' | 'company_name' | 'role'> | null | undefined) {
  if (!card) return '';
  if (card.role !== 'skipper' && card.company_name) return card.company_name;
  return card.full_name;
}
