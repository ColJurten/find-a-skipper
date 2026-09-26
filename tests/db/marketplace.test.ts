// Behavioural database tests: every migration is replayed in a local Postgres (PGlite)
// and each scenario runs as a real authenticated user, so RLS policies and triggers
// are exercised exactly as PostgREST would do it.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, type TestDb } from './harness';

let t: TestDb;
// Review forgeries are stopped either by the RLS insert policy or by the integrity trigger.
const REVIEW_BLOCKED = /row-level security|Avis autorise|Aucun skipper accepte|Participants invalides|Auto-evaluation/;

before(async () => {
  t = await createTestDb();
});

async function rejects(promise: Promise<unknown>, pattern: RegExp = /./, message?: string) {
  await assert.rejects(promise, pattern, message);
}

async function createMission(posterId: string, overrides: Record<string, unknown> = {}) {
  const values = {
    type: 'À la journée',
    boat_type: 'Voilier',
    zone: 'Méditerranée',
    departure: 'Antibes',
    destination: 'Saint-Tropez',
    start_date: '2026-10-01',
    ...overrides,
  };
  const keys = Object.keys(values);
  const rows = await t.as<{ id: string }>(
    posterId,
    `insert into missions (poster_id, ${keys.join(', ')}) values ($1, ${keys.map((_, index) => `$${index + 2}`).join(', ')}) returning id`,
    [posterId, ...Object.values(values)]
  );
  return rows[0].id;
}

async function apply(skipperId: string, missionId: string) {
  const rows = await t.as<{ id: string }>(skipperId, 'insert into applications (mission_id, skipper_id) values ($1, $2) returning id', [missionId, skipperId]);
  return rows[0].id;
}

test('signup trigger sanitises metadata and never grants admin', async () => {
  const forgedAdmin = await t.createUser('admin');
  const [admin] = await t.as<{ role: string }>(forgedAdmin, 'select role from profiles where id = $1', [forgedAdmin]);
  assert.equal(admin.role, 'owner');

  const skipper = await t.createUser('skipper', {
    extra: {
      languages: ['Français', 'English', 'ru', 'العربية'],
      experience_range: '5-10',
      availability_status: 'specific',
      availability_slots: [
        { start_date: '2026-07-03', end_date: '2026-07-03' },
        { start_date: '2026-07-05', end_date: '2026-07-04' },
      ],
    },
  });
  const [profile] = await t.as<{ languages: string[]; experience_range: string; availability_status: string }>(
    skipper,
    'select languages, experience_range, availability_status from profiles where id = $1',
    [skipper]
  );
  assert.deepEqual(profile.languages, ['fr', 'en', 'ru', 'ar']);
  assert.equal(profile.experience_range, '5-10');
  assert.equal(profile.availability_status, 'specific');
  const slots = await t.as(skipper, 'select start_date from availability_slots where skipper_id = $1', [skipper]);
  assert.equal(slots.length, 1, 'invalid slot (end before start) is ignored');
});

test('signup trigger still accepts the previous form format (deployment window)', async () => {
  const legacy = await t.createUser('skipper', { extra: { experience_years: '7', languages: ['Français', 'Русский'], hourly_rate: '300' } });
  const [profile] = await t.admin<{ experience_years: number; experience_range: string; languages: string[]; hourly_rate: string | null }>(
    'select experience_years, experience_range, languages, hourly_rate from profiles where id = $1', [legacy]);
  assert.equal(profile.experience_years, 7);
  assert.equal(profile.experience_range, '5-10');
  assert.deepEqual(profile.languages, ['fr', 'ru']);
  assert.equal(profile.hourly_rate, null, 'the indicative rate is no longer stored');
});

test('language migration keeps Cyrillic and unknown values (no data loss)', async () => {
  const [{ codes }] = await t.admin<{ codes: string[] }>(`select public.normalize_language_codes(array['Русский', 'English', 'Klingon', 'Français', 'fr', '']) as codes`);
  assert.deepEqual(codes, ['ru', 'en', 'Klingon', 'fr']);
});

