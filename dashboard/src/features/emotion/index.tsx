import { Smile } from "lucide-react";
import type { Feature, CommandContext } from "../../platform/contributions";
import { Tooltip, TooltipTrigger, TooltipContent } from "../../ui";

const expressions = new Set(["neutral", "warm", "thoughtful", "encouraging"]);
function EmotionAnnotation({ context }: { context: CommandContext }) {
  if (context.selection.kind !== "message") return null;
  const requested = context.selection.message.emotion ?? "neutral";
  const expression = expressions.has(requested) ? requested : "neutral";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex items-center gap-1"
          data-annotation="emotion"
          aria-label={`Companion expression: ${expression}`}
        >
          <Smile className="size-3" />
          {expression}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Character expression, not a claim about your feelings.
      </TooltipContent>
    </Tooltip>
  );
}
export const emotionFeature: Feature = {
  id: "emotion",
  shipped: true,
  views: [
    {
      id: "emotion.annotation",
      slot: "message.annotations",
      label: "Expression",
      capability: "emotion",
      applies: (context) =>
        context.selection.kind === "message" &&
        context.selection.message.role === "assistant" &&
        !context.selection.message.deleted,
      Component: EmotionAnnotation,
    },
  ],
};
