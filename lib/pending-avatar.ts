'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

// When e-mail confirmation is required, sign-up returns no session, so the photo chosen
// on the sign-up form cannot be uploaded yet (storage is protected by RLS). It is kept
// in this browser and uploaded automatically at the first authenticated visit.
const KEY_PREFIX = 'fas-pending-avatar:';
const MAX_DIMENSION = 800;

function storageKey(email: string) {
  return `${KEY_PREFIX}${email.trim().toLowerCase()}`;
}

/** Downscales the picture (also drops EXIF metadata such as GPS position) to a JPEG blob. */
export async function prepareAvatar(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    return blob || file;
  } catch {
    // Formats the browser cannot decode (e.g. HEIC outside Safari) are uploaded as-is.
    return file;
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function stashPendingAvatar(email: string, blob: Blob) {
  try {
    window.localStorage.setItem(storageKey(email), await blobToDataUrl(blob));
    return true;
  } catch {
    return false;
  }
}

export async function uploadAvatar(supabase: SupabaseClient, userId: string, blob: Blob) {
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : blob.type.includes('hei') ? 'heic' : 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from('profile-avatars').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  const avatarUrl = `storage:profile-avatars/${path}`;
  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId);
  if (updateError) throw updateError;
  return avatarUrl;
}

/** Uploads a photo chosen at sign-up, if any. Safe to call on every authenticated page load. */
export async function flushPendingAvatar(supabase: SupabaseClient, user: { id: string; email?: string | null }) {
  if (!user.email || typeof window === 'undefined') return null;
  const key = storageKey(user.email);
  let dataUrl: string | null = null;
  try {
    dataUrl = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!dataUrl) return null;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const avatarUrl = await uploadAvatar(supabase, user.id, blob);
    window.localStorage.removeItem(key);
    return avatarUrl;
  } catch {
    return null;
  }
}
