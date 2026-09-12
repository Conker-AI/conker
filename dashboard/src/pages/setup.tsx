import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, ArrowLeft, LockKeyhole } from "lucide-react";
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  Input,
  Status,
  Tabs,
  TabsList,
  TabsTrigger,
  ThemeToggle,
} from "../ui";
import { Mark } from "../components/common";
import { companionShapes, setupSteps } from "../fixtures/setup";
import { serviceFixtures } from "../fixtures/system";
import { usePreview } from "../state";

export function SetupPage() {
  const { profile, setProfile } = usePreview();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.name);
  const [companion, setCompanion] = useState(profile.companion);
  const [shape, setShape] = useState("Practical");
  const passwordForm = useRef<HTMLFormElement>(null);
  function advance(event: FormEvent) {
    event.preventDefault();
    passwordForm.current?.reset();
    setStep((s) => s + 1);
  }
  return (
    <div className="setup-page">
      <header className="setup-top">
        <span className="wordmark">
          <Mark small />
          Conker
        </span>
        <ThemeToggle />
      </header>
      <div className="setup-container">
        <div className="setup-progress">
          <span>First run</span>
          <span>Step {step + 1} of 5</span>
        </div>
        <ol className="step-track" aria-label="Setup progress">
          {setupSteps.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={i <= step ? "reached" : ""}
            >
              <span className="sr-only">{label}</span>
            </li>
          ))}
        </ol>
        <Badge variant="outline" className="setup-badge">
          Preview only · no server configuration
        </Badge>
        {step === 0 && (
          <div className="setup-step">
            <Mark />
            <h1>
              A little more room
              <br />
              for your life.
            </h1>
            <p className="setup-lead">
              A companion for the loose ends. So you can spend more of your day
              learning, building, and being on the mat.
            </p>
            <p className="body-copy">
              This is your machine and your space. Conker helps with the
              overhead; you decide what matters.
            </p>
            <Button size="lg" onClick={() => setStep(1)}>
              Make this your space
              <ArrowRight />
            </Button>
            <p className="fine-print">
              Five small steps. You can change the names and appearance later.
            </p>
          </div>
        )}
        {step === 1 && (
          <form className="setup-step" onSubmit={advance}>
            <p className="eyebrow">01 / You</p>
            <h1>What should I call you?</h1>
            <p className="setup-lead">Just a name you feel at home with.</p>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="owner-name">Your name</FieldLabel>
                <Input
                  id="owner-name"
                  autoComplete="off"
                  maxLength={60}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <FieldDescription>
                  Used in this preview only. No account is being created.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={!name.trim()}>
              Continue
              <ArrowRight />
            </Button>
          </form>
        )}
        {step === 2 && (
          <form className="setup-step" ref={passwordForm} onSubmit={advance}>
            <p className="eyebrow">02 / Your front door</p>
            <h1>A password for your space.</h1>
            <p className="setup-lead">
              It keeps other people out of your dashboard, conversations and
              decisions.
            </p>
            <div className="password-explanation">
              <LockKeyhole />
              <p>
                On a real installation, your server keeps a one-way check of the
                password, not a readable copy. Your browser gets a temporary
                session; it never holds the service keys.
              </p>
            </div>
            <Field>
              <FieldLabel htmlFor="demo-password">Demo passphrase</FieldLabel>
              <Input
                id="demo-password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
                placeholder="Use at least 12 demo characters"
              />
              <FieldDescription>
                Don’t enter a real password. This value is discarded when you
                continue. Nothing is stored or sent.
              </FieldDescription>
            </Field>
            <details className="setup-recovery">
              <summary>What if I forget my password?</summary>
              <p>
                You can reset it from the terminal on your own server. That
                signs out existing browser sessions. It cannot recover a lost
                server, missing backups, or lost vault keys. This preview does
                not set or reset a password.
              </p>
            </details>
            <Button type="submit">
              Continue
              <ArrowRight />
            </Button>
          </form>
        )}
        {step === 3 && (
          <form className="setup-step" onSubmit={advance}>
            <p className="eyebrow">03 / Your companion</p>
            <h1>Make it feel like yours.</h1>
            <Field>
              <FieldLabel htmlFor="companion-name">Companion’s name</FieldLabel>
              <Input
                id="companion-name"
                maxLength={40}
                required
                value={companion}
                onChange={(e) => setCompanion(e.target.value)}
              />
            </Field>
            <div>
              <p className="field-title">How should it meet you?</p>
              <Tabs value={shape} onValueChange={setShape}>
                <TabsList>
                  {companionShapes.map((option) => (
                    <TabsTrigger key={option.name} value={option.name}>
                      {option.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <Card className="shape-preview">
              <CardHeader>
                <CardTitle>{companion || "Your companion"}</CardTitle>
                <CardDescription>
                  {
                    companionShapes.find((option) => option.name === shape)
                      ?.description
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p>
                  “
                  {
                    companionShapes.find((option) => option.name === shape)
                      ?.example
                  }
                  ”
                </p>
                <p className="fine-print">
                  A scripted voice sample. Personality never changes
                  permissions.
                </p>
              </CardContent>
            </Card>
            <Button type="submit" disabled={!companion.trim()}>
              Check the space
              <ArrowRight />
            </Button>
          </form>
        )}
        {step === 4 && (
          <div className="setup-step">
            <p className="eyebrow">04 / An honest ready check</p>
            <h1>Ready to explore, {name}.</h1>
            <p className="setup-lead">
              The preview is ready. The sample system has a few things to attend
              to; we won’t pretend otherwise.
            </p>
            <div className="setup-services">
              {serviceFixtures.map((service) => (
                <div key={service.name}>
                  <strong>{service.name}</strong>
                  <Status evidence={service.evidence} />
                </div>
              ))}
            </div>
            <p className="fine-print">
              {companion} · {shape.toLowerCase()} voice. All names and choices
              last for this tab only. No password or backend configuration was
              saved.
            </p>
            <Button
              size="lg"
              onClick={() => {
                setProfile({
                  name: name.trim(),
                  companion: companion.trim(),
                  shape,
                });
                navigate("/chat/week");
              }}
            >
              Enter your space
              <ArrowRight />
            </Button>
          </div>
        )}
        {step > 0 && (
          <Button
            variant="ghost"
            className="setup-back"
            onClick={() => setStep((s) => s - 1)}
          >
            <ArrowLeft />
            Back
          </Button>
        )}
      </div>
      <footer className="setup-footer">
        Your hardware. Your records. Your say.
      </footer>
    </div>
  );
}
