import "./no-devtools"
import { createContext, useContext, useId, useState, type ReactNode } from "react"
import { defineComponent, steps, useTriggerAction, type ComponentRenderProps } from "@openuidev/react-lang"
import { z } from "zod"
import { ExternalLink, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { AnswerBlockContext, linkTarget, replyText, useBlockReply } from "./context"
import { checkedLink } from "./links"
import { formMessage, startValue, type FieldElement } from "./format"

/** Why a group's buttons are off, or a note about the last tap; one line under the group. */
function ReplyNote() {
  const reply = useBlockReply()
  const text = reply.available ? reply.notice : reply.sending === null ? reply.reason : undefined
  return text ? <p className="text-xs leading-5 text-muted-foreground">{text}</p> : null
}

const choice = "h-auto min-h-9 justify-start whitespace-normal py-2 text-left sm:min-h-8"

export const ButtonPart = defineComponent({
  name: "Button",
  description: "Sends its label (or the @ToAssistant text) as the owner's next message; @OpenUrl opens an https link.",
  props: z.object({ label: z.string(), action: z.union([steps.OpenUrl.ref, steps.ToAssistant.ref]).optional() }),
  component: function AnswerButton({ props }) {
    const trigger = useTriggerAction()
    const reply = useBlockReply()
    const label = String(props.label ?? "")
    const link = linkTarget(props.action)
    if (link !== undefined) {
      const safe = checkedLink(link)
      return safe
        ? <Button variant="outline" className={choice} render={<a href={safe} target="_blank" rel="noopener noreferrer" />}>{label}<ExternalLink aria-hidden /></Button>
        : <Button type="button" variant="outline" className={choice} disabled title="This link was blocked because it is not a web or mail address.">{label} · Link blocked</Button>
    }
    const message = replyText(label, props.action)
    const sending = reply.sending === message
    return <Button type="button" variant="outline" className={choice} disabled={!reply.available || !message.trim()} aria-busy={sending || undefined}
      onClick={() => { void trigger(label, undefined, props.action) }}>
      {sending && <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />}{sending ? "Sending…" : label}
    </Button>
  },
})

export const ChoicesPart = defineComponent({
  name: "Choices",
  description: "2 to 8 Buttons for the owner's likely next replies.",
  props: z.object({ options: z.array(ButtonPart.ref) }),
  component: ({ props, renderNode }) => <div className="flex min-w-0 flex-col gap-1.5">
    <div role="group" aria-label="Choices" className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">{renderNode(props.options)}</div>
    <ReplyNote />
  </div>,
})

type FormState = { value: (index: number) => string; set: (index: number, value: string) => void; disabled: boolean }
const FormValues = createContext<FormState | null>(null)
const FieldIndex = createContext(-1)

function useField() {
  const form = useContext(FormValues), index = useContext(FieldIndex), id = useId()
  return { id, value: form?.value(index) ?? "", set: (value: string) => form?.set(index, value), disabled: form?.disabled ?? true }
}

function FieldRow({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>
}

export const TextFieldPart = defineComponent({
  name: "TextField",
  description: "A short text answer.",
  props: z.object({ label: z.string(), placeholder: z.string().optional() }),
  component: function AnswerTextField({ props }) {
    const field = useField()
    return <FieldRow id={field.id} label={String(props.label ?? "")}><Input id={field.id} value={field.value} placeholder={props.placeholder} maxLength={500} disabled={field.disabled} onChange={event => field.set(event.target.value)} /></FieldRow>
  },
})

export const SelectFieldPart = defineComponent({
  name: "SelectField",
  description: "Pick one of up to 12 options.",
  props: z.object({ label: z.string(), options: z.array(z.string()) }),
  component: function AnswerSelectField({ props }) {
    const field = useField()
    const options = (props.options ?? []).map(String)
    return <FieldRow id={field.id} label={String(props.label ?? "")}>
      <Select value={field.value || null} onValueChange={value => field.set(typeof value === "string" ? value : "")} disabled={field.disabled} items={[{ value: null, label: "Choose…" }, ...options.map(option => ({ value: option, label: option }))]}>
        <SelectTrigger id={field.id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
      </Select>
    </FieldRow>
  },
})

export const SliderFieldPart = defineComponent({
  name: "SliderField",
  description: "A number in a range; value is where it starts.",
  props: z.object({ label: z.string(), min: z.number(), max: z.number(), step: z.number().optional(), unit: z.string().optional(), value: z.number().optional() }),
  component: function AnswerSliderField({ props }) {
    const field = useField()
    const number = Number(field.value)
    const shown = `${field.value}${props.unit ? ` ${props.unit}` : ""}`
    return <FieldRow id={field.id} label={String(props.label ?? "")}>
      <div className="flex items-center gap-3">
        <Slider value={Number.isFinite(number) ? number : props.min} min={props.min} max={props.max} step={props.step && props.step > 0 ? props.step : 1} disabled={field.disabled}
          getAriaLabel={() => String(props.label ?? "")} onValueChange={value => field.set(String(Array.isArray(value) ? value[0] : value))} />
        <output htmlFor={field.id} className="min-w-14 shrink-0 text-right text-sm tabular-nums">{shown}</output>
      </div>
    </FieldRow>
  },
})

export const DateFieldPart = defineComponent({
  name: "DateField",
  description: "A calendar date.",
  props: z.object({ label: z.string() }),
  component: function AnswerDateField({ props }) {
    const field = useField()
    return <FieldRow id={field.id} label={String(props.label ?? "")}><Input id={field.id} type="date" value={field.value} disabled={field.disabled} onChange={event => field.set(event.target.value)} /></FieldRow>
  },
})

function AnswerForm({ props, renderNode }: ComponentRenderProps<{ title: string; fields: unknown[]; submit?: string }>) {
  const trigger = useTriggerAction()
  const reply = useBlockReply()
  const { streaming } = useContext(AnswerBlockContext)
  const fields = (props.fields ?? []) as FieldElement[]
  const [edits, setEdits] = useState<Record<number, string>>({})
  const value = (index: number) => edits[index] ?? startValue(fields[index] ?? {})
  const message = formMessage(String(props.title ?? ""), fields, fields.map((_, index) => value(index)))
  const sending = reply.sending !== null && reply.sending === message
  return <form className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-label={props.title} onSubmit={event => { event.preventDefault(); if (reply.available && message) void trigger(message) }}>
    <h3 className="text-base font-semibold leading-6">{props.title}</h3>
    <FormValues.Provider value={{ value, set: (index, next) => setEdits(current => ({ ...current, [index]: next })), disabled: streaming || sending }}>
      {fields.map((field, index) => <FieldIndex.Provider key={index} value={index}>{renderNode(field)}</FieldIndex.Provider>)}
    </FormValues.Provider>
    <div className="flex flex-col gap-1.5">
      <Button type="submit" className="self-start" disabled={!reply.available || !message} aria-busy={sending || undefined}>{sending && <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />}{sending ? "Sending…" : props.submit || "Send"}</Button>
      <ReplyNote />
      {reply.available && !message && <p className="text-xs leading-5 text-muted-foreground">Fill in at least one field to send.</p>}
    </div>
  </form>
}

export const FormPart = defineComponent({
  name: "Form",
  description: "Up to 8 fields the owner fills in; submit sends them as one message.",
  props: z.object({ title: z.string(), fields: z.array(z.union([TextFieldPart.ref, SelectFieldPart.ref, SliderFieldPart.ref, DateFieldPart.ref])), submit: z.string().optional() }),
  component: AnswerForm,
})
