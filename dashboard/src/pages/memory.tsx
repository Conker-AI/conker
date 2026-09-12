import { useState } from "react";
import { Link, useParams } from "react-router";
import { Search, ArrowLeft, Pencil, Trash2 } from "lucide-react";
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Field,
  FieldLabel,
  Status,
} from "../ui";
import { memoryFixtures } from "../fixtures/memory";
import { usePreview } from "../state";
import { EmptyState, PageHeading, SourceLink } from "../components/common";

export function MemoryPage() {
  const { id } = useParams();
  const { memoryEdits, forgottenMemory, correctMemory, forgetMemory } =
    usePreview();
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [forget, setForget] = useState<string | null>(null);
  const rows = memoryFixtures.filter(
    (item) =>
      (id ? item.id === id : true) &&
      (forgottenMemory.includes(item.id)
        ? !search
        : `${memoryEdits[item.id] ?? item.text} ${item.category}`
            .toLowerCase()
            .includes(search.toLowerCase())),
  );
  return (
    <div className="page">
      <PageHeading
        eyebrow="Reference / Memory"
        title="What Conker thinks it knows."
        description="Your words, the evidence behind them, and room to be wrong."
      />
      <div className="memory-notice">
        <Status
          evidence={{
            state: "degraded",
            detail:
              "Meaning search is unavailable. This preview searches exact words only, in either language; it does not translate your query.",
          }}
        />
      </div>
      {id ? (
        <Button asChild variant="ghost" className="back-link">
          <Link to="/memory">
            <ArrowLeft />
            All memories
          </Link>
        </Button>
      ) : (
        <div className="filter-bar">
          <div className="search-field">
            <Search />
            <Input
              aria-label="Search memories by exact words"
              placeholder="Search words · English or русский…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Badge variant="outline">Word search only</Badge>
        </div>
      )}
      <div className="memory-list">
        {rows.map((item) =>
          forgottenMemory.includes(item.id) ? (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle>
                  <h2>Memory forgotten in this preview</h2>
                </CardTitle>
                <CardDescription>
                  The memory text is hidden. This content-free record remains.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Status
                  evidence={{
                    state: "empty",
                    detail:
                      "Fixture tombstone · original source conversation has not been erased.",
                  }}
                />
                <SourceLink to="/journal?actor=You">
                  View the recorded decision
                </SourceLink>
              </CardContent>
            </Card>
          ) : (
            <Card key={item.id}>
              <CardHeader>
                <div className="memory-kicker">
                  <Badge variant="secondary">{item.category}</Badge>
                  <span>{item.age}</span>
                </div>
                <CardTitle>
                  <h2>
                    <Link to={`/memory/${item.id}`}>
                      {memoryEdits[item.id] ?? item.text}
                    </Link>
                  </h2>
                </CardTitle>
                <CardDescription>
                  {memoryEdits[item.id]
                    ? "Corrected by you in this preview"
                    : item.provenance}
                </CardDescription>
              </CardHeader>
              <CardContent className="stack">
                <div className="memory-confidence">
                  <strong>
                    {memoryEdits[item.id]
                      ? "Owner correction"
                      : `${item.confidence} confidence`}
                  </strong>
                  <span>Evidence from {item.date}</span>
                </div>
                {item.id === "mornings" && !memoryEdits[item.id] && (
                  <Status
                    evidence={{
                      state: "stale",
                      source: "Fixture preference",
                      checkedAt: new Date(
                        Date.now() - 18 * 86400000,
                      ).toISOString(),
                      detail:
                        "Predates the school timetable. Ask before using this to plan a morning.",
                    }}
                  />
                )}
                <details open={!!id}>
                  <summary>Evidence & lineage</summary>
                  <div className="evidence-quote">
                    <blockquote>“{item.quote}”</blockquote>
                    <SourceLink to={item.source}>Read the source</SourceLink>
                    {memoryEdits[item.id] && (
                      <p className="fine-print">
                        Earlier belief, now superseded: {item.text}
                      </p>
                    )}
                    <p className="fine-print">
                      Source statement → retained evidence →{" "}
                      {item.id === "study"
                        ? "tentative analysis"
                        : "quoted owner statement"}{" "}
                      → this memory.
                    </p>
                  </div>
                </details>
              </CardContent>
              <CardFooter className="memory-actions">
                <Dialog
                  open={edit === item.id}
                  onOpenChange={(open) => {
                    setEdit(open ? item.id : null);
                    setText(memoryEdits[item.id] ?? item.text);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Pencil />
                      Correct
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        What should Conker understand instead?
                      </DialogTitle>
                      <DialogDescription>
                        Your correction supersedes this fixture belief. The
                        earlier evidence remains readable.
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (text.trim()) {
                          correctMemory(item.id, text.trim());
                          setEdit(null);
                        }
                      }}
                    >
                      <Field>
                        <FieldLabel htmlFor="correction">
                          Your correction
                        </FieldLabel>
                        <textarea
                          id="correction"
                          required
                          maxLength={16000}
                          rows={4}
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                        />
                      </Field>
                      <DialogFooter className="dialog-actions">
                        <Button type="submit">Save correction</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
                <Dialog
                  open={forget === item.id}
                  onOpenChange={(open) => setForget(open ? item.id : null)}
                >
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Trash2 />
                      Forget
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Forget this fixture memory?</DialogTitle>
                      <DialogDescription>
                        Its text disappears from this preview and a tombstone
                        stays in the Journal. This does not erase the source
                        conversation or any real data.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setForget(null)}>
                        Keep it
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          forgetMemory(item.id);
                          setForget(null);
                        }}
                      >
                        Forget memory
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <SourceLink to={item.source}>Source</SourceLink>
              </CardFooter>
            </Card>
          ),
        )}
        {!rows.length && (
          <EmptyState title="No matching memories.">
            A word search can miss a related idea. Meaning search is currently
            unavailable.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
