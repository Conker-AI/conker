// OpenUI mounts a development inspector that loads an unpinned script from a CDN. Conker never runs
// remote code, so the flag that inspector checks is set before the library first evaluates. Import
// this module before "@openuidev/react-lang" in every file that imports it.
const flags = globalThis as unknown as Record<symbol, unknown>
flags[Symbol.for("openui.devtools.autoMount")] = true

export {}
