import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

function TooltipContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return <TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={sideOffset} className={cn("z-50 rounded-[3px] border border-[var(--line-strong)] bg-popover px-2 py-1 font-mono text-[9px] uppercase tracking-[0.05em] text-popover-foreground shadow-[0_8px_20px_-14px_rgb(0_0_0/0.5)] data-[state=delayed-open]:animate-in data-[state=closed]:animate-out", className)} {...props} /></TooltipPrimitive.Portal>
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
