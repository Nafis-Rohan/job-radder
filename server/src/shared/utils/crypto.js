import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function defaultKey() {
  return Buffer.from(env.ENCRYPTION_KEY, 'hex');
}

// Returns "iv:authTag:ciphertext" (each part base64). A fresh random IV is used every time.
export function encrypt(plaintext, key = defaultKey()) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64')).join(':');
}

// Throws if the payload was changed or the key is wrong (GCM checks the auth tag).
export function decrypt(payload, key = defaultKey()) {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || dataB64 === undefined) {
    throw new Error('Invalid encrypted payload');
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
