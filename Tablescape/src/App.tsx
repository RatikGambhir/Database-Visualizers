import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { MotionConfig } from "motion/react"
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { toast, Toaster } from "sonner"
import { Braces, ChevronDown, CircleHelp, Copy, DatabaseZap, Download, Moon, Plus, RefreshCw, Rows3, Search, Share2, Sun, Waypoints, X } from "@/components/ui/animated-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ConnectDialog } from "@/features/database/ConnectDialog"
import { EmptyWorkspace } from "@/features/database/EmptyWorkspace"
import { ExplorerSidebar } from "@/features/database/ExplorerSidebar"
import { KeyboardShortcutsDialog } from "@/features/database/KeyboardShortcutsDialog"
import { TableInspector } from "@/features/database/TableInspector"
import { WorkspaceSearchDialog } from "@/features/database/WorkspaceSearchDialog"
import { disconnectDatabase, refreshSchema } from "@/lib/database-api"
import { downloadText, safeFileName, schemaToJson, schemaToMermaid } from "@/lib/schema-export"
import type { ConnectionProfile, DatabaseSchema, TableSchema, WorkspaceView } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Workspace { connection: ConnectionProfile; schema: DatabaseSchema }

const SchemaGraph = lazy(() => import("@/features/database/SchemaGraph").then((module) => ({ default: module.SchemaGraph })))
const DataBrowser = lazy(() => import("@/features/database/DataBrowser").then((module) => ({ default: module.DataBrowser })))
const QueryWorkspace = lazy(() => import("@/features/database/QueryWorkspace").then((module) => ({ default: module.QueryWorkspace })))

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedTableId, setSelectedTableId] = useState("")
  const [connectOpen, setConnectOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))
  const workspace = workspaces.find((entry) => entry.connection.id === activeId) ?? null
  const selectedTable = useMemo(() => workspace?.schema.tables.find((table) => `${table.schema}.${table.name}` === selectedTableId) ?? null, [selectedTableId, workspace])
  const view = (location.pathname.match(/\/(diagram|data|query)$/)?.[1] ?? "diagram") as WorkspaceView

  const selectTable = useCallback((table: TableSchema) => setSelectedTableId(`${table.schema}.${table.name}`), [])
  const showTableInDiagram = useCallback((table: TableSchema) => {
    if (!workspace) return
    selectTable(table)
    navigate(`/workspace/${workspace.connection.id}/diagram`)
  }, [navigate, selectTable, workspace])
  const browseTable = useCallback((table: TableSchema) => {
    if (!workspace) return
    selectTable(table)
    navigate(`/workspace/${workspace.connection.id}/${workspace.connection.connected ? "data" : "diagram"}`)
  }, [navigate, selectTable, workspace])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && workspace) {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [workspace])

  const handleConnected = (next: Workspace) => {
    setWorkspaces((current) => [...current.filter((entry) => entry.connection.id !== next.connection.id), next])
    setActiveId(next.connection.id)
    setSelectedTableId(next.schema.tables[0] ? `${next.schema.tables[0].schema}.${next.schema.tables[0].name}` : "")
    navigate(`/workspace/${next.connection.id}/diagram`)
  }

  const switchWorkspace = (next: Workspace) => {
    setActiveId(next.connection.id)
    setSelectedTableId(next.schema.tables[0] ? `${next.schema.tables[0].schema}.${next.schema.tables[0].name}` : "")
    navigate(`/workspace/${next.connection.id}/${next.connection.connected ? view : "diagram"}`)
  }

  const disconnect = async () => {
    if (!workspace) return
    try {
      if (workspace.connection.connected) await disconnectDatabase(workspace.connection.id)
      const remaining = workspaces.filter((entry) => entry.connection.id !== workspace.connection.id)
      const next = remaining[0] ?? null
      setWorkspaces(remaining)
      setActiveId(next?.connection.id ?? null)
      setSelectedTableId(next?.schema.tables[0] ? `${next.schema.tables[0].schema}.${next.schema.tables[0].name}` : "")
      navigate(next ? `/workspace/${next.connection.id}/diagram` : "/")
      toast.success(workspace.connection.connected ? "Database disconnected" : "Static schema closed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect")
    }
  }

  const refresh = async () => {
    if (!workspace) return
    setRefreshing(true)
    try {
      const schema = await refreshSchema(workspace.connection.id)
      setWorkspaces((current) => current.map((entry) => entry.connection.id === workspace.connection.id ? { ...entry, schema } : entry))
      toast.success("Schema refreshed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh schema")
    } finally {
      setRefreshing(false)
    }
  }

  const exportSchema = (format: "json" | "mermaid") => {
    if (!workspace) return
    const base = safeFileName(workspace.schema.name)
    if (format === "json") downloadText(schemaToJson(workspace.schema), `${base}-schema.json`, "application/json")
    else downloadText(schemaToMermaid(workspace.schema), `${base}-erd.mmd`, "text/plain")
    toast.success(format === "json" ? "Schema exported as JSON" : "ER diagram exported as Mermaid")
  }

  const copyMermaid = async () => {
    if (!workspace) return
    await navigator.clipboard.writeText(schemaToMermaid(workspace.schema))
    toast.success("Mermaid ER diagram copied")
  }

  const toggleTheme = () => {
    setDark((current) => {
      document.documentElement.classList.toggle("dark", !current)
      return !current
    })
  }

  return <MotionConfig reducedMotion="user"><TooltipProvider delayDuration={400}>
    <a href="#workspace-content" className="skip-link">Skip to workspace</a>
    <div className="flex h-screen min-h-[560px] overflow-hidden bg-background text-foreground">
      {workspace ? <ExplorerSidebar connection={workspace.connection} schema={workspace.schema} selectedTable={selectedTableId} onSelectTable={browseTable} onAddConnection={() => setConnectOpen(true)} /> : <EmptySidebar onAddConnection={() => setConnectOpen(true)}/>}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="app-drag grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-background px-2.5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="flex min-w-0 items-center gap-1">
            <div className="no-drag mr-1 lg:hidden" aria-hidden="true"><img className="logo-mark" src="/app-icon.svg" alt=""/></div>
            {workspace ? <DropdownMenu>
              <DropdownMenuTrigger asChild><Button className="no-drag min-w-0 max-w-64 justify-start px-2" variant="ghost" size="sm"><span className={cn("grid size-6 shrink-0 place-items-center border-l-2", workspace.connection.connected ? "border-emerald-500 bg-emerald-500/8" : "border-muted-foreground bg-muted")}><DatabaseZap className={cn("size-3.5", workspace.connection.connected ? "text-emerald-500" : "text-muted-foreground")}/></span><span className="truncate font-semibold">{workspace.connection.name}</span><ChevronDown className="ml-1 size-3 text-muted-foreground"/></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64"><DropdownMenuLabel>Connections</DropdownMenuLabel>{workspaces.map((entry) => <DropdownMenuItem key={entry.connection.id} onSelect={() => switchWorkspace(entry)}><span className={cn("size-2 rounded-full", entry.connection.connected ? "bg-emerald-400" : "bg-muted-foreground")}/><span className="min-w-0 flex-1 truncate">{entry.connection.name}</span>{activeId === entry.connection.id ? <Badge variant="outline">ACTIVE</Badge> : null}</DropdownMenuItem>)}<DropdownMenuSeparator/><DropdownMenuItem onSelect={() => setConnectOpen(true)}><Plus/>Add connection</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void disconnect()}><X/>{workspace.connection.connected ? "Disconnect current" : "Close static schema"}</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu> : <div className="flex items-center gap-2 px-2 text-xs font-semibold text-muted-foreground"><DatabaseZap className="size-4"/>No database connected</div>}
            {workspace ? <><span className="text-muted-foreground/25">/</span><span className="truncate px-1 text-[10px] text-muted-foreground">{workspace.schema.name}</span></> : null}
          </div>
          <Tabs className="no-drag hidden md:flex" value={workspace ? view : "diagram"} onValueChange={(nextView) => { if (workspace) navigate(`/workspace/${workspace.connection.id}/${nextView}`) }}>
            <TabsList aria-label="Workspace views">
              <TabsTrigger value="diagram" className="text-[9px]" disabled={!workspace}><Waypoints />Diagram</TabsTrigger>
              <TabsTrigger value="data" className="text-[9px]" disabled={!workspace?.connection.connected}><Rows3 />Data</TabsTrigger>
              <TabsTrigger value="query" className="text-[9px]" disabled={!workspace?.connection.connected}><Braces />Query</TabsTrigger>
            </TabsList>
          </Tabs>
          <ButtonGroup className="no-drag ml-auto" aria-label="Workspace actions">
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Search" disabled={!workspace} onClick={() => setSearchOpen(true)}><Search/></Button></TooltipTrigger><TooltipContent>Search workspace <Kbd>⌘K</Kbd></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button className="hidden sm:inline-flex" variant="ghost" size="icon-sm" aria-label="Refresh schema" disabled={refreshing || !workspace?.connection.connected} onClick={() => void refresh()}><RefreshCw className={refreshing ? "animate-spin" : ""}/></Button></TooltipTrigger><TooltipContent>{workspace?.connection.connected ? "Refresh schema" : "Connect a database to refresh"}</TooltipContent></Tooltip>
            <DropdownMenu><Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button className="hidden sm:inline-flex" variant="ghost" size="icon-sm" aria-label="Export schema" disabled={!workspace}><Share2/></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent>Export schema</TooltipContent></Tooltip><DropdownMenuContent align="end"><DropdownMenuLabel>Export schema</DropdownMenuLabel><DropdownMenuItem onSelect={() => exportSchema("json")}><Download/>Download JSON</DropdownMenuItem><DropdownMenuItem onSelect={() => exportSchema("mermaid")}><Waypoints/>Download Mermaid ERD</DropdownMenuItem><DropdownMenuItem onSelect={() => void copyMermaid()}><Copy/>Copy Mermaid ERD</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={toggleTheme}>{dark ? <Moon/> : <Sun/>}</Button></TooltipTrigger><TooltipContent>Toggle theme</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Help" onClick={() => setShortcutsOpen(true)}><CircleHelp/></Button></TooltipTrigger><TooltipContent>Keyboard shortcuts</TooltipContent></Tooltip>
          </ButtonGroup>
        </header>

        <div className="flex min-h-0 flex-1">
          <section id="workspace-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
            {workspace ? <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Navigate to={`/workspace/${workspace.connection.id}/diagram`} replace />} />
                <Route path="/workspace/:connectionId">
                  <Route index element={<Navigate to="diagram" replace />} />
                  <Route path="diagram" element={<SchemaGraph schema={workspace.schema} selectedTable={selectedTableId} onSelectTable={selectTable} onOpenTable={workspace.connection.connected ? browseTable : undefined}/>} />
                  <Route path="data" element={<DataBrowser key={`${workspace.connection.id}-${selectedTableId}`} connectionId={workspace.connection.id} dialect={workspace.schema.dialect} table={selectedTable} readOnly={workspace.connection.readOnly} onOpenQuery={() => navigate(`/workspace/${workspace.connection.id}/query`)}/>} />
                  <Route path="query" element={<QueryWorkspace key={`${workspace.connection.id}-${selectedTableId}`} connectionId={workspace.connection.id} dialect={workspace.schema.dialect} initialTable={selectedTable} readOnly={workspace.connection.readOnly}/>} />
                </Route>
                <Route path="*" element={<Navigate to={`/workspace/${workspace.connection.id}/diagram`} replace />} />
              </Routes>
            </Suspense> : <EmptyWorkspace onConnect={() => setConnectOpen(true)}/>}
          </section>
          {workspace && view !== "query" ? <TableInspector table={selectedTable}/> : null}
        </div>

        {workspace ? <div className="flex h-11 shrink-0 items-center justify-center border-t border-border bg-background md:hidden"><Tabs value={view} onValueChange={(nextView) => navigate(`/workspace/${workspace.connection.id}/${nextView}`)}><TabsList aria-label="Workspace views"><TabsTrigger value="diagram" className="text-[9px]"><Waypoints/>Diagram</TabsTrigger><TabsTrigger value="data" className="text-[9px]" disabled={!workspace.connection.connected}><Rows3/>Data</TabsTrigger><TabsTrigger value="query" className="text-[9px]" disabled={!workspace.connection.connected}><Braces/>Query</TabsTrigger></TabsList></Tabs></div> : null}
        <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-background px-3 font-mono text-[8px] uppercase tracking-[0.08em] tabular-nums text-muted-foreground">
          {workspace ? <><span className="flex items-center gap-1.5"><span className={cn("size-1.5 rounded-full", workspace.connection.connected ? "bg-emerald-400 shadow-[0_0_0_3px_rgb(52_211_153/0.10)]" : "bg-muted-foreground")}/>{workspace.connection.connected ? "Connected" : "Static schema"}</span><span>{workspace.schema.tables.length} objects</span><span>{workspace.schema.tables.reduce((total, table) => total + table.foreignKeys.length, 0)} relationships</span><span className="ml-auto">{workspace.schema.dialect.toUpperCase()}</span><span>UTF-8</span></> : <><span>Ready</span><span className="ml-auto">No connection</span></>}
        </footer>
      </main>
    </div>
    <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} onConnected={handleConnected}/>
    {workspace ? <WorkspaceSearchDialog open={searchOpen} onOpenChange={setSearchOpen} schema={workspace.schema} onSelectTable={showTableInDiagram}/> : null}
    <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}/>
    <Toaster theme={dark ? "dark" : "light"} position="bottom-right" richColors closeButton />
  </TooltipProvider></MotionConfig>
}

