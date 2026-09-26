import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// The service role key is read on the server only (never a NEXT_PUBLIC_* variable).
function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY || null;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const serviceRoleKey = getServiceRoleKey();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const adminClient = createServiceClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { error } = await adminClient.auth.admin.deleteUser(user.id, false);
  if (error) {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
