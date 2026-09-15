import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root
const SelectValue = SelectPrimitive.Value

function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return <SelectPrimitive.Trigger className={cn("flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/25 disabled:opacity-50", className)} {...props}>{children}<SelectPrimitive.Icon><ChevronDown className="size-3.5 text-muted-foreground" /></SelectPrimitive.Icon></SelectPrimitive.Trigger>
}

function SelectContent({ className, children, position = "popper", ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return <SelectPrimitive.Portal><SelectPrimitive.Content position={position} className={cn("z-50 max-h-80 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl", position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1", className)} {...props}><SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport></SelectPrimitive.Content></SelectPrimitive.Portal>
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item className={cn("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-7 pr-2 text-sm outline-none focus:bg-accent data-[disabled]:opacity-50", className)} {...props}><span className="absolute left-2 flex size-3.5 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="size-3.5" /></SelectPrimitive.ItemIndicator></span><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></SelectPrimitive.Item>
}

export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem }
