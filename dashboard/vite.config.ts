import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

// Unhashed public files every start needs (the install icons and the manifest).
const installFiles = ["manifest.webmanifest", "conker.png", "apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"]

/**
 * Fills the copied public/sw.js with this build's app shell: the entry script, what it loads before
 * the first screen (its static imports and its direct lazy imports, with their styles) and the
 * install files. The build fails if sw.js no longer has the lines it fills.
 */
function serviceWorkerShell(): Plugin {
  return {
    name: "conker-service-worker-shell",
    apply: "build",
    writeBundle(options, bundle) {
      const files = new Set(installFiles)
      const add = (name: string, lazyDepth: number) => {
        const chunk = bundle[name]
        if (!chunk || chunk.type !== "chunk" || files.has(name)) return
        files.add(name)
        chunk.viteMetadata?.importedCss.forEach(css => files.add(css))
        chunk.imports.forEach(child => add(child, 0))
        if (lazyDepth > 0) chunk.dynamicImports.forEach(child => add(child, lazyDepth - 1))
      }
      for (const chunk of Object.values(bundle)) if (chunk.type === "chunk" && chunk.isEntry) add(chunk.fileName, 1)
      const shell = [...files].sort()
      const out = options.dir ?? "dist"
      // Hashed names carry their content; the unhashed install files are hashed by content.
      const hash = createHash("sha256").update(shell.join("\n"))
      installFiles.forEach(file => hash.update(readFileSync(join(out, file))))
      const build = hash.digest("hex").slice(0, 16)
      const target = join(out, "sw.js")
      const source = readFileSync(target, "utf8")
      const filled = source
        .replace("const BUILD = 'development'", () => `const BUILD = '${build}'`)
        .replace("const SHELL = []", () => `const SHELL = ${JSON.stringify(shell)}`)
      if (!filled.includes(build) || filled.includes("const SHELL = []")) throw new Error("public/sw.js is missing its BUILD or SHELL line.")
      writeFileSync(target, filled)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerShell()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    'import.meta.env.VITE_BASENAME': JSON.stringify(process.env.VITE_BASENAME || ''),
  }
})
