import * as React from "react"
import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return <kbd data-slot="kbd" className={cn("inline-flex min-h-5 items-center justify-center rounded border border-border bg-control px-1.5 text-[9px] font-medium text-muted-foreground shadow-[0_1px_0_rgb(0_0_0/0.04)]", className)} {...props} />
}

export { Kbd }
