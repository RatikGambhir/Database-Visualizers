import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} className={cn("h-9 w-full rounded-md border border-input bg-control px-3 py-1 text-sm text-foreground shadow-[inset_0_1px_1px_rgb(0_0_0/0.035)] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted-foreground/75 focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />
}

export { Input }
