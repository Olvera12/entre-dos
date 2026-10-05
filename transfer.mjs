import {fileOffer, CHUNK} from './security.mjs';

// Tres archivos comparten una ventana acotada: el disco confirma bytes antes de permitir más.
export const MAX_ACTIVE = 3;
export const MAX_BATCH = 12;
export const WINDOW_BYTES = CHUNK * 64;
export const ACK_CHUNKS = 16;
export const READ_BYTES = 1024 * 1024;
export const MAX_QUEUED_FRAMES = 256;

export function batchOffer(files) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_BATCH) throw new Error('batchLimit');
  const values = files.map(fileOffer);
  if (new Set(values.map(file => file.id)).size !== values.length) throw new Error('protocol');
  return values;
}
export function chunkPayload(id, bytes) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) ||
      !(bytes instanceof Uint8Array) || !bytes.length || bytes.length > CHUNK) throw new Error('protocol');
  // El UUID binario permite intercalar archivos sin duplicar sus nombres ni inflar cada paquete.
  const frame = new Uint8Array(bytes.length + 17); frame[0] = 2;
  frame.set(id.replaceAll('-', '').match(/../g).map(value => parseInt(value, 16)), 1);
  frame.set(bytes, 17); return frame;
}
export function readChunk(payload) {
  if (payload[0] !== 2 || payload.length <= 17 || payload.length > CHUNK + 17) throw new Error('protocol');
  const hex = [...payload.subarray(1, 17)].map(value => value.toString(16).padStart(2, '0')).join('');
  return {id: `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`, bytes: payload.subarray(17)};
}
export function availableName(name, attempt) {
  if (!attempt) return name;
  const dot = name.lastIndexOf('.');
  return `${name.slice(0, dot).slice(0, 170)} (${attempt})${name.slice(dot)}`;
}
