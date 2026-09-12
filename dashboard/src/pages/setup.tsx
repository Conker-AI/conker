import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation } from "@tanstack/react-query";
import {
  Button,
  Input,
  Field,
  FieldLabel,
  FieldDescription,
  Status,
  ThemeToggle,
} from "../ui";
import { api } from "../data/client";
import { refresh } from "../data/queries";
import { Portrait } from "../features/character-studio/portrait";

export function SetupPage() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Alexey");
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: () => api("/profile/owner", { name }),
    onSuccess: async () => {
      await refresh("profile");
      navigate("/");
    },
  });
  return (
    <div className="setup-page">
      <header className="setup-top">
        <span className="wordmark">🌱 Conker</span>
        <ThemeToggle />
      </header>
      <div className="setup-container">
        <p className="eyebrow">Your space · step {step + 1} of 3</p>
        <div className="setup-step">
          {step === 0 ? (
            <>
              <Portrait size="large" />
              <h1>Come in. Make room.</h1>
              <p className="setup-lead">
                A companion for the overhead, so you can spend the day on what
                matters.
              </p>
              <p>
                This is a fixture login, with no account or secret. In the real
                system your password protects conversations and owner decisions.
                The server holds a one-way password check; the browser gets a
                temporary session.
              </p>
              <details>
                <summary>Recovery, in plain words</summary>
                <p>
                  A terminal reset on your own server signs out browser
                  sessions. It cannot restore lost records, missing backups or
                  vault keys.
                </p>
              </details>
              <Button onClick={() => setStep(1)}>Enter the preview</Button>
            </>
          ) : step === 1 ? (
            <>
              <h1>An honest connection check.</h1>
              <Status
                evidence={{
                  state: "planned",
                  detail:
                    "Stateful browser fixtures are connected. No real service was contacted.",
                }}
              />
              <Status
                evidence={{
                  state: "degraded",
                  detail:
                    "The sample memory index is unavailable. Word search remains usable.",
                }}
              />
              <Button onClick={() => setStep(2)}>Continue</Button>
            </>
          ) : (
            <>
              <h1>What should I call you?</h1>
              <Field>
                <FieldLabel htmlFor="owner-name">Your name</FieldLabel>
                <Input
                  id="owner-name"
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <FieldDescription>
                  Conker is your companion’s default name. Its face opens
                  Character Studio whenever you want to make it yours.
                </FieldDescription>
              </Field>
              <p>
                Default conversation policy: local inference, retained
                transcript, existing memory readable and new evidence retained.
                Personality does not change those choices.
              </p>
              <Button
                disabled={!name.trim() || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                Open your first conversation
              </Button>
              {mutation.error && <p role="alert">{mutation.error.message}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