function EmptySidebar({ onAddConnection }: { onAddConnection: () => void }) {
  return <aside className="hidden h-full min-h-0 w-[264px] shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground lg:flex">
    <div className="app-drag flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-3"><img className="no-drag logo-mark" src="/app-icon.svg" alt=""/><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold tracking-[-0.015em]">Tablescape</div><div className="font-mono text-[8px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Database workbench</div></div><Button className="no-drag" variant="ghost" size="icon-sm" aria-label="Add connection" onClick={onAddConnection}><Plus/></Button></div>
    <div className="grid flex-1 place-items-center px-6 text-center"><div><div className="mx-auto h-8 w-px bg-border"/><DatabaseZap className="mx-auto my-3 size-5 text-muted-foreground"/><p className="font-mono text-[9px] font-medium uppercase tracking-[0.12em]">No connections</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">Add a database to populate the schema explorer.</p><div className="mx-auto mt-3 h-8 w-px bg-border"/></div></div>
    <div className="border-t border-border p-3"><Button variant="outline" size="sm" className="w-full" onClick={onAddConnection}><Plus/>Add connection</Button></div>
  </aside>
}

function RouteLoading() {
  return <div className="grid h-full place-items-center"><div className="grid justify-items-center gap-3 text-muted-foreground"><Spinner className="size-5"/><span className="text-xs">Loading workspace…</span></div></div>
}
