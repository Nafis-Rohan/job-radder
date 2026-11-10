import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';
import { sendFavoriteAlerts, MAX_ALERTS_PER_USER } from '../alert.service.js';

// These tests use the local database but NO real Telegram: `send` is a fake that only writes down its calls.
// Rows made here: users "test-alert*", jobs with source "test-alert". Test jobs get a foundAt one day in the FUTURE
// and `since` is just before it, so real jobs and real users in the same database are never part of a test run.
const MARK = 'test-alert';
const BASE = Date.now() + 24 * 60 * 60 * 1000;
const SINCE = new Date(BASE - 60 * 1000);
const COMPANY = 'Zeta Testworks'; // a name no real favorite has

const clean = async () => {
  await prisma.job.deleteMany({ where: { source: MARK } }); // their alert rows go with them
  await prisma.user.deleteMany({ where: { username: { startsWith: MARK } } }); // favorites + alert rows go with them
};
beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

let counter = 0;
const makeJob = (extra = {}) => {
  counter += 1;
  return prisma.job.create({
    data: {
      source: MARK,
      url: `https://example.com/${MARK}/${Date.now()}-${counter}`,
      hash: `${MARK}-${Date.now()}-${counter}-${Math.random()}`,
      title: `Engineer ${counter}`,
      company: COMPANY,
      foundAt: new Date(BASE + counter), // keeps their order
      ...extra,
    },
  });
};

// a user with a chat id and one favorite
async function makeUser(suffix, { chat = `chat-${suffix}`, favorite = COMPANY, aliases = [], role = 'USER' } = {}) {
  const user = await prisma.user.create({
    data: { username: `${MARK}-${suffix}`, passwordHash: 'x', role, telegramChatId: chat },
  });
  if (favorite) {
    await prisma.favoriteCompany.create({
      data: { userId: user.id, name: favorite, aliases, careersUrl: 'https://example.com/career/' },
    });
  }
  return user;
}

// A fake sender: writes down every call. `failFor` = chat ids that fail.
function fakes({ failFor = [] } = {}) {
  const sent = [];
  const pauses = [];
  return {
    sent,
    pauses,
    send: async (chatId, text) => {
      if (failFor.includes(chatId)) throw new Error('Telegram: 403 Forbidden: bot was blocked by the user');
      sent.push({ chatId, text });
    },
    pause: async (ms) => pauses.push(ms),
    // only this file's own users count, whatever else lives in the database
    to: (chatId) => sent.filter((m) => m.chatId === chatId),
  };
}

const run = (f, extra = {}) => sendFavoriteAlerts({ since: SINCE, send: f.send, pause: f.pause, hasToken: true, ...extra });
const alertRows = (userId) => prisma.favoriteAlert.count({ where: { userId } });

test('a new job of a favorite company gives one message and one "alert sent" row', async () => {
  const user = await makeUser('a');
  const job = await makeJob({ location: 'Dhaka', url: 'https://example.com/test-alert/a-job' });
  const f = fakes();

  await run(f);

  assert.equal(f.to('chat-a').length, 1);
  assert.match(f.to('chat-a')[0].text, new RegExp(`^New opening at ${COMPANY}: ${job.title}\\nLocation: Dhaka\\n`));
  assert.match(f.to('chat-a')[0].text, /https:\/\/example\.com\/test-alert\/a-job$/);
  assert.equal(await alertRows(user.id), 1);
});

test('the same job is never sent twice (second scan)', async () => {
  await makeUser('b');
  await makeJob();
  const f = fakes();

  await run(f);
  const again = await run(f);

  assert.equal(f.to('chat-b').length, 1);
  assert.equal(again.sent, 0);
});

test('jobs of other companies get no message', async () => {
  await makeUser('c');
  await makeJob({ company: 'Some Other Company' });
  const f = fakes();
  await run(f);
  assert.equal(f.to('chat-c').length, 0);
});

test('Ltd, upper/lower case and aliases still match the favorite', async () => {
  await makeUser('d', { favorite: 'Zeta Testworks', aliases: ['ZT'] });
  await makeJob({ company: 'ZETA TESTWORKS Ltd.' });
  await makeJob({ company: 'zt' });
  const f = fakes();
  await run(f);
  assert.equal(f.to('chat-d').length, 2);
});

test('jobs found before this scan stay quiet (old jobs, or a favorite added later)', async () => {
  await makeUser('e');
  await makeJob({ foundAt: new Date(SINCE.getTime() - 1000) });
  const f = fakes();
  await run(f);
  assert.equal(f.to('chat-e').length, 0);
});

test('no score and no CV are needed: a user without any CV still gets the alert', async () => {
  const user = await makeUser('f');
  assert.equal(await prisma.cv.count({ where: { userId: user.id } }), 0);
  await makeJob();
  const f = fakes();
  await run(f);
  assert.equal(f.to('chat-f').length, 1);
});

