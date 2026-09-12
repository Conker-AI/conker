import type { ComponentProps } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
export function FieldGroup({ className, ...props }: ComponentProps<"div">) { return <div data-slot="field-group" className={cn("flex flex-col gap-5", className)} {...props} /> }
export function Field({ className, ...props }: ComponentProps<"div">) { return <div data-slot="field" className={cn("flex flex-col gap-2", className)} {...props} /> }
export function FieldLabel(props: ComponentProps<typeof Label>) { return <Label {...props} /> }
export function FieldDescription({ className, ...props }: ComponentProps<"p">) { return <p className={cn("text-xs leading-relaxed text-muted-foreground", className)} {...props} /> }

