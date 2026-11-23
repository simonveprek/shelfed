/*
 * Whether a Kindle book is locked to the Kindle it was bought for. KFX and
 * Topaz only a Kindle reads at all; a MOBI or AZW3 says so in the PalmDOC
 * header at the start of its first record. Shelfed doesn't remove DRM, and
 * what a locked book holds is scrambled, so it says the book is locked
 * instead of showing that or making other formats from it.
 */

/** The files that are MOBI underneath, whatever they're called. */
export const MOBI = /\.(azw3?|mobi|prc|kf8)$/i;

/** Bytes from a file: up to length of them, from offset on, or fewer at its end. */
export type ReadAt = (offset: number, length: number) => Promise<Uint8Array>;

export async function isLockedFile(name: string, read: ReadAt): Promise<boolean> {
  if (/\.kfx$/i.test(name)) return true;
  if (!MOBI.test(name)) return false;
  try {
    const head = await read(0, 82);
    if (head.length < 82) return false;
    const text = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
    if (text(0, 3) === "TPZ") return true;
    if (text(60, 68) !== "BOOKMOBI") return false;
    // The first record starts with the PalmDOC header; its seventh field is the encryption.
    const first = new DataView(head.buffer, head.byteOffset, head.length).getUint32(78);
    const doc = await read(first, 14);
    if (doc.length < 14) return false;
    return new DataView(doc.buffer, doc.byteOffset, doc.length).getUint16(12) !== 0;
  } catch {
    return false;
  }
}
