// RFC 6238 TOTP (HMAC-SHA1, 30-second steps, 6 digits): the algorithm authenticator apps use.
// Live mode leaves TOTP to Supabase Auth; demo mode runs it here in the browser.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_MS = 30_000;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return new Uint8Array(out);
}

/** 160-bit random secret, base32 encoded (what authenticator apps accept as a setup key). */
export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export async function totpCode(secret: string, timeMs = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const step = Math.floor(timeMs / STEP_MS);
  const counter = new DataView(new ArrayBuffer(8));
  counter.setUint32(0, Math.floor(step / 2 ** 32));
  counter.setUint32(4, step >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter.buffer));
  const offset = mac[19] & 15;
  const binary =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 1_000_000).padStart(6, '0');
}

export async function verifyTotp(secret: string, code: string, timeMs = Date.now()): Promise<boolean> {
  // One step either side tolerates clock drift between the phone and this computer
  for (const drift of [-1, 0, 1]) {
    if ((await totpCode(secret, timeMs + drift * STEP_MS)) === code) return true;
  }
  return false;
}

export function otpauthUri(secret: string, account: string): string {
  const issuer = 'MUJ Patent Portal';
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
