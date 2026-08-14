import { readFile } from "node:fs/promises";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Private graph instances (interview prep, client work) live in graphs-local/,
// OUTSIDE publicDir, so a production build is structurally incapable of
// shipping them — vite copies public/ wholesale and .gitignore does not apply
// to builds. This dev-only middleware serves them locally with the same URLs.
function privateGraphs(): Plugin {
  return {
    name: "private-graphs",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/graphs\/([\w-]+\.json)$/);
        if (!match) return next();
        try {
          const body = await readFile(join(__dirname, "graphs-local", match[1]));
          res.setHeader("Content-Type", "application/json");
          res.end(body);
        } catch {
          next(); // fall through to public/graphs/
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), privateGraphs()],
  server: { port: 5273, strictPort: true },
});
