import * as React from "react"
import { cn } from "@/lib/utils"

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty" className={cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center", className)} {...props} />
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-header" className={cn("flex max-w-sm flex-col items-center gap-1", className)} {...props} />
}

function EmptyMedia({ className, variant = "icon", ...props }: React.ComponentProps<"div"> & { variant?: "icon" | "plain" }) {
  return <div data-slot="empty-media" data-variant={variant} className={cn("mb-1 flex items-center justify-center text-muted-foreground data-[variant=icon]:size-10 data-[variant=icon]:rounded-xl data-[variant=icon]:border data-[variant=icon]:border-border data-[variant=icon]:bg-card data-[variant=icon]:shadow-[0_1px_2px_rgb(0_0_0/0.05)]", className)} {...props} />
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 data-slot="empty-title" className={cn("text-sm font-semibold", className)} {...props} />
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="empty-description" className={cn("text-xs leading-relaxed text-muted-foreground text-pretty", className)} {...props} />
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-content" className={cn("flex items-center justify-center gap-2", className)} {...props} />
}

export { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent }
