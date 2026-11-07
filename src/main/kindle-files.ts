/*
 * What counts as a book on a Kindle, and whether it's locked to it. The same
 * for a Kindle that opens as a drive and one reached over MTP.
 */

/** What a Kindle can read, the files worth matching against a library. */
const ON_DEVICE = /\.(azw3?|kfx|mobi|prc|pdf|txt|epub|docx)$/i;

/** The Kindle's own file of every highlight and note: never a book, never removed. */
const CLIPPINGS = /^my clippings\.txt$/i;

export const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;
export const isBookFile = (path: string) => ON_DEVICE.test(path) && !CLIPPINGS.test(baseName(path));

/**
 * Whether a name a device gave is a plain name. Anything can say it's a Kindle
 * over USB, so a name could be built to climb out of a folder, or to show as
 * something it isn't by reversing its text.
 */
export function isSafeName(name: string) {
  return Boolean(name) && name.length <= 255 && name !== "." && name !== ".." && !/[\\/\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(name);
}

/** Whether a path inside documents is made only of plain names and ends in a book. */
export const isSafeBookPath = (path: string) => path.split("/").every(isSafeName) && isBookFile(path);

/** The Kindle formats Shelfed reads when no DRM locks them. */
const MOBI = /\.(azw3?|mobi|prc|kf8)$/i;

/** Amazon's mark on the name of a book it delivered, for when a file's insides can't be read. */
const DELIVERED = /_(EBOK|EBSP)(\.[^.]+)?$/i;

/**
 * Whether a book on a Kindle is locked to it. Books bought from Amazon come
 * as KFX, which only a Kindle reads, as Topaz, or as MOBI with DRM, which the
 * header of its first record says. Books put on it by cable or email aren't.
 * read gives bytes from inside the file, or null when it can't.
 */
export async function lockedBy(name: string, read: (offset: number, length: number) => Promise<Buffer | null>): Promise<boolean> {
  if (/\.kfx$/i.test(name)) return true;
  if (!MOBI.test(name)) return false;
  const head = await read(0, 82);
  if (!head) return DELIVERED.test(name);
  if (head.length < 82) return false;
  if (head.toString("latin1", 0, 3) === "TPZ") return true;
  if (head.toString("latin1", 60, 68) !== "BOOKMOBI") return false;
  // The first record starts with the PalmDOC header; its seventh field is the encryption.
  const doc = await read(head.readUInt32BE(78), 14);
  if (!doc) return DELIVERED.test(name);
  return doc.length >= 14 && doc.readUInt16BE(12) !== 0;
}
