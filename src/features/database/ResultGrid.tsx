import { useDeferredValue, useMemo, useState } from "react"
import { Check, Copy, Download, Filter, Search, TableProperties } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { QueryResult } from "@/lib/types"
import { formatDuration } from "@/lib/utils"

interface ResultGridProps { result: QueryResult | null; loading?: boolean }

export function ResultGrid({ result, loading = false }: ResultGridProps) {
  const [filter, setFilter] = useState("")
  const [copied, setCopied] = useState(false)
  const deferredFilter = useDeferredValue(filter)
  const rows = useMemo(() => {
    if (!result || !deferredFilter) return result?.rows ?? []
    const needle = deferredFilter.toLowerCase()
    return result.rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle)))
  }, [deferredFilter, result])

  const copyResults = async () => {
    if (!result) return
    await navigator.clipboard.writeText(JSON.stringify(result.rows, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const exportCsv = () => {
    if (!result) return
    const csv = [result.columns, ...result.rows.map((row) => result.columns.map((column) => row[column]))].map((row) => row.map(csvCell).join(",")).join("\n")
    const link = document.createElement("a")
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    link.download = `rdms-export-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
    toast.success("Results exported as CSV")
  }

  if (loading) return <div className="grid h-full place-items-center"><div className="grid justify-items-center gap-3 text-muted-foreground"><div className="query-loader"/><span className="text-xs">Running query…</span></div></div>
  if (!result) return <div className="grid h-full place-items-center"><div className="max-w-xs text-center"><div className="mx-auto mb-3 grid size-10 place-items-center rounded-lg border border-border bg-muted/25"><TableProperties className="size-4 text-muted-foreground"/></div><p className="text-sm font-medium">Results will appear here</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Run the current statement with <kbd>⌘ ↵</kbd> or use the toolbar above.</p></div></div>

  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
      <Badge variant="success"><Check className="mr-1 size-2.5"/>SUCCESS</Badge>
      <span className="text-xs text-muted-foreground">{result.message}</span>
      <span className="text-[10px] text-muted-foreground/60">in {formatDuration(result.durationMs)}</span>
      <div className="ml-auto flex items-center gap-1">
        <div className="relative mr-1"><Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"/><Input value={filter} onChange={(event) => setFilter(event.target.value)} className="h-7 w-44 pl-7 text-[11px]" placeholder="Filter results" /></div>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={() => void copyResults()}>{copied ? <Check/> : <Copy/>}</Button></TooltipTrigger><TooltipContent>Copy as JSON</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={exportCsv}><Download/></Button></TooltipTrigger><TooltipContent>Export CSV</TooltipContent></Tooltip>
      </div>
    </div>
    <ScrollArea className="min-h-0 flex-1">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur"><TableRow><TableHead className="w-12 text-right">#</TableHead>{result.columns.map((column) => <TableHead key={column}><span className="flex items-center gap-1.5"><Filter className="size-2.5 opacity-45"/>{column}</span></TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((row, index) => <TableRow key={index}><TableCell className="w-12 text-right text-muted-foreground/55">{index + 1}</TableCell>{result.columns.map((column) => <TableCell key={column} title={String(row[column] ?? "NULL")} className={row[column] == null ? "italic text-muted-foreground/50" : ""}>{formatCell(row[column])}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  </div>
}

function formatCell(value: unknown) {
  if (value == null) return "NULL"
  if (typeof value === "object") return JSON.stringify(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

function csvCell(value: unknown) {
  const string = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)
  return `"${string.replaceAll('"', '""')}"`
}
