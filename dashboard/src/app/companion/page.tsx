import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Shield, Image, Check } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { CompanionPortrait } from "@/components/companion-portrait"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select"
import { useCharacter } from "./store"

export default function CharacterStudioPage() {
  const { profile: savedProfile, save } = useCharacter()
  const [profile, setProfile] = useState(savedProfile)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const update = (patch: Partial<typeof profile>) => {
    setProfile((value) => ({ ...value, ...patch }))
    setSaved(false)
  }
  async function importPortrait(file?: File) {
    if (!file) return
    setError("")
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPEG, or WebP image under 2 MB.")
      return
    }
    try {
      const portrait = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      update({ portrait })
    } catch {
      setError("This image could not be read. Try another local image.")
    }
  }
  return (
    <BaseLayout
      title="Character Studio"
      description="A familiar face. A way of speaking. Still entirely your say."
    >
      <div className="flex flex-col gap-4 ">
        <Button variant="ghost" size="sm" asChild className="self-start">
          <Link to="/">
            <ArrowLeft />
            Back to your companion
          </Link>
        </Button>
        <div className="grid max-w-6xl items-start gap-5 lg:grid-cols-[1.3fr_1fr]">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (profile.name.trim()) {
                save({ ...profile, name: profile.name.trim() })
                setSaved(true)
              }
            }}
          >
            <Card className="gap-4 py-5 shadow-none">
              <CardHeader className="px-5">
                <CardTitle className="text-base">
                  Your companion, in your words
                </CardTitle>
                <CardDescription>
                  Changes stay in this preview until reload.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-5">
                <Tabs defaultValue="character" className="gap-5">
                  <TabsList className="border">
                    <TabsTrigger value="character">Character</TabsTrigger>
                    <TabsTrigger value="appearance">Appearance</TabsTrigger>
                  </TabsList>
                  <TabsContent value="character">
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="character-name">Name</FieldLabel>
                        <Input
                          id="character-name"
                          required
                          maxLength={60}
                          value={profile.name}
                          onChange={(event) =>
                            update({ name: event.target.value })
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="speaking-style">
                          Speaking style
                        </FieldLabel>
                        <Textarea
                          id="speaking-style"
                          rows={3}
                          maxLength={1000}
                          value={profile.speakingStyle}
                          onChange={(event) =>
                            update({ speakingStyle: event.target.value })
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="personality">
                          Personality
                        </FieldLabel>
                        <Textarea
                          id="personality"
                          rows={5}
                          maxLength={4000}
                          value={profile.personality}
                          onChange={(event) =>
                            update({ personality: event.target.value })
                          }
                        />
                        <FieldDescription>
                          A lens for conversation. These words never grant
                          permission.
                        </FieldDescription>
                      </Field>
                    </FieldGroup>
                  </TabsContent>
                  <TabsContent value="appearance">
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="portrait-file">
                          Static portrait
                        </FieldLabel>
                        <Input
                          id="portrait-file"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => {
                            void importPortrait(event.target.files?.[0])
                            event.target.value = ""
                          }}
                        />
                        <FieldDescription>
                          PNG, JPEG, or WebP · up to 2 MB · local preview only.
                        </FieldDescription>
                        {profile.portrait && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="self-start"
                            onClick={() => update({ portrait: "" })}
                          >
                            Use default portrait
                          </Button>
                        )}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="renderer">Renderer</FieldLabel>
                        <Select
                          value={profile.renderer}
                          onValueChange={(renderer) => update({ renderer })}
                        >
                          <SelectTrigger id="renderer" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="static">
                                Static portrait
                              </SelectItem>
                              <SelectItem value="live-2d">
                                Live 2D · planned
                              </SelectItem>
                              <SelectItem value="live-3d">
                                Live 3D · planned
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          Deferred renderers use the static portrait. No
                          animation engine is connected.
                        </FieldDescription>
                      </Field>
                      <Alert>
                        <Image />
                        <AlertTitle>Avatar rendering is planned</AlertTitle>
                        <AlertDescription>
                          Expressions are presentation, not a reading of your
                          feelings. The static portrait remains available.
                        </AlertDescription>
                      </Alert>
                    </FieldGroup>
                  </TabsContent>
                </Tabs>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-3 px-5">
                <Button type="submit" disabled={!profile.name.trim()}>
                  Save character
                </Button>
                {saved && (
                  <span
                    role="status"
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <Check className="size-3.5" />
                    Saved in this preview
                  </span>
                )}
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </CardFooter>
            </Card>
          </form>
          <Card className="gap-5 py-5 shadow-none">
            <CardHeader className="px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Live preview</CardTitle>
                <Badge variant="outline">Planned</Badge>
              </div>
              <CardDescription>
                Static portrait · deferred avatar renderer
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 px-5">
              {profile.portrait ? (
                <img
                  src={profile.portrait}
                  alt={`${profile.name || "Companion"} portrait preview`}
                  className="size-44 rounded-xl border object-cover"
                  onError={() => {
                    update({ portrait: "" })
                    setError(
                      "The image could not be displayed. Showing the default portrait."
                    )
                  }}
                />
              ) : (
                <CompanionPortrait
                  name={profile.name}
                  className="size-44 rounded-3xl"
                />
              )}
              <div className="text-center">
                <h2 className="text-xl font-semibold">
                  {profile.name || "Your companion"}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  “We can start small. What’s on your mind?”
                </p>
              </div>
              <dl className="flex w-full flex-col gap-3 border-t pt-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Speaking style
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words">
                    {profile.speakingStyle || "No speaking style set."}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Personality</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words">
                    {profile.personality || "No personality notes set."}
                  </dd>
                </div>
              </dl>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Profile and rendering are separate. The sample line is fixed;
                editing the profile does not generate a model reply.
              </p>
            </CardContent>
            <CardFooter className="gap-2 border-t px-5 pt-4">
              <Shield className="size-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                These words never grant permission. Tools, grants, and budgets
                stay under your control.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </BaseLayout>
  )
}
