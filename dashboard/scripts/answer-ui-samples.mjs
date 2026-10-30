// Sample answers with interactive parts: every catalog component, a failure and a reply still
// arriving. Used by check-answer-ui.mjs and by the screenshot preview (answer-ui-preview/).
const fence = body => "```openui\n" + body.trim() + "\n```"

export const samples = [
  {
    id: "spending",
    title: "Numbers, a chart, a table and choices",
    text: `October came in under budget. Groceries were the biggest share; eating out went up again.

${fence(`
root = Stack([totals, trend, detail, next])
totals = Stats([Stat("Spent", "$1,240", "of $1,500"), Stat("Left", "$260", "for 2 days"), Stat("Biggest", "Groceries", "$410")])
trend = Chart("bar", ["Jul", "Aug", "Sep", "Oct"], [Series("Groceries", [380, 395, 402, 410]), Series("Eating out", [120, 160, 190, 230])], "Two categories by month")
detail = Table(["Category", "October", "Change"], [["Groceries", "$410", "+2%"], ["Rent share", "$350", "0%"], ["Eating out", "$230", "+21%"], ["Transport", "$140", "-8%"], ["Other", "$110", "+4%"]])
next = Choices([Button("Set a limit for eating out"), Button("Show November's plan", @ToAssistant("Plan November's budget from this")), Button("Open the bank export", @OpenUrl("https://example.com/export"))])
`)}

Want me to keep watching eating out next month?`,
  },
  {
    id: "plan",
    title: "Steps, progress, a card and a callout",
    text: `Here is where the move stands.

${fence(`
root = Stack([progress, steps, note, warning])
progress = Progress("Boxes packed", 18, 30)
steps = Steps([Step("Book the van", "done", "Saturday 9:00"), Step("Pack the kitchen", "current", "12 of 20 boxes"), Step("Change the address", "todo"), Step("Hand over the keys", "todo", "Monday")])
note = Card("Saturday", [Text("Van at 9:00. Two people help from 10:00. Keys for the new place at noon.")])
warning = Callout("The van company charges for every hour past 13:00.", "warning", "Watch the time")
`)}`,
  },
  {
    id: "form",
    title: "A form and a pie chart",
    text: `Tell me a bit more and I will plan the trip.

${fence(`
root = Stack([trip, split])
trip = Form("Trip details", [TextField("Where to", "City or region"), DateField("Leaving on"), SelectField("Travel by", ["Train", "Car", "Plane"]), SliderField("Budget", 200, 3000, 100, "USD", 1200)], "Plan it")
split = Chart("pie", ["Travel", "Stay", "Food", "Other"], [Series("Share", [35, 40, 20, 5])], "How budgets usually split")
`)}`,
  },
  {
    id: "failure",
    title: "A part that can't be shown",
    text: `The text around a broken part always shows.

${fence(`
root = Stack([map])
map = Map("Lisbon", 12)
`)}

Everything after it shows too.`,
  },
  {
    id: "streaming",
    title: "A reply still arriving",
    streaming: true,
    text: `Comparing the three flats now.

${"```openui"}
root = Stack([compare, pick])
compare = Table(["Flat", "Rent", "Commute"], [["Alfama", "$1,350", "25 min"], ["Baixa", "$1,600", "10 min"]`,
  },
]
