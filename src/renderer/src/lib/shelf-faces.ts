/** How far either side of the middle of a shelf both a book's sides might show, as the case leans. */
const BOTH_SIDES = 160;

/**
 * Which sides of a book at rest can be seen. A side only shows where the book
 * beside it is shorter or missing, and only on the side facing the middle of
 * the shelf, where the viewer is. Anything else is behind its neighbour.
 */
export function facesToShow(sizes: Array<{ h: number }>, i: number, x: number, width: number) {
  const middle = width / 2;
  const h = sizes[i].h;
  return {
    right: x < middle + BOTH_SIDES && (i === sizes.length - 1 || sizes[i + 1].h < h),
    left: x > middle - BOTH_SIDES && (i === 0 || sizes[i - 1].h < h),
  };
}
