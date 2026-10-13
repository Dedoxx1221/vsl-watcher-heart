// @lovable.dev/vite-tanstack-config already includes the required plugins.
// Keep the normal Lovable/SSR setup unchanged; GitHub Pages uses a static SPA build.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  vite: {
    base: isGitHubPages ? "/vsl-watcher-heart/" : "/",
  },
  tanstackStart: {
    server: { entry: "server" },
    ...(isGitHubPages
      ? {
          spa: {
            enabled: true,
          },
        }
      : {}),
  },
});
