import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} className={cn("h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />
}

export { Input }
