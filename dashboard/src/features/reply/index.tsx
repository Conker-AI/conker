import { Reply, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Feature, CommandContext } from "../../platform/contributions";
import { useSessionView, updateView } from "../../platform/session-view-state";
import type { Message } from "../../domain/model";
import { keys } from "../../data/queries";
import { api } from "../../data/client";
import { Button } from "../../ui";

function ReplyAttachment({ context }: { context: CommandContext }) {
  const id =
    context.selection.kind === "session" ? context.selection.sessionId : "";
  const view = useSessionView(id);
  const messages = useQuery<Message[]>({
    queryKey: keys.messages(id),
    queryFn: () => api(`/messages/${id}`),
    enabled: !!id,
  });
  if (!view.replyTo) return null;
  const target = messages.data?.find((message) => message.id === view.replyTo);
  return (
    <div className="reply-attachment">
      <Reply />
      <span>
        <strong>Replying to {target?.author ?? "a retained message"}</strong>
        <br />
        {target?.deleted
          ? "Source was forgotten; its text is unavailable."
          : (target?.text.slice(0, 110) ??
            "Source is not available in this view.")}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Clear reply target"
        onClick={() => updateView(id, { replyTo: undefined })}
      >
        <X />
      </Button>
    </div>
  );
}
export const replyFeature: Feature = {
  id: "reply",
  shipped: true,
  commands: [
    {
      id: "message.reply",
      label: "Reply",
      icon: Reply,
      capability: "reply",
      available: (context) =>
        context.selection.kind === "message" &&
        !context.selection.message.deleted &&
        context.selection.message.delivery === "accepted",
      handler: (context) => {
        if (context.selection.kind === "message")
          updateView(context.selection.sessionId, {
            replyTo: context.selection.message.id,
          });
      },
    },
  ],
  placements: [
    { slot: "message.actions", commandId: "message.reply", order: 10 },
  ],
  views: [
    {
      id: "reply.attachment",
      label: "Reply target",
      slot: "composer.tools",
      capability: "reply",
      applies: (context) => context.selection.kind === "session",
      Component: ReplyAttachment,
    },
  ],
};
