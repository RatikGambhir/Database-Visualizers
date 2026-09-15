import * as React from "react"
import { cn } from "@/lib/utils"

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        "relative flex h-9 min-w-0 items-center rounded-md border border-input bg-control shadow-[inset_0_1px_1px_rgb(0_0_0/0.035)] transition-[border-color,box-shadow,background-color] duration-150",
        "focus-within:border-ring focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/20",
        "has-[[data-disabled=true]]:cursor-not-allowed has-[[data-disabled=true]]:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

function InputGroupAddon({ className, align = "inline-start", ...props }: React.ComponentProps<"div"> & { align?: "inline-start" | "inline-end" }) {
  return <div data-slot="input-group-addon" data-align={align} className={cn("flex shrink-0 items-center justify-center text-muted-foreground data-[align=inline-start]:pl-2.5 data-[align=inline-end]:pr-2.5 [&_svg]:size-3.5", className)} {...props} />
}

function InputGroupInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input-group-control" className={cn("h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/75 disabled:cursor-not-allowed", className)} {...props} />
}

export { InputGroup, InputGroupAddon, InputGroupInput }
