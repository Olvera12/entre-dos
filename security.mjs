// Las claves viven sólo en memoria; la invitación es un secreto de acceso temporal.
import {relayServers} from './network.mjs';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export const MAX_FILE = 20 * 1024 ** 3;
export const MEMORY_LIMIT = 256 * 1024 ** 2;
export const CHUNK = 16000;
const MEDIA = /\.(mp4|mov|m4v|3gp|heic|heif|jpg|jpeg|png|webp|avif|gif|dng)$/i;

export function bytes64(bytes) {
  let text = '';
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function from64(text, limit = 60000) {
  if (typeof text !== 'string' || text.length > limit || !/^[\w-]+$/.test(text)) throw new Error('badCode');
  try { return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)); }
  catch { throw new Error('badCode'); }
}
export function pack(value) { return bytes64(encoder.encode(JSON.stringify(value))); }
export function unpack(text) {
  try { return JSON.parse(decoder.decode(from64(text))); }
  catch { throw new Error('badCode'); }
}
export function signalFromInput(value, kind) {
  const input = value.trim();
  if (input.length > 65000) throw new Error('badCode');
  if (!input.includes('#')) return input;
  try {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
    const result = new URLSearchParams(url.hash.slice(1)).get(kind);
    if (!result) throw new Error();
    return result;
  } catch { throw new Error('badCode'); }
}
export function description(value, type) {
  if (!value || value.type !== type || typeof value.sdp !== 'string' ||
      value.sdp.length > 16000 || !value.sdp.startsWith('v=0') ||
      !value.sdp.includes('m=application') || /m=(audio|video)\s/.test(value.sdp)) throw new Error('badCode');
  return { type, sdp: value.sdp };
}
export function invitation(value, now = Date.now()) {
  if (!value || value.v !== 1 || !/^[a-f0-9-]{36}$/i.test(value.id) ||
      !Number.isSafeInteger(value.until) || value.until <= now || value.until > now + 16*60*1000 ||
      typeof value.key !== 'string' || from64(value.key, 50).length !== 32) throw new Error('expired');
  return { v: 1, id: value.id, until: value.until, key: value.key, desc: description(value.desc, 'offer'),
    ...(value.iceServers?{iceServers:relayServers(value.iceServers)}:{}) };
}
export function safeName(name) {
  if (typeof name !== 'string' || name.length > 200) throw new Error('badFile');
  const clean = name.normalize('NFC').replace(/[\x00-\x1f\x7f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g, '_').replace(/[. ]+$/, '');
  if (!MEDIA.test(clean) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(clean)) throw new Error('badFile');
  return clean;
}
export function fileOffer(value) {
  if (!value || !/^[a-f0-9-]{36}$/i.test(value.id) || !Number.isSafeInteger(value.size) ||
      value.size <= 0 || value.size > MAX_FILE) throw new Error('badFile');
  return { id: value.id, name: safeName(value.name), size: value.size };
}
async function derive(key, id, purpose) {
  const material = await crypto.subtle.importKey('raw', from64(key, 50), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(id),
    info: encoder.encode(`entre-dos/v1/${purpose}`) }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function fingerprint(key, id) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${key}/${id}`));
  return [...new Uint8Array(digest).slice(0, 6)].map(v => v.toString(16).padStart(2, '0')).join('').match(/.{4}/g).join(' · ');
}
export async function encryptAnswer(offer, desc) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(offer.key, offer.id, 'answer');
  const data = encoder.encode(JSON.stringify({ id: offer.id, until: offer.until, desc: description(desc, 'answer') }));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(offer.id) }, key, data);
  return pack({ v: 1, id: offer.id, iv: bytes64(iv), data: bytes64(cipher) });
}
export async function decryptAnswer(offer, code) {
  if (Date.now() > offer.until) throw new Error('expired');
  const packet = unpack(code);
  if (packet.v !== 1 || packet.id !== offer.id) throw new Error('badCode');
  const iv = from64(packet.iv, 30);
  if (iv.length !== 12) throw new Error('badCode');
  try {
    const key = await derive(offer.key, offer.id, 'answer');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(offer.id) }, key, from64(packet.data));
    const answer = JSON.parse(decoder.decode(plain));
    if (answer.id !== offer.id || answer.until !== offer.until) throw new Error();
    return description(answer.desc, 'answer');
  } catch { throw new Error('badCode'); }
}

export async function channelCipher(offer, role) {
  // Cada dirección tiene una clave distinta y un contador estricto: no se reutilizan IV ni se aceptan repeticiones.
  const sendLabel = role === 'sender' ? 'phone-to-computer' : 'computer-to-phone';
  const receiveLabel = role === 'sender' ? 'computer-to-phone' : 'phone-to-computer';
  const sendKey = await derive(offer.key, offer.id, sendLabel);
  const receiveKey = await derive(offer.key, offer.id, receiveLabel);
  const aad = encoder.encode(offer.id);
  let sent = 0n, received = 0n;
  return {
    async seal(payload) {
      if (!(payload instanceof Uint8Array) || payload.length > CHUNK + 1024 || sent >= 2n ** 64n) throw new Error('protocol');
      const iv = new Uint8Array(12);
      new DataView(iv.buffer).setBigUint64(4, sent++);
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, sendKey, payload);
      const frame = new Uint8Array(12 + encrypted.byteLength);
      frame.set(iv); frame.set(new Uint8Array(encrypted), 12);
      return frame;
    },
    async open(frame) {
      const bytes = new Uint8Array(frame);
      if (bytes.length < 29 || bytes.length > CHUNK + 1052 || bytes.slice(0, 4).some(v => v !== 0) ||
          new DataView(bytes.buffer, bytes.byteOffset, 12).getBigUint64(4) !== received) throw new Error('protocol');
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: aad }, receiveKey, bytes.slice(12));
      received++;
      return new Uint8Array(plain);
    }
  };
}
export function control(value) {
  const bytes = encoder.encode(JSON.stringify(value));
  if (bytes.length > 4000) throw new Error('protocol');
  const frame = new Uint8Array(bytes.length + 1); frame[0] = 1; frame.set(bytes, 1); return frame;
}
export function readControl(bytes) {
  if (bytes[0] !== 1 || bytes.length > 4001) throw new Error('protocol');
  return JSON.parse(decoder.decode(bytes.slice(1)));
}
