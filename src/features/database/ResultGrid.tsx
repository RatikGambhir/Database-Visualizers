import { useDeferredValue, useMemo, useState } from "react"
import { toast } from "sonner"
import { Check, Copy, Download, Filter, Search, TableProperties } from "@/components/ui/animated-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
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

  if (loading) return <Empty className="h-full"><EmptyHeader><EmptyMedia variant="plain"><Spinner className="size-5"/></EmptyMedia><EmptyDescription>Running query…</EmptyDescription></EmptyHeader></Empty>
  if (!result) return <Empty className="h-full"><EmptyHeader><EmptyMedia><TableProperties className="size-4"/></EmptyMedia><EmptyTitle>Results will appear here</EmptyTitle><EmptyDescription>Run the current statement with <Kbd>⌘&nbsp;↵</Kbd> or use the toolbar above.</EmptyDescription></EmptyHeader></Empty>

  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/80 bg-background px-3">
      <Badge variant="success"><Check className="mr-1 size-2.5"/>SUCCESS</Badge>
      <span className="text-xs text-muted-foreground">{result.message}</span>
      <span className="text-[10px] text-muted-foreground/60">in {formatDuration(result.durationMs)}</span>
      <div className="ml-auto flex items-center gap-1">
        <InputGroup className="mr-1 h-7 w-44"><InputGroupAddon className="pl-2"><Search /></InputGroupAddon><InputGroupInput value={filter} onChange={(event) => setFilter(event.target.value)} className="pl-1 text-[11px]" placeholder="Filter results…" aria-label="Filter results" autoComplete="off" /></InputGroup>
        <ButtonGroup>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Copy results as JSON" onClick={() => void copyResults()}>{copied ? <Check/> : <Copy/>}</Button></TooltipTrigger><TooltipContent>Copy as JSON</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Export results as CSV" onClick={exportCsv}><Download/></Button></TooltipTrigger><TooltipContent>Export CSV</TooltipContent></Tooltip>
        </ButtonGroup>
      </div>
    </div>
    <ScrollArea className="min-h-0 flex-1">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-control/95 backdrop-blur"><TableRow><TableHead className="w-12 text-right">#</TableHead>{result.columns.map((column) => <TableHead key={column}><span className="flex items-center gap-1.5"><Filter className="size-2.5 opacity-35"/>{column}</span></TableHead>)}</TableRow></TableHeader>
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
