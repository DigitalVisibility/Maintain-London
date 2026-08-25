/**
 * Web Push for Cloudflare Workers — payload encryption (RFC 8291, aes128gcm) and
 * VAPID auth (RFC 8292), implemented with WebCrypto (the Node `web-push` library
 * can't run in Workers). sendToUser() fans a notification out to every device a
 * user has subscribed, pruning any that the push service reports as gone.
 */

import { queryAll, execute } from './db';

export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }

interface PushEnv { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string }

// ── base64url ──
function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(b: ArrayBuffer | Uint8Array): string {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

/** HKDF(salt, ikm, info, L) = HKDF-Expand(HKDF-Extract(salt, ikm), info, L). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/** Signed VAPID JWT for the push endpoint's origin (ES256). */
async function vapidJwt(endpoint: string, subject: string, publicKey: string, privateKey: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const enc = new TextEncoder();
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const signingInput = `${header}.${payload}`;

  const pub = b64urlToBytes(publicKey); // 0x04 || x(32) || y(32)
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: bytesToB64url(pub.subarray(1, 33)), y: bytesToB64url(pub.subarray(33, 65)),
    d: privateKey, ext: true,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput));
  return `${signingInput}.${bytesToB64url(sig)}`;
}

/** Encrypt `payload` for one subscription and POST it to the push service. */
export async function sendPush(sub: PushSub, payload: string, env: PushEnv): Promise<Response> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new Error('VAPID keys not configured');
  const enc = new TextEncoder();
  const uaPublic = b64urlToBytes(sub.keys.p256dh);
  const authSecret = b64urlToBytes(sub.keys.auth);

  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const record = concat(enc.encode(payload), new Uint8Array([2])); // 0x02 = last-record delimiter
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, cekKey, record));

  // aes128gcm content coding header (RFC 8188): salt(16) rs(4) idlen(1) keyid ciphertext
  const body = concat(salt, new Uint8Array([0, 0, 0x10, 0x00]), new Uint8Array([asPublic.length]), asPublic, ct);

  const jwt = await vapidJwt(sub.endpoint, env.VAPID_SUBJECT || 'mailto:admin@maintainlondon.co.uk', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '2419200',
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    },
    body,
  });
}

export interface PushMessage { title: string; body: string; url?: string; tag?: string }

/** Send a notification to every device a user has subscribed. Prunes dead subs. */
export async function sendToUser(db: D1Database, env: PushEnv, userId: string, msg: PushMessage): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return; // push not configured
  const subs = await queryAll<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    db, 'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', [userId]
  ).catch(() => []);
  const payload = JSON.stringify(msg);
  for (const s of subs) {
    try {
      const res = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, env);
      if (res.status === 404 || res.status === 410) {
        await execute(db, 'DELETE FROM push_subscriptions WHERE id = ?', [s.id]).catch(() => {});
      }
    } catch { /* best-effort */ }
  }
}
