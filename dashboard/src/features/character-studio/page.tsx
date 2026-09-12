import { useState } from "react";
import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Upload, Image, SlidersHorizontal } from "lucide-react";
import type { CharacterProfile } from "../../domain/model";
import { useObject, refresh } from "../../data/queries";
import { api } from "../../data/client";
import {
  Button,
  Input,
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  Tabs,
  TabsList,
  TabsTrigger,
  Status,
} from "../../ui";
import { PageHeading } from "../../components/common";
import { QueryState } from "../../components/object-inspector";
import { Portrait } from "./portrait";

export function CharacterStudio() {
  const query = useObject<CharacterProfile>("character", "companion");
  return query.data ? (
    <StudioForm initial={query.data} />
  ) : (
    <div className="page">
      <QueryState loading={query.isPending} error={query.error} />
    </div>
  );
}
function StudioForm({ initial }: { initial: CharacterProfile }) {
  const [profile, setProfile] = useState(initial);
  const [expression, setExpression] = useState("neutral");
  const [tab, setTab] = useState("character");
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: () => api("/character/companion", profile),
    onSuccess: () => refresh("character", "contacts", "profile"),
  });
  async function importAsset(file?: File) {
    if (!file) return;
    setError("");
    if (profile.assets.length >= 8 || file.size > 2 * 1024 * 1024) {
      setError("Use up to eight assets, each under 2 MB, for this preview.");
      return;
    }
    const portrait = ["image/png", "image/jpeg", "image/webp"].includes(
      file.type,
    );
    const model = /\.(glb|vrm|model3\.json|zip)$/i.test(file.name);
    if (!portrait && !model) {
      setError(
        "Choose PNG, JPEG or WebP for a portrait; GLB/VRM or a 2D model descriptor for a future renderer.",
      );
      return;
    }
    let url: string | undefined;
    if (portrait)
      url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    const id = crypto.randomUUID();
    setProfile((old) => ({
      ...old,
      assets: [
        ...old.assets,
        {
          id,
          name: file.name,
          kind: portrait
            ? "portrait"
            : /\.(glb|vrm)$/i.test(file.name)
              ? "model-3d"
              : "model-2d",
          url,
        },
      ],
      expressions:
        portrait && !old.expressions.neutral
          ? { ...old.expressions, neutral: id }
          : old.expressions,
    }));
  }
  return (
    <div className="page studio-page">
      <Button variant="ghost" asChild className="back-link">
        <Link to="/">
          <ArrowLeft />
          Back to your companion
        </Link>
      </Button>
      <PageHeading
        eyebrow="Companion / Settings"
        title="Character Studio"
        description="A familiar face. A way of speaking. Still entirely your say."
      />
      <div className="studio-grid">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="character">
                <SlidersHorizontal />
                Character
              </TabsTrigger>
              <TabsTrigger value="appearance">
                <Image />
                Appearance
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === "character" ? (
            <FieldGroup className="section-gap">
              <Field>
                <FieldLabel htmlFor="character-name">Name</FieldLabel>
                <Input
                  id="character-name"
                  required
                  maxLength={60}
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="speaking-style">Speaking style</FieldLabel>
                <textarea
                  id="speaking-style"
                  rows={3}
                  maxLength={1000}
                  value={profile.speakingStyle}
                  onChange={(e) =>
                    setProfile({ ...profile, speakingStyle: e.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="personality">Personality</FieldLabel>
                <textarea
                  id="personality"
                  rows={5}
                  maxLength={4000}
                  value={profile.personality}
                  onChange={(e) =>
                    setProfile({ ...profile, personality: e.target.value })
                  }
                />
                <FieldDescription>
                  A lens for conversation. In jobs and flows, this agent works
                  without the personality context. These words never grant
                  permission.
                </FieldDescription>
              </Field>
            </FieldGroup>
          ) : (
            <div className="stack section-gap">
              <Field>
                <FieldLabel htmlFor="asset-import">
                  <Upload />
                  Import an asset
                </FieldLabel>
                <Input
                  id="asset-import"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.glb,.vrm,.json,.zip"
                  onChange={(event) => {
                    void importAsset(event.target.files?.[0]).catch(() =>
                      setError(
                        "The file could not be read. Try another local image.",
                      ),
                    );
                    event.target.value = "";
                  }}
                />
                <FieldDescription>
                  Local preview only. Portrait images are read; future model
                  files are listed by name only, never executed.
                </FieldDescription>
              </Field>
              {profile.assets.map((asset) => (
                <div className="asset-row" key={asset.id}>
                  <span>
                    {asset.name}
                    <small>{asset.kind}</small>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setProfile((old) => ({
                        ...old,
                        assets: old.assets.filter(
                          (item) => item.id !== asset.id,
                        ),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Field>
                <FieldLabel htmlFor="renderer">Renderer</FieldLabel>
                <select
                  id="renderer"
                  value={profile.renderer}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      renderer: e.target.value as CharacterProfile["renderer"],
                    })
                  }
                >
                  <option value="static">Static portrait</option>
                  <option value="live-2d">Live 2D · planned</option>
                  <option value="live-3d">Live 3D · planned</option>
                </select>
              </Field>
              <h2>2D emotion pack</h2>
              <p className="body-copy">
                Map expressions to portraits. Missing mappings use neutral; a
                missing renderer uses the neutral placeholder.
              </p>
              {Object.keys(profile.expressions).map((name) => (
                <Field key={name}>
                  <FieldLabel htmlFor={`expression-${name}`}>{name}</FieldLabel>
                  <select
                    id={`expression-${name}`}
                    value={profile.expressions[name] ?? ""}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        expressions: {
                          ...profile.expressions,
                          [name]: e.target.value || null,
                        },
                      })
                    }
                  >
                    <option value="">Neutral fallback</option>
                    {profile.assets
                      .filter((asset) => asset.kind === "portrait")
                      .map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                  </select>
                </Field>
              ))}
            </div>
          )}
          <div className="studio-save">
            <Button
              type="submit"
              disabled={!profile.name.trim() || mutation.isPending}
            >
              {mutation.isPending ? "Saving…" : "Save character"}
            </Button>
            {mutation.isSuccess && (
              <span role="status">Saved in this preview.</span>
            )}
          </div>
          {(error || mutation.error) && (
            <p role="alert">{error || mutation.error?.message}</p>
          )}
        </form>
        <aside className="portrait-preview">
          <Portrait profile={profile} expression={expression} size="large" />
          <h2>{profile.name || "Your companion"}</h2>
          <p>“We can start small. What’s on your mind?”</p>
          <label>
            Preview expression
            <select
              aria-label="Preview expression"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
            >
              {Object.keys(profile.expressions).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <Status
            evidence={
              profile.renderer === "static"
                ? {
                    state: "planned",
                    detail:
                      "Static portrait preview. Expressions are presentation, not a reading of your feelings.",
                  }
                : {
                    state: "planned",
                    detail:
                      "Live renderer is not installed. Showing the neutral fallback.",
                  }
            }
          />
          <p className="fine-print">
            Profile and rendering are separate. No change here edits tools,
            standing grants, or budgets.
          </p>
        </aside>
      </div>
    </div>
  );
}
