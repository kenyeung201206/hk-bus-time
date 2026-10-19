// Run: node test/webpush.test.mjs — encrypts like the server, then decrypts like a phone.
import { encrypt, vapidAuth } from '../src/webpush.ts';
const subtle = crypto.subtle;
const b64u = (b) => Buffer.from(b).toString('base64url');
const hkdf = async (salt, ikm, info, n) =>
  new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info },
    await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));

// the "phone"
const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPub = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
const auth = crypto.getRandomValues(new Uint8Array(16));
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: b64u(uaPub), auth: b64u(auth) } };

const msg = { title: '🔔 1A 仲有三分鐘就到！', body: '中秀茂坪' };
const body = await encrypt(sub, new TextEncoder().encode(JSON.stringify(msg)));

// decrypt per RFC 8291
const salt = body.slice(0, 16);
const idlen = body[20];
const asPub = body.slice(21, 21 + idlen);
const ct = body.slice(21 + idlen);
const asKey = await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const secret = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
const te = new TextEncoder();
const ikm = await hkdf(auth, secret, new Uint8Array([...te.encode('WebPush: info\0'), ...uaPub, ...asPub]), 32);
const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce },
  await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
if (plain[plain.length - 1] !== 2) throw new Error('bad padding delimiter');
const got = JSON.parse(new TextDecoder().decode(plain.slice(0, -1)));
if (got.title !== msg.title) throw new Error('payload mismatch');
console.log('decrypt OK:', got.title);

// VAPID: signature must verify with the public key
const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = b64u(await subtle.exportKey('raw', kp.publicKey));
const d = (await subtle.exportKey('jwk', kp.privateKey)).d;
const header = await vapidAuth(sub.endpoint, pub, d, 'https://example.com/');
const jwt = header.match(/t=([^,]+)/)[1];
const [h, c, s] = jwt.split('.');
const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, Buffer.from(s, 'base64url'), te.encode(`${h}.${c}`));
if (!ok) throw new Error('VAPID signature invalid');
console.log('VAPID OK:', JSON.parse(Buffer.from(c, 'base64url')).aud);
