import { lazy, Suspense, useCallback, useMemo, useState } from "react"
import { MotionConfig } from "motion/react"
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { toast, Toaster } from "sonner"
import { Braces, ChevronDown, CircleHelp, DatabaseZap, Moon, Plus, RefreshCw, Rows3, Search, Share2, Sun, Waypoints } from "@/components/ui/animated-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ConnectDialog } from "@/features/database/ConnectDialog"
import { ExplorerSidebar } from "@/features/database/ExplorerSidebar"
import { TableInspector } from "@/features/database/TableInspector"
import { refreshSchema } from "@/lib/database-api"
import { sampleConnection, sampleSchema } from "@/lib/sample-data"
import type { ConnectionProfile, DatabaseSchema, TableSchema, WorkspaceView } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Workspace { connection: ConnectionProfile; schema: DatabaseSchema }

const SchemaGraph = lazy(() => import("@/features/database/SchemaGraph").then((module) => ({ default: module.SchemaGraph })))
const DataBrowser = lazy(() => import("@/features/database/DataBrowser").then((module) => ({ default: module.DataBrowser })))
const QueryWorkspace = lazy(() => import("@/features/database/QueryWorkspace").then((module) => ({ default: module.QueryWorkspace })))

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([{ connection: sampleConnection, schema: sampleSchema }])
  const [activeId, setActiveId] = useState(sampleConnection.id)
  const [selectedTableId, setSelectedTableId] = useState("public.orders")
  const [connectOpen, setConnectOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [dark, setDark] = useState(false)
  const workspace = workspaces.find((entry) => entry.connection.id === activeId) ?? workspaces[0]
  const selectedTable = useMemo(() => workspace.schema.tables.find((table) => `${table.schema}.${table.name}` === selectedTableId) ?? null, [selectedTableId, workspace.schema.tables])
  const view = (location.pathname.match(/\/(diagram|data|query)$/)?.[1] ?? "diagram") as WorkspaceView

  const selectTable = (table: TableSchema) => setSelectedTableId(`${table.schema}.${table.name}`)
  const browseTable = useCallback((table: TableSchema) => {
    setSelectedTableId(`${table.schema}.${table.name}`)
    if (workspace.connection.connected) navigate(`/workspace/${workspace.connection.id}/data`)
    else navigate(`/workspace/${workspace.connection.id}/diagram`)
  }, [navigate, workspace.connection.connected, workspace.connection.id])

  const handleConnected = (next: Workspace) => {
    setWorkspaces((current) => [...current, next])
    setActiveId(next.connection.id)
    setSelectedTableId(next.schema.tables[0] ? `${next.schema.tables[0].schema}.${next.schema.tables[0].name}` : "")
    navigate(`/workspace/${next.connection.id}/diagram`)
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      const schema = await refreshSchema(workspace.connection.id)
      setWorkspaces((current) => current.map((entry) => entry.connection.id === activeId ? { ...entry, schema } : entry))
      toast.success("Schema refreshed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh schema")
    } finally {
      setRefreshing(false)
    }
  }

  const toggleTheme = () => {
    setDark((current) => {
      document.documentElement.classList.toggle("dark", !current)
      return !current
    })
  }

  return <MotionConfig reducedMotion="user"><TooltipProvider delayDuration={400}>
    <a href="#workspace-content" className="skip-link">Skip to workspace</a>
    <div className="flex h-screen min-h-[620px] min-w-[900px] overflow-hidden bg-background text-foreground">
      <ExplorerSidebar connection={workspace.connection} schema={workspace.schema} selectedTable={selectedTableId} onSelectTable={browseTable} onAddConnection={() => setConnectOpen(true)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="app-drag grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-border/80 bg-background/95 px-3 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-1">
            <DropdownMenu>
            <DropdownMenuTrigger asChild><Button className="no-drag min-w-0 max-w-64 justify-start px-2" variant="ghost" size="sm"><span className="grid size-6 shrink-0 place-items-center rounded-md border border-emerald-500/15 bg-emerald-500/8"><DatabaseZap className="size-3.5 text-emerald-500"/></span><span className="truncate font-semibold">{workspace.connection.name}</span><ChevronDown className="ml-1 size-3 text-muted-foreground"/></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64"><DropdownMenuLabel>Connections</DropdownMenuLabel>{workspaces.map((entry) => <DropdownMenuItem key={entry.connection.id} onSelect={() => { setActiveId(entry.connection.id); setSelectedTableId(entry.schema.tables[0] ? `${entry.schema.tables[0].schema}.${entry.schema.tables[0].name}` : ""); navigate(`/workspace/${entry.connection.id}/${view}`) }}><span className={cn("size-2 rounded-full", entry.connection.connected ? "bg-emerald-400" : "bg-muted-foreground")}/><span className="min-w-0 flex-1 truncate">{entry.connection.name}</span>{activeId === entry.connection.id ? <Badge variant="outline">ACTIVE</Badge> : null}</DropdownMenuItem>)}<DropdownMenuSeparator/><DropdownMenuItem onSelect={() => setConnectOpen(true)}><Plus/>Add connection</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
            <span className="text-muted-foreground/25">/</span><span className="truncate px-1 text-[10px] text-muted-foreground">{workspace.schema.name}</span>
          </div>
          <Tabs className="no-drag" value={view} onValueChange={(nextView) => navigate(`/workspace/${workspace.connection.id}/${nextView}`)}>
            <TabsList aria-label="Workspace views">
              <TabsTrigger value="diagram"><Waypoints />Diagram</TabsTrigger>
              <TabsTrigger value="data" disabled={!workspace.connection.connected}><Rows3 />Data</TabsTrigger>
              <TabsTrigger value="query" disabled={!workspace.connection.connected}><Braces />Query</TabsTrigger>
            </TabsList>
          </Tabs>
          <ButtonGroup className="no-drag ml-auto" aria-label="Workspace actions">
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Search"><Search/></Button></TooltipTrigger><TooltipContent>Search workspace <Kbd>⌘K</Kbd></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Refresh schema" disabled={refreshing || !workspace.connection.connected} onClick={() => void refresh()}><RefreshCw className={refreshing ? "animate-spin" : ""}/></Button></TooltipTrigger><TooltipContent>{workspace.connection.connected ? "Refresh schema" : "Static SQL schema"}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Share schema"><Share2/></Button></TooltipTrigger><TooltipContent>Export diagram</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={toggleTheme}>{dark ? <Moon/> : <Sun/>}</Button></TooltipTrigger><TooltipContent>Toggle theme</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Help"><CircleHelp/></Button></TooltipTrigger><TooltipContent>Keyboard shortcuts</TooltipContent></Tooltip>
          </ButtonGroup>
        </header>

        <div className="flex min-h-0 flex-1">
          <section id="workspace-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Navigate to={`/workspace/${workspace.connection.id}/diagram`} replace />} />
                <Route path="/workspace/:connectionId">
                  <Route index element={<Navigate to="diagram" replace />} />
                  <Route path="diagram" element={<SchemaGraph schema={workspace.schema} selectedTable={selectedTableId} onSelectTable={selectTable} onOpenTable={workspace.connection.connected ? browseTable : undefined}/>} />
                  <Route path="data" element={<DataBrowser key={`${workspace.connection.id}-${selectedTableId}`} connectionId={workspace.connection.id} table={selectedTable} onOpenQuery={() => navigate(`/workspace/${workspace.connection.id}/query`)}/>} />
                  <Route path="query" element={<QueryWorkspace key={`${workspace.connection.id}-${selectedTableId}`} connectionId={workspace.connection.id} initialTable={selectedTable} readOnly={workspace.connection.readOnly}/>} />
                </Route>
                <Route path="*" element={<Navigate to={`/workspace/${workspace.connection.id}/diagram`} replace />} />
              </Routes>
            </Suspense>
          </section>
          {view !== "query" ? <TableInspector table={selectedTable}/> : null}
        </div>

        <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border/70 bg-background px-3 text-[9px] tabular-nums text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className={cn("size-1.5 rounded-full", workspace.connection.connected ? "bg-emerald-400 shadow-[0_0_0_3px_rgb(52_211_153/0.10)]" : "bg-muted-foreground")}/>{workspace.connection.connected ? "Connected" : "Static schema"}</span><span>{workspace.schema.tables.length} objects</span><span className="ml-auto">{workspace.schema.dialect.toUpperCase()}</span><span>UTF-8</span><span>Ln 1, Col 1</span>
        </footer>
      </main>
    </div>
    <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} onConnected={handleConnected}/>
    <Toaster theme={dark ? "dark" : "light"} position="bottom-right" richColors closeButton />
  </TooltipProvider></MotionConfig>
}

function RouteLoading() {
  return <div className="grid h-full place-items-center"><div className="grid justify-items-center gap-3 text-muted-foreground"><Spinner className="size-5"/><span className="text-xs">Loading workspace…</span></div></div>
}
