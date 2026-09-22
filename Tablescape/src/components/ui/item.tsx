import * as React from "react"
import { cn } from "@/lib/utils"

function ItemGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-group" className={cn("overflow-hidden rounded-[3px] border border-border bg-card divide-y divide-border/65", className)} {...props} />
}

function Item({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item" className={cn("flex min-w-0 items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/35", className)} {...props} />
}

function ItemMedia({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-media" className={cn("flex size-5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5", className)} {...props} />
}

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-content" className={cn("min-w-0 flex-1", className)} {...props} />
}

function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-title" className={cn("truncate text-xs font-medium", className)} {...props} />
}

function ItemDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-description" className={cn("mt-0.5 truncate text-[10px] text-muted-foreground", className)} {...props} />
}

function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-actions" className={cn("ml-auto flex shrink-0 items-center gap-1", className)} {...props} />
}

export { ItemGroup, Item, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions }
