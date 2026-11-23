/*
 * Characters XML doesn't allow anywhere, not even written as &#1;: the
 * control characters other than tab, line feed and carriage return, half of a
 * surrogate pair on its own, and U+FFFE and U+FFFF. Most readers look past
 * them, but a strict one refuses the whole file, so whatever text they came
 * in with, nothing Shelfed writes as XML keeps them.
 */
const FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

export const xmlSafe = (text: string) => text.replace(FORBIDDEN, "");
