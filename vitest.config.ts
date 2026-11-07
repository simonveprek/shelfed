import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "src/renderer/src") } },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: { provider: "v8", include: ["src/main/mtp/**", "src/main/kindle-files.ts", "src/renderer/src/lib/onkindle.ts"], reporter: ["text"] },
  },
});
