import type { DirectoryEntry, TerminalSnapshot } from "../models"

const root = "/workspace/companion"
const file = (path: string): DirectoryEntry => ({ kind: "file", name: path.split("/").at(-1)!, path: `${root}/${path}` })
const directory = (path: string, children: DirectoryEntry[]): DirectoryEntry => ({
  kind: "directory", name: path.split("/").at(-1)!, path: `${root}/${path}`, children,
})

/** Illustrative project tree only; no filesystem is read by the fixture client. */
export const terminal: TerminalSnapshot = {
  prompt: "alexey@conker",
  context: [["Repository", "companion"], ["Branch", "feat/dashboard"], ["Working tree", "Unknown · no filesystem probe"], ["Last commit", "Dashboard shell scaffold · fixture"]],
  directory: {
    source: "sample",
    root: {
      kind: "directory", name: "companion", path: root,
      children: [
        directory("dashboard", [
          directory("dashboard/public", [file("dashboard/public/conker.png")]),
          directory("dashboard/src", [
            directory("dashboard/src/app", [
              directory("dashboard/src/app/home", [file("dashboard/src/app/home/page.tsx")]),
              directory("dashboard/src/app/terminal", [file("dashboard/src/app/terminal/page.tsx")]),
            ]),
            directory("dashboard/src/components", [file("dashboard/src/components/site-header.tsx"), file("dashboard/src/components/app-sidebar.tsx")]),
            directory("dashboard/src/lib", [directory("dashboard/src/lib/api", [file("dashboard/src/lib/api/client.ts")])]),
            file("dashboard/src/index.css"),
          ]),
          file("dashboard/package.json"), file("dashboard/DESIGN.md"),
        ]),
        directory("docs", [file("docs/design-language.md"), file("docs/template-reference.md")]),
        file("README.md"),
      ],
    },
  },
}
