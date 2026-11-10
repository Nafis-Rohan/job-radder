import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';
import {
  listFavorites,
  createFavorite,
  updateFavorite,
  deleteFavorite,
  MAX_FAVORITES_PER_USER,
} from '../companies.service.js';

// Rows made here belong to users whose name starts with "test-favservice" and are removed again.
const MARK = 'test-favservice';

const clean = () => prisma.user.deleteMany({ where: { username: { startsWith: MARK } } });
const makeUser = (suffix = '') => prisma.user.create({ data: { username: `${MARK}${suffix}`, passwordHash: 'x' } });
const data = (name, extra = {}) => ({ name, aliases: [], careersUrl: `https://example.com/${encodeURIComponent(name)}`, ...extra });

beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

test('create and list: sorted by name, only the safe fields', async () => {
  const user = await makeUser();
  await createFavorite(user.id, data('Pathao'));
  const { status, company } = await createFavorite(user.id, data('Brain Station 23', { aliases: ['BS23'] }));
  assert.equal(status, 'ok');
  assert.deepEqual(Object.keys(company).sort(), ['aliases', 'careersUrl', 'createdAt', 'id', 'name']);

  const list = await listFavorites(user.id);
  assert.deepEqual(list.map((c) => c.name), ['Brain Station 23', 'Pathao']);
  assert.deepEqual(list[0].aliases, ['BS23']);
});

test('I only see my own favorites', async () => {
  const mine = await makeUser('-1');
  const other = await makeUser('-2');
  await createFavorite(other.id, data('Their Company'));
  assert.deepEqual(await listFavorites(mine.id), []);
});

test('the same company in another spelling is a duplicate; another user may add it', async () => {
  const one = await makeUser('-1');
  const two = await makeUser('-2');
  assert.equal((await createFavorite(one.id, data('Vivasoft'))).status, 'ok');
  for (const again of ['vivasoft', 'VIVASOFT LTD.', 'Vivasoft Limited']) {
    assert.equal((await createFavorite(one.id, data(again))).status, 'duplicate', again);
  }
  assert.equal((await createFavorite(two.id, data('Vivasoft'))).status, 'ok');
  assert.equal((await listFavorites(one.id)).length, 1);
});

test('at most 30 favorites per user', async () => {
  const user = await makeUser();
  await prisma.favoriteCompany.createMany({
    data: Array.from({ length: MAX_FAVORITES_PER_USER }, (_, i) => ({
      userId: user.id, name: `Company ${i}`, careersUrl: `https://example.com/${i}`,
    })),
  });
  assert.equal((await createFavorite(user.id, data('One Too Many'))).status, 'limit');
  assert.equal((await listFavorites(user.id)).length, MAX_FAVORITES_PER_USER);
});

test('two requests at the same moment cannot pass the duplicate check together', async () => {
  const user = await makeUser();
  const results = await Promise.all([createFavorite(user.id, data('Race Co')), createFavorite(user.id, data('race co ltd'))]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['duplicate', 'ok']);
  assert.equal((await listFavorites(user.id)).length, 1);
});

test('update changes only the given fields; a rename to an existing company is a duplicate', async () => {
  const user = await makeUser();
  const { company } = await createFavorite(user.id, data('Pathao', { aliases: ['Pathao Ltd'] }));
  await createFavorite(user.id, data('Vivasoft'));

  const renamed = await updateFavorite(user.id, company.id, { careersUrl: 'https://pathao.com/careers/' });
  assert.equal(renamed.status, 'ok');
  assert.equal(renamed.company.careersUrl, 'https://pathao.com/careers/');
  assert.equal(renamed.company.name, 'Pathao'); // untouched
  assert.deepEqual(renamed.company.aliases, ['Pathao Ltd']);

  assert.equal((await updateFavorite(user.id, company.id, { name: 'VIVASOFT Ltd' })).status, 'duplicate');
  assert.equal((await updateFavorite(user.id, company.id, { name: 'PATHAO' })).status, 'ok'); // its own name again is fine
});

test('update and delete cannot touch another user\'s favorite', async () => {
  const mine = await makeUser('-1');
  const other = await makeUser('-2');
  const { company } = await createFavorite(other.id, data('Their Company'));

  assert.equal((await updateFavorite(mine.id, company.id, { name: 'Hacked' })).status, 'notfound');
  assert.equal(await deleteFavorite(mine.id, company.id), false);
  assert.deepEqual((await listFavorites(other.id)).map((c) => c.name), ['Their Company']);
});

test('delete removes it once; a second delete says not found', async () => {
  const user = await makeUser();
  const { company } = await createFavorite(user.id, data('Pathao'));
  assert.equal(await deleteFavorite(user.id, company.id), true);
  assert.equal(await deleteFavorite(user.id, company.id), false);
  assert.equal((await updateFavorite(user.id, company.id, { name: 'x' })).status, 'notfound');
});
