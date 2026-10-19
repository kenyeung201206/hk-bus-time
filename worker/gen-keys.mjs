// Makes a VAPID key pair for Web Push. Prints the public key (safe to share) and
// writes the private key to a file you upload with `wrangler secret put` — keep it private.
import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
const d = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d;
const out = process.argv[2] ?? '.vapid-private.txt';
writeFileSync(out, d);
writeFileSync(out.replace(/private/, 'public'), pub);
console.log('VAPID public key:', pub);
console.log('private key written to', out);