test('skipper profiles are visible to recruiters only', async () => {
  const skipperA = await t.createUser('skipper');
  const skipperB = await t.createUser('skipper');
  const owner = await t.createUser('owner');
  const broker = await t.createUser('broker');
  const agency = await t.createUser('charter_company');
  const unconfirmedOwner = await t.createUser('owner', { confirmed: false });

  for (const recruiter of [owner, broker, agency]) {
    const rows = await t.as(recruiter, 'select id from profiles where id = $1', [skipperA]);
    assert.equal(rows.length, 1, 'recruiter can read skipper profile');
  }
  assert.equal((await t.as(skipperB, 'select id from profiles where id = $1', [skipperA])).length, 0, 'skipper cannot read another skipper');
  assert.equal((await t.as(null, 'select id from profiles where id = $1', [skipperA])).length, 0, 'anonymous cannot read skipper');
  assert.equal((await t.as(unconfirmedOwner, 'select id from profiles where id = $1', [skipperA])).length, 0, 'unconfirmed e-mail cannot browse');
  assert.equal((await t.as(skipperA, 'select id from profiles where id = $1', [skipperA])).length, 1, 'own profile readable');
  assert.equal((await t.as(skipperA, 'select id from profiles where id = $1', [owner])).length, 0, 'recruiter private row (phone) hidden');

  const cards = await t.as<{ id: string; full_name: string }>(skipperA, 'select * from get_profile_cards($1)', [[owner, skipperB]]);
  assert.deepEqual(cards.map((card) => card.id), [owner], 'skipper sees recruiter card but not other skipper');
  assert.equal(Object.keys(cards[0]).includes('phone'), false);

  const reviewsForSkipper = await t.as(skipperB, 'select * from availability_slots where skipper_id = $1', [skipperA]);
  assert.equal(reviewsForSkipper.length, 0);
});

test('mission publication: recruiter roles only, confirmed e-mail, Permanent type, owner listing', async () => {
  const owner = await t.createUser('owner');
  const broker = await t.createUser('broker');
  const agency = await t.createUser('charter_company');
  const skipper = await t.createUser('skipper');
  const unconfirmed = await t.createUser('broker', { confirmed: false });

  for (const recruiter of [owner, broker, agency]) {
    const id = await createMission(recruiter, {
      type: 'Permanent',
      end_date: '2026-10-05',
      duration_hours: 40,
      compensation_amount: 350,
      currency: 'EUR',
      on_quote: true,
      requirements: 'Yachtmaster Offshore',
    });
    const mine = await t.as<{ id: string }>(recruiter, 'select id from missions where poster_id = $1', [recruiter]);
    assert.ok(mine.some((row) => row.id === id), 'mission appears in "Mes missions proposées"');
    const visible = await t.as<{ id: string; status: string }>(skipper, 'select id, status from missions where id = $1', [id]);
    assert.equal(visible[0]?.status, 'open', 'skipper sees the open mission');
  }

  await rejects(createMission(skipper), /row-level security/);
  await rejects(createMission(unconfirmed), /row-level security/);
  await rejects(createMission(owner, { poster_id: broker }), /./);
  await rejects(createMission(owner, { end_date: '2026-09-01' }), /missions_end_date_check/);
  await rejects(createMission(owner, { currency: 'GBP' }), /missions_currency_check/);
});

test('applications: apply, withdraw into history, re-apply, accepted protected', async () => {
  const owner = await t.createUser('owner');
  const skipper = await t.createUser('skipper');
  const other = await t.createUser('skipper');
  const missionId = await createMission(owner);

  const applicationId = await apply(skipper, missionId);
  await rejects(apply(skipper, missionId), /duplicate key/);
  await rejects(apply(owner, missionId), /row-level security/);

  assert.equal((await t.as(other, 'select id from applications where id = $1', [applicationId])).length, 0, 'other skipper cannot read it');

  await t.as(skipper, `update applications set status = 'withdrawn' where id = $1`, [applicationId]);
  let [row] = await t.as<{ status: string; withdrawn_at: string | null }>(skipper, 'select status, withdrawn_at from applications where id = $1', [applicationId]);
  assert.equal(row.status, 'withdrawn');
  assert.ok(row.withdrawn_at, 'kept in history with a withdrawal date');
  let [mission] = await t.as<{ applicants_count: number }>(owner, 'select applicants_count from missions where id = $1', [missionId]);
  assert.equal(mission.applicants_count, 0);

  await t.as(skipper, `update applications set status = 'pending' where id = $1`, [applicationId]);
  [mission] = await t.as<{ applicants_count: number }>(owner, 'select applicants_count from missions where id = $1', [missionId]);
  assert.equal(mission.applicants_count, 1);

  await rejects(t.as(skipper, `update applications set status = 'accepted' where id = $1`, [applicationId]), /./);

  await t.as(owner, `update applications set status = 'accepted' where id = $1`, [applicationId]);
  [row] = await t.as<{ status: string; withdrawn_at: string | null }>(skipper, 'select status, withdrawn_at from applications where id = $1', [applicationId]);
  assert.equal(row.status, 'accepted');

  await rejects(t.as(skipper, `update applications set status = 'withdrawn' where id = $1`, [applicationId]), /./);
  const deleted = await t.as(skipper, 'delete from applications where id = $1 returning id', [applicationId]);
  assert.equal(deleted.length, 0, 'accepted application cannot be deleted');

  const notifications = await t.as<{ type: string }>(skipper, 'select type from notifications where user_id = $1', [skipper]);
  assert.ok(notifications.some((n) => n.type === 'application_accepted'));
  const ownerNotifications = await t.as<{ type: string }>(owner, 'select type from notifications where user_id = $1', [owner]);
  assert.ok(ownerNotifications.some((n) => n.type === 'new_application'));
  assert.ok(ownerNotifications.some((n) => n.type === 'application_withdrawn'));
  assert.equal((await t.as(skipper, 'select id from notifications where user_id = $1', [owner])).length, 0, 'cannot read notifications of another user');
});

test('rejection notifies the skipper', async () => {
  const owner = await t.createUser('broker');
  const skipper = await t.createUser('skipper');
  const missionId = await createMission(owner);
  const applicationId = await apply(skipper, missionId);
  await t.as(owner, `update applications set status = 'rejected' where id = $1`, [applicationId]);
  const rows = await t.as<{ type: string }>(skipper, `select type from notifications where user_id = $1 and type = 'application_rejected'`, [skipper]);
  assert.equal(rows.length, 1);
});

test('messaging only after an application, unread counters and read receipts', async () => {
  const owner = await t.createUser('charter_company');
  const skipper = await t.createUser('skipper');
  const stranger = await t.createUser('skipper');
  const missionId = await createMission(owner);

  const startConversation = (userId: string, skipperId: string) =>
    t.as<{ id: string }>(userId, 'insert into conversations (mission_id, demandeur_id, skipper_id) values ($1, $2, $3) returning id', [missionId, owner, skipperId]);

  await rejects(startConversation(skipper, skipper), /row-level security/);
  await rejects(startConversation(owner, skipper), /row-level security/);

  const applicationId = await apply(skipper, missionId);
  const [conversation] = await startConversation(skipper, skipper);

  await rejects(
    t.as(stranger, 'insert into messages (conversation_id, sender_id, text) values ($1, $2, $3)', [conversation.id, stranger, 'hi']),
    /row-level security/
  );
  assert.equal((await t.as(stranger, 'select id from conversations where id = $1', [conversation.id])).length, 0);

  await t.as(skipper, 'insert into messages (conversation_id, sender_id, text) values ($1, $2, $3)', [conversation.id, skipper, 'Bonjour, je suis disponible.']);
  await t.as(skipper, 'insert into messages (conversation_id, sender_id, text) values ($1, $2, $3)', [conversation.id, skipper, 'Merci !']);

  const [{ unread_messages_count: ownerUnread }] = await t.as<{ unread_messages_count: number }>(owner, 'select unread_messages_count()');
  assert.equal(ownerUnread, 2);
  const list = await t.as<{ other_name: string; last_message: string; unread_count: number }>(owner, 'select * from my_conversations()');
  assert.equal(list.length, 1);
  assert.equal(list[0].last_message, 'Merci !');
  assert.equal(list[0].unread_count, 2);
  const messageNotifications = await t.as(owner, `select id from notifications where user_id = $1 and type = 'new_message' and not read`, [owner]);
  assert.equal(messageNotifications.length, 2, 'new message notifications emitted for pending application');

  await rejects(t.as(stranger, 'select mark_conversation_read($1)', [conversation.id]), /participant/);
  await t.as(owner, 'select mark_conversation_read($1)', [conversation.id]);
  const [{ unread_messages_count: afterRead }] = await t.as<{ unread_messages_count: number }>(owner, 'select unread_messages_count()');
  assert.equal(afterRead, 0);
  const remaining = await t.as(owner, `select id from notifications where user_id = $1 and type = 'new_message' and not read`, [owner]);
  assert.equal(remaining.length, 0);
  const [{ unread_messages_count: skipperUnread }] = await t.as<{ unread_messages_count: number }>(skipper, 'select unread_messages_count()');
  assert.equal(skipperUnread, 0, 'own messages are never unread');

  await t.as(skipper, `update applications set status = 'withdrawn' where id = $1`, [applicationId]);
  assert.equal((await t.as(skipper, 'select * from my_conversations()')).length, 0, 'withdrawn application closes the conversation');
});

