import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"

export function KeyboardShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const shortcuts = [
    ["Search schema", ["⌘", "K"]],
    ["Run current query", ["⌘", "↵"]],
    ["Close dialog or cancel edit", ["Esc"]],
    ["Save edited cell", ["↵"]],
  ] as const
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle><DialogDescription>Fast paths for schema navigation, queries, and data editing.</DialogDescription></DialogHeader>
      <div className="divide-y divide-border overflow-hidden rounded-[3px] border border-border">{shortcuts.map(([label, keys]) => <div key={label} className="flex h-11 items-center px-3 text-xs"><span>{label}</span><span className="ml-auto flex gap-1">{keys.map((key) => <Kbd key={key}>{key}</Kbd>)}</span></div>)}</div>
    </DialogContent>
  </Dialog>
}
