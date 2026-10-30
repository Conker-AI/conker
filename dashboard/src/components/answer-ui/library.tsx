import "./no-devtools"
import { createLibrary } from "@openuidev/react-lang"
import { ChartPart, SeriesPart } from "./chart"
import { ButtonPart, ChoicesPart, DateFieldPart, FormPart, SelectFieldPart, SliderFieldPart, TextFieldPart } from "./controls"
import { CalloutPart, CardPart, ProgressPart, StackPart, StatPart, StatsPart, StepPart, StepsPart, TablePart, TextPart } from "./parts"

/**
 * Conker's catalog: the only components a model may use in an answer. Built from the dashboard's own
 * parts, so generated UI looks like the rest of Conker. No images, maps, HTML or tool calls.
 */
export const answerLibrary = createLibrary({
  id: "conker-answers",
  root: "Stack",
  components: [
    StackPart, CardPart, TextPart, StatsPart, StatPart, TablePart, ChartPart, SeriesPart,
    ChoicesPart, ButtonPart, FormPart, TextFieldPart, SelectFieldPart, SliderFieldPart, DateFieldPart,
    StepsPart, StepPart, ProgressPart, CalloutPart,
  ],
})

const PREAMBLE = `## Interactive answers

Answer in Markdown as usual. When a table, chart, a few replies to tap or a short form makes the answer clearer, add a fenced block whose language is openui, written in openui-lang below. Keep the explanation as Markdown outside the block. Use at most two blocks, and none when plain text is enough. Open the block with a line \`\`\`openui and close it with a line \`\`\`.`

const RULES = [
  "A Button tap or a Form submit only sends text to you as the owner's next message. Nothing else runs, so never say something was done because a button exists.",
  "Offer Choices only when the owner is likely to pick one next; write each label as the owner's own reply.",
  "Use @OpenUrl only with https links you were given or cited.",
  "Numbers in Stat and Table carry their units. Charts take numbers only.",
]

const EXAMPLE = `Here is your week:

\`\`\`openui
root = Stack([plan, next])
plan = Table(["Day", "Run"], [["Mon", "5 km easy"], ["Wed", "6 x 400 m"], ["Sat", "12 km long"]])
next = Choices([Button("Make it lighter"), Button("Move Saturday to Sunday", @ToAssistant("Move the long run to Sunday"))])
\`\`\``

/** The system prompt that teaches a model this catalog. Pi keeps a pinned copy (npm run answer-ui:prompt). */
export function answerUiPrompt(): string {
  return answerLibrary.prompt({ preamble: PREAMBLE, additionalRules: RULES, examples: [EXAMPLE], toolCalls: false, bindings: false, builtinFunctions: false })
}
