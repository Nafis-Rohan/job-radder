import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
import bcrypt from 'bcrypt';
import { prisma } from '../src/shared/db/prisma.js';

async function ask(question, { hidden = false } = {}) {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });

  const answer = rl.question(question);
  muted = hidden;
  const value = await answer;
  rl.close();
  if (hidden) process.stdout.write('\n');
  return value;
}

async function main() {
  const username = (await ask('Username: ')).trim();
  const password = await ask('Password (min 12 characters): ', { hidden: true });
  const repeat = await ask('Repeat password: ', { hidden: true });

  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
    throw new Error('Username must be 3-30 characters: letters, numbers, _ . -');
  }
  if (password.length < 12) throw new Error('Password must be at least 12 characters');
  if (password !== repeat) throw new Error('Passwords do not match');

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw new Error('That username already exists');

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { username, passwordHash, role: 'ADMIN' } });

  console.log('Admin user created.');
}

main()
  .catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
