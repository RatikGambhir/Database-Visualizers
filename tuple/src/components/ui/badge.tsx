import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex items-center rounded-[5px] border px-1.5 py-0.5 text-[9px] font-semibold leading-none tracking-[0.04em] tabular-nums", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      outline: "border-border text-muted-foreground",
      success: "border-emerald-600/15 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      warning: "border-primary/25 bg-primary/12 text-accent-foreground",
    },
  },
  defaultVariants: { variant: "default" },
})

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
