// The final migration must bring its own review protections when the project lacks them
// (20260908103000 not applied), while staying idempotent and non-destructive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, migrationFiles, type TestDb } from './harness';

const FINAL = migrationFiles().find((file) => file.startsWith('20260924100000'))!;
const REVIEWS_MIGRATION = '20260908103000';
const BLOCKED = /row-level security|Avis autorise|Aucun skipper accepte|Participants invalides|Auto-evaluation|check constraint|duplicate key/;

async function completedMission(t: TestDb, owner: string, skipper: string) {
  const [mission] = await t.as<{ id: string }>(owner, `insert into missions (poster_id, type, boat_type, zone, departure, start_date) values ($1, 'À la journée', 'Voilier', 'Méditerranée', 'Nice', '2026-10-01') returning id`, [owner]);
  const [application] = await t.as<{ id: string }>(skipper, 'insert into applications (mission_id, skipper_id) values ($1, $2) returning id', [mission.id, skipper]);
  await t.as(owner, `update applications set status = 'accepted' where id = $1`, [application.id]);
  await t.as(owner, `update missions set status = 'completed' where id = $1`, [mission.id]);
  return mission.id;
}

async function reviewObjects(t: TestDb) {
  const [row] = await t.admin<{ triggers: number; indexes: number; fn: string | null }>(`
    select
      (select count(*)::int from pg_trigger where tgrelid = 'public.reviews'::regclass and tgname = 'on_review_integrity_check' and not tgisinternal) as triggers,
      (select count(*)::int from pg_indexes where schemaname = 'public' and tablename = 'reviews' and indexdef ilike '%unique%(mission_id, reviewer_id)') as indexes,
      (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'enforce_review_integrity') as fn`);
  return row;
}

test('project WITHOUT the review migration: the final migration creates index + trigger and reviews are protected', async () => {
  const t = await createTestDb({ skip: [REVIEWS_MIGRATION], stopBefore: '20260924100000' });
  const before = await reviewObjects(t);
  assert.equal(before.triggers, 0, 'precondition: trigger absent before the final migration');
  assert.equal(before.indexes, 0, 'precondition: unique index absent before the final migration');
  await t.applyMigration(FINAL);

  const objects = await reviewObjects(t);
  assert.equal(objects.triggers, 1);
  assert.equal(objects.indexes, 1);
  assert.ok(objects.fn);

  const owner = await t.createUser('owner');
  const otherOwner = await t.createUser('broker');
  const skipper = await t.createUser('skipper');
  const review = (reviewer: string, reviewee: string, missionId: string, rating: number, comment: string | null = null) =>
    t.as(reviewer, 'insert into reviews (mission_id, reviewer_id, reviewee_id, rating, comment) values ($1, $2, $3, $4, $5) returning id', [missionId, reviewer, reviewee, rating, comment]);

  // Not completed yet -> refused.
  const [open] = await t.as<{ id: string }>(owner, `insert into missions (poster_id, type, boat_type, zone, departure, start_date) values ($1, 'À la journée', 'Voilier', 'Méditerranée', 'Cannes', '2026-10-01') returning id`, [owner]);
  await assert.rejects(review(owner, skipper, open.id, 5), BLOCKED);

  for (let rating = 1; rating <= 5; rating++) {
    const missionId = await completedMission(t, owner, skipper);
    await review(owner, skipper, missionId, rating, rating % 2 ? `Avis ${rating}` : null);
    await assert.rejects(review(owner, skipper, missionId, rating), BLOCKED, 'duplicate refused');
    await assert.rejects(review(otherOwner, skipper, missionId, 3), BLOCKED, 'non-participant refused');
  }
  const last = await completedMission(t, owner, skipper);
  await assert.rejects(review(owner, skipper, last, 0), BLOCKED);
  await assert.rejects(review(owner, skipper, last, 6), BLOCKED);
  await assert.rejects(review(skipper, skipper, last, 5), BLOCKED, 'self review refused');

  const rows = await t.admin<{ rating: number; comment: string | null }>('select rating, comment from reviews order by rating');
  assert.deepEqual(rows, [
    { rating: 1, comment: 'Avis 1' }, { rating: 2, comment: null }, { rating: 3, comment: 'Avis 3' }, { rating: 4, comment: null }, { rating: 5, comment: 'Avis 5' },
  ]);
});

test('re-applying the final migration is idempotent and changes no data', async () => {
  const t = await createTestDb();
  const owner = await t.createUser('owner');
  const skipper = await t.createUser('skipper');
  const missionId = await completedMission(t, owner, skipper);
  await t.as(owner, 'insert into reviews (mission_id, reviewer_id, reviewee_id, rating, comment) values ($1, $2, $3, 4, $4)', [missionId, owner, skipper, 'Très bien']);

  const snapshot = async () => t.admin(`select
    (select json_agg(r order by r.id) from reviews r) reviews,
    (select json_agg(p order by p.id) from profiles p) profiles,
    (select json_agg(m order by m.id) from missions m) missions,
    (select json_agg(a order by a.id) from applications a) applications,
    (select json_agg(n order by n.id) from notifications n) notifications`);
  const dataBefore = JSON.stringify(await snapshot());
  const objectsBefore = await reviewObjects(t);

  await t.applyMigration(FINAL);
  await t.applyMigration(FINAL);

  assert.equal(JSON.stringify(await snapshot()), dataBefore, 'no row added, removed or modified');
  const objectsAfter = await reviewObjects(t);
  assert.equal(objectsAfter.triggers, 1, 'no duplicated trigger');
  assert.equal(objectsAfter.indexes, 1, 'no duplicated index');
  assert.equal(objectsAfter.fn, objectsBefore.fn, 'existing integrity function kept as is');
});

test('an existing custom integrity function is never overwritten', async () => {
  const t = await createTestDb({ stopBefore: '20260924100000' });
  const custom = `create or replace function public.enforce_review_integrity() returns trigger language plpgsql security definer set search_path = public as $$ begin /* custom */ return new; end; $$;`;
  await t.admin(custom);
  const before = await reviewObjects(t);
  await t.applyMigration(FINAL);
  const after = await reviewObjects(t);
  assert.match(after.fn!, /custom/);
  assert.equal(after.fn, before.fn);
});

test('duplicate reviews already present: the migration stops without touching any data', async () => {
  const t = await createTestDb({ skip: [REVIEWS_MIGRATION], stopBefore: '20260924100000' });
  const owner = await t.createUser('owner');
  const skipper = await t.createUser('skipper');
  const missionId = await completedMission(t, owner, skipper);
  // Legacy duplicates (possible only because the protections were never installed).
  const otherSkipper = await t.createUser('skipper');
  await t.admin(`insert into reviews (mission_id, reviewer_id, reviewee_id, rating) values ($1, $2, $3, 5), ($1, $2, $4, 4)`, [missionId, owner, skipper, otherSkipper]);
  await assert.rejects(t.applyMigration(FINAL), /Duplicate reviews/);
  const rows = await t.admin<{ n: number }>('select count(*)::int n from reviews');
  assert.equal(rows[0].n, 2, 'both legacy reviews kept');
  const columns = await t.admin(`select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'experience_range'`);
  assert.equal(columns.length, 0, 'whole migration rolled back (atomic)');
});
