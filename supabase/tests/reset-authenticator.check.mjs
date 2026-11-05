// Checks the lost-authenticator rules (Node 24 runs the .ts file directly).
// Run with: npm run test:db
import assert from 'node:assert/strict';
import { checkResetTokens, decodeJwtPayload, EMAIL_CODE_MAX_AGE_SECONDS } from '../functions/reset-authenticator/checks.ts';

const now = 1_800_000_000;
const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const pw = { sub: 'u1', session_id: 's1', amr: [{ method: 'password', timestamp: now - 3000 }] };
const code = { sub: 'u1', session_id: 's2', amr: [{ method: 'otp', timestamp: now - 60 }] };

assert.deepEqual(decodeJwtPayload(jwt(pw)), pw);
assert.equal(decodeJwtPayload('not-a-jwt'), null);
assert.equal(checkResetTokens(pw, code, now), null, 'password session + fresh emailed code passes');
assert.equal(checkResetTokens(pw, { ...code, amr: [{ method: 'magiclink', timestamp: now - 60 }] }, now), null);
assert.match(checkResetTokens(pw, { ...code, sub: 'u2' }, now), /same account/);
assert.match(checkResetTokens(pw, { ...code, session_id: 's1' }, now), /code from the email/);
assert.match(checkResetTokens({ ...pw, amr: [{ method: 'otp', timestamp: now }] }, code, now), /password/);
assert.match(checkResetTokens(pw, { ...code, amr: [{ method: 'password', timestamp: now }] }, now), /fresh code/);
assert.match(checkResetTokens(pw, { ...code, amr: [{ method: 'otp', timestamp: now - EMAIL_CODE_MAX_AGE_SECONDS - 1 }] }, now), /fresh code/);
assert.match(checkResetTokens(null, code, now), /same account/);
console.log('ok - authenticator reset needs a password session and a fresh emailed code for the same account');
