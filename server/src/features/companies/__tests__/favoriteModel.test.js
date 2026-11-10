import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';

// Tests the database rules of the FavoriteCompany table. Rows made here belong to users starting with "test-favmodel".
const MARK = 'test-favmodel';

const clean = () => prisma.user.deleteMany({ where: { username: { startsWith: MARK } } }); // favorites go with them
const makeUser = (suffix = '') => prisma.user.create({ data: { username: `${MARK}${suffix}`, passwordHash: 'x' } });
const fav = (userId, extra = {}) => ({
  userId,
  name: 'Vivasoft',
  careersUrl: 'https://vivasoftltd.com/career/',
  ...extra,
});

beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

test('a favorite is saved with empty aliases by default', async () => {
  const user = await makeUser();
  const saved = await prisma.favoriteCompany.create({ data: fav(user.id) });
  assert.deepEqual(saved.aliases, []);
  assert.equal(saved.careersUrl, 'https://vivasoftltd.com/career/');
  assert.ok(saved.createdAt instanceof Date);
});

test('aliases are saved as a list', async () => {
  const user = await makeUser();
  const saved = await prisma.favoriteCompany.create({
    data: fav(user.id, { name: 'Grameenphone', aliases: ['GP', 'Grameen Phone'] }),
  });
  assert.deepEqual(saved.aliases, ['GP', 'Grameen Phone']);
});

test('the career page is required', async () => {
  const user = await makeUser();
  await assert.rejects(prisma.favoriteCompany.create({ data: { userId: user.id, name: 'No Link Ltd' } }));
});

test('one user cannot add the same company twice, but two users can both have it', async () => {
  const one = await makeUser('-1');
  const two = await makeUser('-2');
  await prisma.favoriteCompany.create({ data: fav(one.id) });
  await assert.rejects(prisma.favoriteCompany.create({ data: fav(one.id) }), /Unique constraint/);
  await prisma.favoriteCompany.create({ data: fav(two.id) });
});

test('deleting a user deletes their favorites', async () => {
  const user = await makeUser();
  await prisma.favoriteCompany.create({ data: fav(user.id) });
  await prisma.user.delete({ where: { id: user.id } });
  assert.equal(await prisma.favoriteCompany.count({ where: { userId: user.id } }), 0);
});

test('a favorite needs a real user', async () => {
  await assert.rejects(prisma.favoriteCompany.create({ data: fav('no-such-user') }), /Foreign key/);
});
