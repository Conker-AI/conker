import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

/** One content grid for every dashboard route, including list and detail views. */
export function PageContainer({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("w-full min-w-0 px-4 sm:px-6 lg:px-8", className)} {...props} />
}
