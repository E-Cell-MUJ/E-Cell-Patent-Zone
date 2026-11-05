// Checks the Send Email hook's message builder (Node 24 runs the .ts file directly).
// Run with: npm run test:db
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCodeEmail } from '../functions/send-auth-email/email.ts';

const signup = buildCodeEmail('signup', '049978');
assert.equal(signup.subject, 'Your MUJ Patent Portal verification code');
assert.ok(signup.html.includes('>049978<'), 'code appears in the body');
assert.equal(buildCodeEmail('email', '000123').html.includes('000123'), true);

// Link-based or unexpected emails are refused, and nothing but 6 digits reaches the HTML
assert.equal(buildCodeEmail('email_change', '123456'), null);
assert.equal(buildCodeEmail('signup', '12345'), null);
assert.equal(buildCodeEmail('signup', '<img src=x onerror=alert(1)>'), null);

// Same email as the template Supabase uses when the hook is off
const template = readFileSync(new URL('../templates/confirmation.html', import.meta.url), 'utf8');
const strip = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
assert.equal(strip(signup.html), strip(template.replaceAll('{{ .Token }}', '049978')));

// Password reset and lost-authenticator codes match their templates too
for (const [type, file] of [['recovery', 'recovery.html'], ['magiclink', 'magic_link.html']]) {
  const t = readFileSync(new URL(`../templates/${file}`, import.meta.url), 'utf8');
  assert.equal(strip(buildCodeEmail(type, '049978').html), strip(t.replaceAll('{{ .Token }}', '049978')), file);
}
assert.equal(buildCodeEmail('recovery', '123456').subject, 'Your MUJ Patent Portal password reset code');

console.log('ok - auth email hook builds code emails only, matching the templates');
