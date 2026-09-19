import type { ConversationCitation } from "./conversation-types"

/** Explicit developer preview only; ordinary prompts never silently select this content. */
export const richAnswerFixture: { text: string; citations: ConversationCitation[] } = {
  text: `## A useful answer, with inspectable blocks

This is a **local rendering preview**, with a list, code, a table, mathematics and supplied citations.

1. Read the answer normally.
2. Copy or download a block without copying its controls.
3. Open a source to inspect what was actually supplied.

> Nothing in this example contacts a provider, searches the web or executes code.

### A small function

\`\`\`typescript
function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
\`\`\`

The inline expression $x^2 + y^2 = r^2$ is rendered as mathematics. A display formula:

$$
\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i
$$

| Feature | What you can do | Boundary |
| :--- | :--- | :--- |
| Code | Copy, collapse, download | Source is never executed |
| Tables | Copy Markdown or CSV, expand, download | Spreadsheet formulas are neutralized |
| Sources | Inspect supplied metadata | No invented URLs |

The renderer follows CommonMark with GFM tables. [Markdown documentation](citation:markdown-docs) An example of missing metadata: [Unavailable source](citation:missing-source).

An image remains an explicit link rather than fetching media automatically: ![Sample illustration](https://example.com/illustration.png)
`,
  citations: [{ id: "markdown-docs", label: "react-markdown documentation", href: "https://github.com/remarkjs/react-markdown", excerpt: "Reference supplied with this local preview. The renderer uses react-markdown and remark plugins; this example did not perform a live search." }],
}
