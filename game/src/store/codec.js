// The save codec (8.24): the async, byte-level half of saving. sim/save.js produces and consumes plain record objects (pure, synchronous); this
// module turns a package into the forms each channel wants and back:
//
//   .slime file    gzip of the package as one JSON container            (binary: no base64)
//   save code      base64 of the same gzip bytes                          (a text channel: paste, localStorage)
//   legacy .json   the v12-20 flat JSON, plain text, still accepted on load
//
// Sniffing on load: gzip magic 1f 8b, base64 text, or plain JSON. Every record carries a mix32 hash in the manifest (sim/save.js verifyPackage), so a
// damaged piece is reported in plain words and never silently loaded. Needs CompressionStream (browsers since 2023, Node 18+); without it the
// callers fall back to plain JSON text. Nothing here touches the sim, and nothing in sim/ imports this.
import { savePackage, restore, recHash } from "../sim/save.js";

export const SLIME_EXT = ".slime";
export const NOT_A_SAVE = "That does not look like a Slime Civ save (a .slime file, a save code or a .json save).";
export const NO_GZIP = "This browser cannot compress saves (no CompressionStream), so it saves plain text instead.";

export const canGzip = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

async function pipe(bytes, stream) {
  const w = stream.writable.getWriter();
  const out = new Response(stream.readable).arrayBuffer();
  w.write(bytes).catch(() => {});
  w.close().catch(() => {});
  return new Uint8Array(await out);
}
export const gzip = (bytes) => pipe(bytes, new CompressionStream("gzip"));
export const gunzip = (bytes) => pipe(bytes, new DecompressionStream("gzip")).catch(() => { throw new Error("This save is damaged: it would not decompress."); });

const CHUNK = 0x8000;
export function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(s);
}
export function fromB64(text) {
  let bin;
  try { bin = atob(text.replace(/\s+/g, "")); } catch (e) { throw new Error(NOT_A_SAVE); }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const enc = new TextEncoder(), dec = new TextDecoder();
/** What a blob of bytes or text is: "gzip", "json", "b64" or "unknown". */
export function sniff(input) {
  if (typeof input !== "string") {
    if (input.length > 2 && input[0] === 0x1f && input[1] === 0x8b) return "gzip";
    input = dec.decode(input.subarray(0, 64));
  }
  const t = input.trimStart();
  if (t[0] === "{" || t[0] === "[") return "json";      // (8.25: a record can be an array, the command log)
  if (/^[A-Za-z0-9+/=\s_-]{8,}/.test(t.slice(0, 64))) return "b64";
  return "unknown";
}

/** A package (or a flat snapshot) -> the bytes of a .slime file. */
export async function encodeBytes(pkg) {
  const raw = enc.encode(JSON.stringify(pkg));
  return canGzip() ? gzip(raw) : raw;
}
/** A package -> the text of a save code (base64 of the .slime bytes). */
export async function encodeCode(pkg) { return toB64(await encodeBytes(pkg)); }

/** Bytes or text in any accepted form -> the parsed object (a package, or a legacy flat save). Throws plain-text errors. */
export async function decodeAny(input, depth = 0) {
  if (depth > 3) throw new Error(NOT_A_SAVE);
  const kind = sniff(input);
  if (kind === "gzip") return decodeAny(await gunzip(input), depth + 1);
  if (kind === "b64") return decodeAny(fromB64(typeof input === "string" ? input : dec.decode(input)), depth + 1);
  if (kind !== "json") throw new Error(NOT_A_SAVE);
  try { return JSON.parse(typeof input === "string" ? input : dec.decode(input)); }
  catch (e) { throw new Error("This save is damaged: its text is cut off or changed (" + e.message.slice(0, 60) + ")."); }
}

/** The .slime bytes of a running sim. */
export async function exportSlime(sim) { return encodeBytes(savePackage(sim)); }
/** The save code of a running sim. */
export async function exportCode(sim) { return encodeCode(savePackage(sim)); }
/** Any accepted form -> a restored Sim (restore verifies a package's checksums and refuses a damaged one in plain words). */
export async function importSave(input) {
  const data = await decodeAny(input);
  if (!data || typeof data !== "object" || !(data.v >= 2)) throw new Error(NOT_A_SAVE);
  return restore(data);
}

/** A short size line for the Menu / the size report: raw JSON, gzip and base64 sizes in bytes. */
export async function sizes(pkg) {
  const raw = enc.encode(JSON.stringify(pkg)), gz = canGzip() ? await gzip(raw) : raw;
  return { raw: raw.length, gz: gz.length, b64: Math.ceil(gz.length / 3) * 4 };
}
export { recHash };
