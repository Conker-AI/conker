// Optional Windows sandbox launcher. The normal development command is npm run dev.
// Resolve and read dependency files through Node when esbuild cannot traverse
// restricted ancestor directories. Vite still chooses browser/ESM package entries.
import { createServer } from "vite"
import { createRequire } from "node:module"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = fileURLToPath(new URL("..", import.meta.url))
let resolveDependency
const server = await createServer({
  root,
  configLoader: "runner",
  cacheDir: path.join(root, ".cache/sandbox/node_modules/.vite"),
  server: { host: "localhost", port: 5173, strictPort: true },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: "node-dependency-filesystem",
          setup(build) {
            build.onResolve({ filter: /.*/ }, async (args) => {
              if (args.kind === "entry-point" || args.path.startsWith("vite:"))
                return
              const importer =
                args.importer ||
                path.join(args.resolveDir || root, "__resolver.mjs")
              const resolved = await resolveDependency?.(args.path, importer)
              if (resolved && path.isAbsolute(resolved))
                return { path: resolved }
              try {
                const require = createRequire(
                  path.join(args.resolveDir || root, "__resolver.cjs")
                )
                const fallback = require.resolve(args.path)
                return path.isAbsolute(fallback)
                  ? { path: fallback }
                  : { path: fallback, external: true }
              } catch {
                return
              }
            })
            build.onLoad(
              { filter: /\.[cm]?[jt]sx?$/, namespace: "file" },
              async (args) => ({
                contents: await readFile(args.path, "utf8"),
                loader: /\.tsx$/.test(args.path)
                  ? "tsx"
                  : /\.ts$/.test(args.path)
                    ? "ts"
                    : "jsx",
                resolveDir: path.dirname(args.path),
              })
            )
          },
        },
      ],
    },
  },
})
resolveDependency = server.config.createResolver({ asSrc: false })
await server.listen()
server.printUrls()
