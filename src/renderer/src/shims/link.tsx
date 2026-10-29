import type { ComponentProps } from "react";

/** Stands in for next/link. Shelfed has no pages to move between, so a link is an anchor. */
export default function Link({
  href,
  transitionTypes: _transitionTypes,
  prefetch: _prefetch,
  ...rest
}: ComponentProps<"a"> & { href: string; transitionTypes?: string[]; prefetch?: boolean }) {
  return <a href={href} {...rest} />;
}
