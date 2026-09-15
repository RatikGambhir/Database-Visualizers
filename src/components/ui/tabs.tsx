import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex h-8 items-center rounded-md bg-muted p-0.5 text-muted-foreground", className)} {...props} />
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn("inline-flex h-7 items-center justify-center rounded-[5px] px-3 text-xs font-medium outline-none transition data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", className)} {...props} />
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