test('reviews: only after a completed mission, by its poster, once, 1 to 5 stars', async () => {
  const owner = await t.createUser('owner');
  const skipper = await t.createUser('skipper');
  const otherSkipper = await t.createUser('skipper');
  const otherOwner = await t.createUser('broker');
  const missionId = await createMission(owner);
  const applicationId = await apply(skipper, missionId);

  const review = (reviewer: string, reviewee: string, rating: number, comment: string | null = null, mission = missionId) =>
    t.as(reviewer, 'insert into reviews (mission_id, reviewer_id, reviewee_id, rating, comment) values ($1, $2, $3, $4, $5) returning id', [mission, reviewer, reviewee, rating, comment]);

  await rejects(review(owner, skipper, 5), REVIEW_BLOCKED, 'no review without an accepted application');

  await t.as(owner, `update applications set status = 'accepted' where id = $1`, [applicationId]);
  await rejects(review(owner, skipper, 5), REVIEW_BLOCKED, 'no review before mission completion');

  await t.as(owner, `update missions set status = 'completed' where id = $1`, [missionId]);
  await rejects(review(owner, otherSkipper, 5), REVIEW_BLOCKED, 'cannot rate a skipper unrelated to the mission');
  await rejects(review(otherOwner, skipper, 5), REVIEW_BLOCKED, 'non-participant cannot review');
  await rejects(review(owner, skipper, 0), /check constraint|row-level/);
  await rejects(review(owner, skipper, 6), /check constraint|row-level/);
  await rejects(t.as(owner, `insert into reviews (mission_id, reviewer_id, reviewee_id, rating) values ($1, $2, $3, 5)`, [missionId, otherOwner, skipper]), REVIEW_BLOCKED, 'cannot forge reviewer');

  await review(owner, skipper, 5, null);
  await rejects(review(owner, skipper, 4, 'again'), /duplicate key|unique/, 'one review per mission and reviewer');

  // Second completed mission with a 1-star review and a comment, to check the average.
  const missionTwo = await createMission(owner);
  const applicationTwo = await apply(skipper, missionTwo);
  await t.as(owner, `update applications set status = 'accepted' where id = $1`, [applicationTwo]);
  await t.as(owner, `update missions set status = 'completed' where id = $1`, [missionTwo]);
  await review(owner, skipper, 1, 'Retard au départ.', missionTwo);

  const [stats] = await t.as<{ count: number; average: string }>(otherOwner, 'select count(*)::int as count, avg(rating)::numeric(3,1)::text as average from reviews where reviewee_id = $1', [skipper]);
  assert.equal(stats.count, 2, 'another recruiter sees the reviews');
  assert.equal(stats.average, '3.0');
  const comments = await t.as<{ comment: string | null }>(otherOwner, 'select comment from reviews where reviewee_id = $1 order by rating', [skipper]);
  assert.deepEqual(comments.map((c) => c.comment), ['Retard au départ.', null]);

  assert.equal((await t.as(otherSkipper, 'select id from reviews where reviewee_id = $1', [skipper])).length, 0, 'skippers cannot read other skippers reviews');
  assert.equal((await t.as(null, 'select id from reviews where reviewee_id = $1', [skipper])).length, 0, 'anonymous cannot read reviews');
  assert.equal((await t.as(owner, 'update reviews set rating = 5 where reviewer_id = $1 returning id', [owner])).length, 0, 'reviews are immutable');
  assert.equal((await t.as(owner, 'delete from reviews where reviewer_id = $1 returning id', [owner])).length, 0, 'reviews cannot be deleted');
});

test('users cannot tamper with protected profile fields or other users data', async () => {
  const skipper = await t.createUser('skipper');
  const owner = await t.createUser('owner');
  await rejects(t.as(skipper, `update profiles set role = 'owner' where id = $1`, [skipper]), /row-level security/);
  const touched = await t.as(skipper, `update profiles set full_name = 'x' where id = $1 returning id`, [owner]);
  assert.equal(touched.length, 0);
  const missionId = await createMission(owner);
  const hijack = await t.as(skipper, `update missions set description = 'x' where id = $1 returning id`, [missionId]);
  assert.equal(hijack.length, 0);
});
