// Local Postgres (PGlite/WASM) harness that replays every Supabase migration and
// lets tests act as a given authenticated user, so RLS and triggers are exercised
// for real without touching a hosted Supabase project.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

// Minimal stand-ins for the objects Supabase provides (auth + storage schemas, roles).
const SUPABASE_BOOTSTRAP = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
`;

const SUPABASE_GRANTS = `
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
`;

export type TestDb = {
  db: PGlite;
  /** Applies one migration file (by file name) on this database. */
  applyMigration: (file: string) => Promise<void>;
  createUser: (role: string, options?: { confirmed?: boolean; fullName?: string; extra?: Record<string, unknown> }) => Promise<string>;
  as: <T = Record<string, unknown>>(userId: string | null, sql: string, params?: unknown[]) => Promise<T[]>;
  admin: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
};

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql')).sort();
}

export interface TestDbOptions {
  /** Migration files that are NOT applied (to simulate a partially migrated project). */
  skip?: string[];
  /** Stop before this migration (it can then be applied with applyMigration). */
  stopBefore?: string;
}

export async function createTestDb(options: TestDbOptions = {}): Promise<TestDb> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_BOOTSTRAP);

  async function applyMigration(file: string) {
    await db.exec('reset role');
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
    await db.exec(SUPABASE_GRANTS);
  }

  for (const file of migrationFiles()) {
    if (options.stopBefore && file >= options.stopBefore) break;
    if (options.skip?.some((name) => file.startsWith(name))) continue;
    await applyMigration(file);
  }

  async function admin<T>(sql: string, params: unknown[] = []) {
    await db.exec('reset role');
    const result = await db.query<T>(sql, params);
    return result.rows;
  }

  async function as<T>(userId: string | null, sql: string, params: unknown[] = []) {
    // Each call runs in its own transaction with the JWT claim + role of the caller,
    // mirroring how PostgREST executes a request.
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
      await tx.exec(userId ? 'set local role authenticated' : 'set local role anon');
      const result = await tx.query<T>(sql, params);
      return result.rows;
    });
  }

  async function createUser(role: string, options: { confirmed?: boolean; fullName?: string; extra?: Record<string, unknown> } = {}) {
    const id = randomUUID();
    const meta = { role, full_name: options.fullName ?? `${role} ${id.slice(0, 4)}`, ...(options.extra ?? {}) };
    await admin(
      'insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)',
      [id, `${id.slice(0, 8)}@example.test`, options.confirmed === false ? null : new Date().toISOString(), JSON.stringify(meta)]
    );
    return id;
  }

  return { db, applyMigration, createUser, as, admin };
}
