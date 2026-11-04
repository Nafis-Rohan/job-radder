import bcrypt from 'bcrypt';
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

// Step 1: check the password again (a stolen session must not be enough), make a secret,
// save it encrypted (not enabled yet), return the QR code.
export async function setup(userId, password) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { status: 'not_found' };
  if (user.totpEnabled) return { status: 'already_enabled' };

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) return { status: 'invalid_password' };

  const secret = generateSecret();
  // Only write while 2FA is still off, so setup can never replace an enabled secret.
  const { count } = await prisma.user.updateMany({
    where: { id: userId, totpEnabled: false },
    data: { totpSecretEnc: encrypt(secret) },
  });
  if (count === 0) return { status: 'already_enabled' };

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

  // Enable exactly the secret we just verified; if setup changed it meanwhile, do nothing.
  const { count } = await prisma.user.updateMany({
    where: { id: userId, totpEnabled: false, totpSecretEnc: user.totpSecretEnc },
    data: { totpEnabled: true },
  });
  if (count === 0) return { status: 'conflict' };

  return { status: 'ok' };
}
