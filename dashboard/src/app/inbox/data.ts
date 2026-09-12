export type TicketStatus = "Needs you" | "Approved once" | "Denied" | "Consumed" | "Expired" | "Accepted" | "Dismissed"
export type Ticket = {
  id: string
  effect: "External" | "Deletion" | "Proposal"
  request: string
  agent: string
  service: string
  tool: string
  version: string
  decideBy: string
  spendWindow: string
  status: TicketStatus
  asked: string
  wants: string
  source: string
  args: { label: string; value: string }[]
  delta: string
  grant: string
  record: string
}

export const tickets: Ticket[] = [
  {
    id: "coach", effect: "External", request: "Ask coach about Friday’s open mat", agent: "Conker", service: "Mail",
    tool: "email.send", version: "0.2.2", decideBy: "Today, 21:00", spendWindow: "120s after approval", status: "Needs you",
    asked: "Also ask coach if Friday’s open mat is on.", wants: "Send one email to Daniel about Friday’s open mat.", source: "/chat/week#intent",
    args: [
      { label: "To", value: "Daniel <coach@dojo.example>" },
      { label: "Subject", value: "Friday’s open mat" },
      { label: "Message", value: "Hi Daniel, is open mat running this Friday at 17:00? I’d like to come if there’s space. Thanks, Alexey" },
    ],
    delta: "This email cannot be unsent once delivered. Sending mail acts outward; your grant covers reading & drafts only.",
    grant: "mail-drafts · read and prepare · no sending", record: "req_fixture_coach · args 7e34ba37c2ae",
  },
  {
    id: "cleanup", effect: "Deletion", request: "Delete 47 PDFs from Downloads", agent: "Workshop", service: "Files",
    tool: "files.delete", version: "0.2.2", decideBy: "Today, 20:00", spendWindow: "60s after approval", status: "Needs you",
    asked: "Summarise the reading notes in my Downloads folder.", wants: "Permanently delete 47 PDF files after reading them.", source: "/chat/reading#intent",
    args: [{ label: "Folder", value: "/home/alexey/Downloads" }, { label: "Files", value: "47" }, { label: "Matching", value: "*.pdf" }],
    delta: "Intent mismatch: summarising notes does not require deleting them. Permanent deletion is outside the reading grant. These files are outside the last verified backup.",
    grant: "reading-notes · observe only · no deletion", record: "req_fixture_cleanup · args eb50de5f11a8",
  },
  {
    id: "revision", effect: "Proposal", request: "Keep Sunday’s revision short", agent: "Conker", service: "Planning",
    tool: "calendar.prepare", version: "0.2.2", decideBy: "No deadline", spendWindow: "No execution grant", status: "Needs you",
    asked: "Help me leave room to study.", wants: "Prepare two 25-minute study blocks for Sunday at 10:00 and 11:00.", source: "/chat/week#intent",
    args: [{ label: "Noticed", value: "Your last three long revision blocks ran into the evening. The shorter ones finished before dinner." }, { label: "Evidence", value: "Study notes · 6, 8 and 10 September. A tentative pattern, not a confirmed preference." }, { label: "Proposed plan", value: "Sunday · 10:00 functions · 11:00 past questions. 25 minutes each." }],
    delta: "Accepting prepares a plan for review. You’ll review the times before any calendar change.",
    grant: "Proposal only · no calendar write permission", record: "proposal_fixture_revision",
  },
  {
    id: "sent", effect: "External", request: "Reply to Mum about Sunday lunch", agent: "Conker", service: "Mail",
    tool: "email.send", version: "0.2.2", decideBy: "Yesterday, 19:00", spendWindow: "Consumed once", status: "Consumed",
    asked: "Reply to Mum about Sunday.", wants: "Confirm lunch at 14:00.", source: "/chat/week#sent-user",
    args: [{ label: "To", value: "Mum <mum@example.test>" }, { label: "Subject", value: "Sunday lunch" }, { label: "Message", value: "Yes, 14:00 works. See you then!" }],
    delta: "Delivered emails cannot be unsent. The fixture records one consumed approval and a delivery receipt.",
    grant: "mail-drafts · prepare only", record: "Fixture delivery receipt · mail_017 · yesterday, 18:02",
  },
  {
    id: "expired", effect: "External", request: "Ask the school office about the exam room", agent: "Conker", service: "Mail",
    tool: "email.send", version: "0.2.2", decideBy: "Yesterday, 18:00 · elapsed", spendWindow: "Never opened", status: "Expired",
    asked: "Check where my exam is.", wants: "Ask the school office which room Monday’s maths exam is in.", source: "/chat/week#expired-user",
    args: [{ label: "To", value: "School office <office@school.example>" }, { label: "Subject", value: "Exam room" }, { label: "Message", value: "Which room is Monday’s maths exam in?" }],
    delta: "The decision deadline elapsed. No approval was granted and no email was sent.",
    grant: "mail-drafts · prepare only", record: "req_fixture_expired · no execution receipt",
  },
]
