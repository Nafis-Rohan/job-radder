import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from '../../shared/db/prisma.js';
import { encrypt, decrypt } from '../../shared/utils/crypto.js';

const ISSUER = 'JobRadar';
// Accept the code of the previous/next 30-second step too (phone clock drift).
const TOLERANCE_SECONDS = 30;

export async function verifyCode(secret, code) {
  const result = await verify({ secret, token: code, epochTolerance: TOLERANCE_SECONDS });
  return result.valid;
}

// Step 1: make a secret, save it encrypted (not enabled yet), return the QR code.
export async function setup(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { status: 'not_found' };
  if (user.totpEnabled) return { status: 'already_enabled' };

  const secret = generateSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecretEnc: encrypt(secret) },
  });

  const uri = generateURI({ issuer: ISSUER, label: user.username, secret });
  const qrCode = await QRCode.toDataURL(uri);

  return { status: 'ok', qrCode, manualKey: secret };
}

// Step 2: the user types the first code from the app; if it is right, turn 2FA on.
export async function enable(userId, code) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { status: 'not_found' };
  if (user.totpEnabled) return { status: 'already_enabled' };
  if (!user.totpSecretEnc) return { status: 'no_setup' };

  const valid = await verifyCode(decrypt(user.totpSecretEnc), code);
  if (!valid) return { status: 'invalid_code' };

  await prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
  return { status: 'ok' };
}
