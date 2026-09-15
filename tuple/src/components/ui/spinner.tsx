import { LoaderCircle } from "@/components/ui/animated-icons"
import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<typeof LoaderCircle>) {
  return <LoaderCircle role="status" aria-label="Loading" className={cn("size-4 animate-spin text-primary", className)} {...props} />
}

export { Spinner }
