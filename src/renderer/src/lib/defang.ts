/**
 * Takes anything that could run out of a book's page before it is shown:
 * scripts, inline handlers, javascript: links and embedded frames. The app's
 * security policy already blocks them, so this is a second lock on the door.
 */
export function defang(markup: string) {
  return markup
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "")
    .replace(/<(iframe|frameset|object|applet)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(iframe|frame|frameset|object|embed|applet|base)\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|xlink:href|action|formaction)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}
