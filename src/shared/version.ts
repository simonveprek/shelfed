/** Whether version a comes after b, by their numbers. A pre-release never counts. */
export function newer(a: string, b: string) {
  if (!/^\d+(\.\d+)*$/.test(a)) return false;
  const x = a.split(".").map(Number);
  const y = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0;
  }
  // The same numbers: the release comes after its own pre-release.
  return b.includes("-");
}