test('users with no chat id, no favorite, or the DEMO role get nothing', async () => {
  await prisma.user.create({ data: { username: `${MARK}-nochat`, passwordHash: 'x' } });
  const noChat = await prisma.user.findUnique({ where: { username: `${MARK}-nochat` } });
  await prisma.favoriteCompany.create({ data: { userId: noChat.id, name: COMPANY, careersUrl: 'https://example.com/c/' } });
  await makeUser('nofav', { favorite: null });
  await makeUser('demo', { role: 'DEMO' });
  await makeJob();
  const f = fakes();

  await run(f);

  assert.equal(f.to('chat-nofav').length, 0);
  assert.equal(f.to('chat-demo').length, 0);
  assert.equal(await alertRows(noChat.id), 0);
});

test('two users with the same favorite each get their own message once', async () => {
  await makeUser('g1');
  await makeUser('g2');
  await makeJob();
  const f = fakes();
  await run(f);
  await run(f);
  assert.equal(f.to('chat-g1').length, 1);
  assert.equal(f.to('chat-g2').length, 1);
});

test('without a bot token nothing is sent and nothing is recorded', async () => {
  const user = await makeUser('h');
  await makeJob();
  const f = fakes();
  const result = await run(f, { hasToken: false });
  assert.deepEqual(result, { sent: 0, failed: 0 });
  assert.equal(f.to('chat-h').length, 0);
  assert.equal(await alertRows(user.id), 0);
});

test('a failed send is not recorded, does not throw, and is sent again by the next run', async () => {
  const user = await makeUser('i');
  await makeJob();

  const down = fakes({ failFor: ['chat-i'] });
  const first = await run(down);
  assert.ok(first.failed >= 1);
  assert.equal(await alertRows(user.id), 0, 'the claim is released, so the alert is not lost');

  const up = fakes();
  await run(up);
  assert.equal(up.to('chat-i').length, 1);
  assert.equal(await alertRows(user.id), 1);
});

test('one user whose Telegram fails does not stop the other users', async () => {
  await makeUser('j1');
  await makeUser('j2');
  await makeJob();
  const f = fakes({ failFor: ['chat-j1'] });
  const result = await run(f);
  assert.equal(f.to('chat-j1').length, 0);
  assert.equal(f.to('chat-j2').length, 1);
  assert.ok(result.failed >= 1);
});

test(`more than ${MAX_ALERTS_PER_USER} new jobs: ${MAX_ALERTS_PER_USER} messages and ONE summary, then quiet`, async () => {
  const user = await makeUser('k');
  const total = MAX_ALERTS_PER_USER + 3;
  for (let i = 0; i < total; i++) await makeJob();
  const f = fakes();

  await run(f);
  const mine = f.to('chat-k');
  assert.equal(mine.length, MAX_ALERTS_PER_USER + 1);
  assert.match(mine.at(-1).text, /^3 more new openings at your favorite companies/);
  assert.equal(await alertRows(user.id), total, 'the jobs in the summary are recorded too');

  await run(f);
  assert.equal(f.to('chat-k').length, MAX_ALERTS_PER_USER + 1, 'nothing more on the next scan');
});

test('a failed summary is released, so the next run sends it', async () => {
  const user = await makeUser('l');
  for (let i = 0; i < MAX_ALERTS_PER_USER + 2; i++) await makeJob();

  // the first MAX messages work, the summary fails
  let calls = 0;
  const flaky = fakes();
  const send = async (chatId, text) => {
    calls += 1;
    if (calls > MAX_ALERTS_PER_USER) throw new Error('Telegram: down');
    flaky.sent.push({ chatId, text });
  };
  await run(flaky, { send });
  assert.equal(await alertRows(user.id), MAX_ALERTS_PER_USER, 'only the really sent ones are recorded');

  const ok = fakes();
  await run(ok);
  // the 2 jobs that were left are now under the cap, so they go out as normal messages
  assert.equal(ok.to('chat-l').length, 2);
  assert.ok(ok.to('chat-l').every((m) => m.text.startsWith('New opening at')));
  assert.equal(await alertRows(user.id), MAX_ALERTS_PER_USER + 2);
});

test('messages are spaced out: no pause before the first one', async () => {
  await makeUser('m');
  await makeJob();
  await makeJob();
  await makeJob();
  const f = fakes();
  await run(f);
  assert.equal(f.to('chat-m').length, 3);
  assert.equal(f.pauses.length, 2);
  assert.ok(f.pauses.every((ms) => ms >= 1000));
});

test('deleting a job deletes its "alert sent" rows', async () => {
  const user = await makeUser('n');
  const job = await makeJob();
  await run(fakes());
  assert.equal(await alertRows(user.id), 1);
  await prisma.job.delete({ where: { id: job.id } });
  assert.equal(await alertRows(user.id), 0);
});

test('the same user and job cannot be recorded twice', async () => {
  const user = await makeUser('o');
  const job = await makeJob();
  await prisma.favoriteAlert.create({ data: { userId: user.id, jobId: job.id } });
  await assert.rejects(prisma.favoriteAlert.create({ data: { userId: user.id, jobId: job.id } }), /Unique constraint/);
});

test('a database problem is caught: it never throws into the scan', async () => {
  await makeUser('p'); // so the run gets as far as the jobs query, which fails on the bad date
  const broken = { send: async () => {}, pause: async () => {} };
  const result = await sendFavoriteAlerts({ since: 'not a date', hasToken: true, ...broken });
  assert.equal(result.sent, 0);
  assert.ok(result.failed >= 1);
});
