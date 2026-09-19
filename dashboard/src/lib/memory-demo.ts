import type { Memory } from "./api/models"

type DemoEntry = [title: string, text: string, tags: string[]]

/** An isolated, illustrative dataset. Never merge these records into a user's memory store. */
const groups: Record<string, DemoEntry[]> = {
  "Research": [
    ["A garden of connected notes", "A fictional researcher groups notes by recurring questions rather than by publication date.", ["Knowledge", "Connections"]],
    ["Retrieval experiment", "Illustrative experiment: compare keyword retrieval with a vector index using a small annotated collection.", ["Search", "Evaluation"]],
    ["Evidence before conclusions", "Demo principle: retain the original passage beside every extracted claim.", ["Evidence", "Knowledge"]],
    ["Time changes context", "Illustrative note: a preference recorded last winter may need review before being reused.", ["Time", "Review"]],
    ["A question worth keeping", "Fictional research question: which useful links are missed when notes are organized only by folders?", ["Connections", "Exploration"]],
    ["Reading the neighborhood", "Demo observation: inspecting nearby records is often more useful than viewing every edge at once.", ["Connections", "Focus"]],
    ["A small evaluation set", "Illustrative test collection contains search questions, expected sources and examples of uncertain answers.", ["Evaluation", "Search"]],
    ["Preserving uncertainty", "Fictional annotation distinguishes a direct quote, a tentative interpretation and a confirmed correction.", ["Evidence", "Review"]],
    ["Discovering recurring themes", "Illustrative topic labels connect notes about experiments, systems and creative work.", ["Knowledge", "Patterns"]],
    ["Research handoff", "Demo handoff includes the question, supporting sources, unresolved issues and the next experiment.", ["Collaboration", "Evidence"]],
  ],
  "Projects": [
    ["Observatory prototype", "Fictional project: build a small observatory interface for exploring an archive of research notes.", ["Exploration", "Design"]],
    ["A deliberate first release", "Demo milestone: support search, selection and source inspection before adding advanced analysis.", ["Focus", "Planning"]],
    ["Weekly experiment review", "Illustrative project ritual compares results with assumptions and records what changed.", ["Evaluation", "Review"]],
    ["Reusable building blocks", "Fictional project guideline: shared controls should retain the same behavior across every view.", ["Design", "Systems"]],
    ["Connecting an archive", "Demo integration plan references source identifiers instead of duplicating original files.", ["Knowledge", "Systems"]],
    ["A calm failure state", "Illustrative requirement: an unavailable connection should preserve the last readable state and explain recovery.", ["Reliability", "Design"]],
    ["A reversible change", "Fictional project note: preview a record edit and keep its previous version for comparison.", ["History", "Review"]],
    ["An explicit handoff", "Demo handoff names the owner, intended result, dependencies and evidence of completion.", ["Collaboration", "Planning"]],
    ["One clear next action", "Illustrative task card has one primary action and keeps reference material available nearby.", ["Focus", "Design"]],
    ["Prototype field notes", "Fictional test session records confusing controls, successful discoveries and unexpected search terms.", ["Evaluation", "Exploration"]],
  ],
  "Creative archive": [
    ["Tidal light study", "Fictional visual study explores fine luminous lines against a quiet dark surface.", ["Light", "Design"]],
    ["A restrained color key", "Demo palette assigns a stable color to each collection, with brightness reserved for selection.", ["Color", "Focus"]],
    ["Botanical branching", "Illustrative sketch studies how branches separate naturally while preserving a readable overall silhouette.", ["Nature", "Connections"]],
    ["An atlas of fragments", "Fictional archive contains sketches, short written observations and references to larger works.", ["Knowledge", "Archive"]],
    ["Motion with a purpose", "Demo animation guides attention from a selected object to its related material.", ["Motion", "Focus"]],
    ["Soft depth", "Illustrative composition uses subtle layers, edge contrast and spacing to separate foreground from context.", ["Light", "Design"]],
    ["A pattern collection", "Fictional moodboard groups branching structures, constellations and layered maps by visual behavior.", ["Patterns", "Nature"]],
    ["Readable at every scale", "Demo design note: hide secondary labels at overview scale and reveal detail as the viewer zooms in.", ["Exploration", "Design"]],
    ["Soundscape annotation", "Illustrative archive note references a calm ambient recording; no audio asset is attached to this demo.", ["Archive", "Time"]],
    ["The selected moment", "Fictional animation sketch briefly brightens a new connection before returning to a quiet resting state.", ["Motion", "Light"]],
  ],
  "Systems": [
    ["Service boundaries", "Fictional architecture note separates storage, retrieval and presentation into independent services.", ["Systems", "Reliability"]],
    ["A trace through the system", "Demo trace links a request to its source reads, tool results and final response.", ["Evidence", "History"]],
    ["A restore rehearsal", "Illustrative operations task verifies a backup by restoring it into an isolated environment.", ["Reliability", "Evaluation"]],
    ["A transparent search path", "Fictional diagnostic view shows the query, matching records and filters used for retrieval.", ["Search", "Evidence"]],
    ["Small resource budgets", "Demo design assumption uses a small fixture so the interface remains responsive on ordinary hardware.", ["Systems", "Focus"]],
    ["The change ledger", "Illustrative log records which record changed, when it changed and the reason supplied by its editor.", ["History", "Review"]],
    ["Source ownership", "Fictional integration note keeps media in its owning storage service and shares stable references.", ["Archive", "Systems"]],
    ["Testing recovery", "Demo test interrupts a request and verifies the interface can retry without duplicating the operation.", ["Reliability", "Evaluation"]],
    ["Data with provenance", "Illustrative record includes its origin, extraction method and links to supporting material.", ["Evidence", "Knowledge"]],
    ["An observable queue", "Fictional operations panel shows queued work, active tasks and the last known successful result.", ["Planning", "Systems"]],
  ],
  "Learning": [
    ["Spaced practice", "Fictional learning note uses short revisits to connect a new concept with previous examples.", ["Practice", "Time"]],
    ["Explain it simply", "Illustrative exercise asks for a short explanation followed by one concrete example.", ["Practice", "Knowledge"]],
    ["A reflection after trying", "Demo journal entry compares the expected result with what actually happened during an exercise.", ["Review", "Evaluation"]],
    ["A map of open questions", "Fictional notebook links unresolved questions to relevant concepts and attempted answers.", ["Connections", "Exploration"]],
    ["A quiet focus block", "Illustrative routine sets aside a brief uninterrupted period for one carefully chosen task.", ["Focus", "Planning"]],
    ["Collecting useful examples", "Demo collection keeps examples that reveal a principle and counterexamples that challenge it.", ["Evidence", "Practice"]],
    ["Teaching a collaborator", "Fictional exercise turns a complex explanation into a short illustrated guide for another learner.", ["Collaboration", "Design"]],
    ["Patterns across subjects", "Illustrative observation connects feedback loops in engineering with iterative creative practice.", ["Patterns", "Systems"]],
    ["A concept worth revisiting", "Demo review note marks a confusing concept for a later explanation using a different example.", ["Review", "Time"]],
    ["Progress through experiments", "Fictional learning plan replaces a vague goal with a sequence of small, observable experiments.", ["Practice", "Planning"]],
  ],
}

export const memoryDemo: Memory[] = Object.entries(groups).flatMap(([category, entries], groupIndex) =>
  entries.map(([title, text, tags], index) => ({
    id: `demo-${groupIndex + 1}-${index + 1}`,
    title,
    text,
    tags,
    category,
    origin: "manual" as const,
    confidence: "Illustrative",
    age: "Demo",
    provenance: "Explicit illustrative demo · fictional content, not your memories",
    source: `/memory#demo-${groupIndex + 1}-${index + 1}`,
  })),
)
