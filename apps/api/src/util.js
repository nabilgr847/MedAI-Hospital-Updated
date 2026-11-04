import fs from "fs/promises";

// Escape user input before it is used inside a RegExp (prevents regex injection / ReDoS).
export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Detect the real file type from its first bytes. Returns a mime type or null.
export function detectMimeFromBytes(b) {
  if (b.length >= 4 && b.slice(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b.slice(1, 4).toString("latin1") === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length >= 12 && b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WAVE") return "audio/wav";
  if (b.length >= 4 && b.slice(0, 4).toString("latin1") === "OggS") return "audio/ogg";
  if (b.length >= 3 && b.slice(0, 3).toString("latin1") === "ID3") return "audio/mpeg";
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (b.length >= 12 && b.slice(4, 8).toString("latin1") === "ftyp") return "video/mp4";
  return null;
}

export async function detectMime(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buf, 0, 16, 0);
    return detectMimeFromBytes(buf.subarray(0, bytesRead));
  } finally { await handle.close(); }
}
