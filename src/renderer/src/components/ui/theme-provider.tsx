"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Light, dark or the system's. The theme script runs before the first paint
 * on a full load. In the browser it is marked plain text, so React never
 * warns about a script inside a component and nothing runs twice.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemes>) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      scriptProps={{
        type: typeof window === "undefined" ? "text/javascript" : "text/plain",
        suppressHydrationWarning: true,
      }}
      {...props}
    >
      {children}
    </NextThemes>
  );
}
