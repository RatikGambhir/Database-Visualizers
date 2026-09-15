import { useDeferredValue, useMemo, useState } from "react"
import { toast } from "sonner"
import { Check, Copy, Download, Filter, Search, TableProperties, X } from "@/components/ui/animated-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ColumnSchema, QueryResult, TableSchema } from "@/lib/types"
import { formatDuration } from "@/lib/utils"

interface ResultGridProps {
  result: QueryResult | null
  loading?: boolean
  editable?: boolean
  table?: TableSchema
  onUpdateCell?: (row: Record<string, unknown>, column: string, value: unknown) => Promise<void>
}

export function ResultGrid({ result, loading = false, editable = false, table, onUpdateCell }: ResultGridProps) {
  const [filter, setFilter] = useState("")
  const [copied, setCopied] = useState(false)
  const deferredFilter = useDeferredValue(filter)
  const columnsByName = useMemo(() => new Map(table?.columns.map((column) => [column.name, column]) ?? []), [table])
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
      {editable ? <span className="hidden text-[10px] text-muted-foreground/60 xl:inline">Click a value to edit · keys are locked</span> : null}
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
        <TableBody>{rows.map((row, index) => <TableRow key={index}><TableCell className="w-12 text-right text-muted-foreground/55">{index + 1}</TableCell>{result.columns.map((column) => <EditableCell key={column} row={row} rowIndex={index} column={columnsByName.get(column)} columnName={column} editable={editable} onUpdate={onUpdateCell}/>)}</TableRow>)}</TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  </div>
}

interface EditableCellProps {
  row: Record<string, unknown>
  rowIndex: number
  column?: ColumnSchema
  columnName: string
  editable: boolean
  onUpdate?: (row: Record<string, unknown>, column: string, value: unknown) => Promise<void>
}

function EditableCell({ row, rowIndex, column, columnName, editable, onUpdate }: EditableCellProps) {
  const value = row[columnName]
  const canEdit = Boolean(editable && column && !column.primaryKey && !isBinaryType(column.dataType) && onUpdate)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => formatEditorValue(value))
  const [isNull, setIsNull] = useState(value == null)
  const [saving, setSaving] = useState(false)

  const cancel = () => {
    setDraft(formatEditorValue(value))
    setIsNull(value == null)
    setEditing(false)
  }

  const save = async () => {
    if (!column || !onUpdate) return
    try {
      setSaving(true)
      const nextValue = isNull ? null : parseEditorValue(draft, column.dataType, value)
      if (valuesEqual(nextValue, value)) {
        setEditing(false)
        return
      }
      await onUpdate(row, columnName, nextValue)
      setEditing(false)
      toast.success(`${columnName} updated`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the value")
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    if (!canEdit) return <TableCell title={String(value ?? "NULL")} className={value == null ? "italic text-muted-foreground/50" : ""}>{formatCell(value)}</TableCell>
    return <TableCell className="p-1"><Button type="button" variant="ghost" className="h-7 w-full min-w-24 justify-start overflow-hidden px-2 font-mono text-xs font-normal" aria-label={`Edit ${columnName}, row ${rowIndex + 1}`} title={String(value ?? "NULL")} onClick={() => { setDraft(formatEditorValue(value)); setIsNull(value == null); setEditing(true) }}><span className={value == null ? "italic text-muted-foreground/50" : "truncate"}>{formatCell(value)}</span></Button></TableCell>
  }

  return <TableCell className="min-w-64 bg-primary/5 p-1 ring-1 ring-inset ring-primary/25">
    <div className="flex items-center gap-1">
      <Input autoFocus value={isNull ? "" : draft} disabled={saving || isNull} aria-label={`New value for ${columnName}, row ${rowIndex + 1}`} className="h-7 min-w-36 rounded-sm px-2 font-mono text-xs" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); if (event.key === "Escape") cancel() }}/>
      {column?.nullable ? <Button type="button" size="sm" variant={isNull ? "secondary" : "ghost"} className="h-7 px-2 font-mono text-[9px]" aria-pressed={isNull} onClick={() => setIsNull((current) => !current)}>NULL</Button> : null}
      <Button type="button" size="icon-sm" variant="ghost" disabled={saving} aria-label="Cancel edit" onClick={cancel}><X/></Button>
      <Button type="button" size="icon-sm" disabled={saving} aria-label="Save value" onClick={() => void save()}>{saving ? <Spinner className="size-3"/> : <Check/>}</Button>
    </div>
  </TableCell>
}

function formatCell(value: unknown) {
  if (value == null) return "NULL"
  if (typeof value === "object") return JSON.stringify(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

function formatEditorValue(value: unknown) {
  if (value == null) return ""
  return typeof value === "object" ? JSON.stringify(value) : String(value)
}

function parseEditorValue(draft: string, dataType: string, currentValue: unknown): unknown {
  const normalizedType = dataType.toLowerCase()
  if (typeof currentValue === "boolean" || /\b(bool|boolean)\b/.test(normalizedType)) {
    if (draft.trim().toLowerCase() === "true") return true
    if (draft.trim().toLowerCase() === "false") return false
    throw new Error("Boolean values must be true or false.")
  }
  if (/\b(bigint|int8|numeric|decimal)\b/.test(normalizedType)) {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(draft.trim())) throw new Error("Enter a valid number.")
    return draft.trim()
  }
  if (typeof currentValue === "number" || /\b(tinyint|smallint|integer|bigint|int\d*|real|float|double|numeric|decimal)\b/.test(normalizedType)) {
    if (draft.trim() === "" || !Number.isFinite(Number(draft))) throw new Error("Enter a valid number.")
    return Number(draft)
  }
  if (typeof currentValue === "object" || /\b(json|jsonb)\b/.test(normalizedType)) {
    try { return JSON.parse(draft) as unknown } catch { throw new Error("Enter valid JSON.") }
  }
  return draft
}

function isBinaryType(dataType: string) {
  return /\b(blob|binary|varbinary|bytea)\b/i.test(dataType)
}

function valuesEqual(left: unknown, right: unknown) {
  if (Object.is(left, right)) return true
  if (typeof left === "object" && typeof right === "object") return JSON.stringify(left) === JSON.stringify(right)
  return false
}

function csvCell(value: unknown) {
  const string = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)
  return `"${string.replaceAll('"', '""')}"`
}
