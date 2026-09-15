import * as React from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

function Field({ className, orientation = "vertical", ...props }: React.ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" }) {
  return <div data-slot="field" data-orientation={orientation} className={cn("grid gap-2 data-[orientation=horizontal]:grid-cols-[minmax(0,1fr)_auto] data-[orientation=horizontal]:items-center", className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={className} {...props} />
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-description" className={cn("text-[11px] leading-relaxed text-muted-foreground text-pretty", className)} {...props} />
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("grid gap-5", className)} {...props} />
}

export { Field, FieldLabel, FieldDescription, FieldGroup }
