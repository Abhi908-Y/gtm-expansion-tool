import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Tokens that let the site act on someone's Gmail are stored encrypted (AES-256-GCM) with a key derived from APP_SECRET.
const key = () => {
  if (!process.env.APP_SECRET) throw new Error('APP_SECRET is not set');
  return createHash('sha256').update(process.env.APP_SECRET).digest();
};

export function seal(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function unseal(sealed: string): string {
  const b = Buffer.from(sealed, 'base64');
  const d = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
