import { lazy, Suspense, useMemo, useState } from "react"
import { Braces, ChevronDown, CircleHelp, DatabaseZap, Moon, Plus, RefreshCw, Rows3, Search, Share2, Sun, Waypoints } from "lucide-react"
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { toast, Toaster } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
  const browseTable = (table: TableSchema) => {
    selectTable(table)
    if (workspace.connection.connected) navigate(`/workspace/${workspace.connection.id}/data`)
    else navigate(`/workspace/${workspace.connection.id}/diagram`)
  }

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

  return <TooltipProvider delayDuration={400}>
    <div className="flex h-screen min-h-[620px] min-w-[900px] overflow-hidden bg-background text-foreground">
      <ExplorerSidebar connection={workspace.connection} schema={workspace.schema} selectedTable={selectedTableId} onSelectTable={browseTable} onAddConnection={() => setConnectOpen(true)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="app-drag flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button className="no-drag max-w-64 justify-start" variant="ghost" size="sm"><DatabaseZap className="text-emerald-400"/><span className="truncate">{workspace.connection.name}</span><ChevronDown className="ml-1 size-3 text-muted-foreground"/></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64"><DropdownMenuLabel>Connections</DropdownMenuLabel>{workspaces.map((entry) => <DropdownMenuItem key={entry.connection.id} onSelect={() => { setActiveId(entry.connection.id); setSelectedTableId(entry.schema.tables[0] ? `${entry.schema.tables[0].schema}.${entry.schema.tables[0].name}` : ""); navigate(`/workspace/${entry.connection.id}/${view}`) }}><span className={cn("size-2 rounded-full", entry.connection.connected ? "bg-emerald-400" : "bg-muted-foreground")}/><span className="min-w-0 flex-1 truncate">{entry.connection.name}</span>{activeId === entry.connection.id ? <Badge variant="outline">ACTIVE</Badge> : null}</DropdownMenuItem>)}<DropdownMenuSeparator/><DropdownMenuItem onSelect={() => setConnectOpen(true)}><Plus/>Add connection</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
          <span className="text-muted-foreground/30">/</span><span className="text-xs text-muted-foreground">{workspace.schema.name}</span>
          <nav className="no-drag absolute left-1/2 flex -translate-x-1/2 items-center rounded-lg border border-border bg-muted/30 p-0.5" aria-label="Workspace views">
            <ViewButton active={view === "diagram"} onClick={() => navigate(`/workspace/${workspace.connection.id}/diagram`)} icon={Waypoints}>Diagram</ViewButton>
            <ViewButton active={view === "data"} disabled={!workspace.connection.connected} onClick={() => navigate(`/workspace/${workspace.connection.id}/data`)} icon={Rows3}>Data</ViewButton>
            <ViewButton active={view === "query"} disabled={!workspace.connection.connected} onClick={() => navigate(`/workspace/${workspace.connection.id}/query`)} icon={Braces}>Query</ViewButton>
          </nav>
          <div className="no-drag ml-auto flex items-center gap-0.5">
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Search"><Search/></Button></TooltipTrigger><TooltipContent>Search workspace <kbd>⌘K</kbd></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Refresh schema" disabled={refreshing || !workspace.connection.connected} onClick={() => void refresh()}><RefreshCw className={refreshing ? "animate-spin" : ""}/></Button></TooltipTrigger><TooltipContent>{workspace.connection.connected ? "Refresh schema" : "Static SQL schema"}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Share schema"><Share2/></Button></TooltipTrigger><TooltipContent>Export diagram</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={toggleTheme}>{dark ? <Moon/> : <Sun/>}</Button></TooltipTrigger><TooltipContent>Toggle theme</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Help"><CircleHelp/></Button></TooltipTrigger><TooltipContent>Keyboard shortcuts</TooltipContent></Tooltip>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <section className="min-w-0 flex-1">
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Navigate to={`/workspace/${workspace.connection.id}/diagram`} replace />} />
                <Route path="/workspace/:connectionId">
                  <Route index element={<Navigate to="diagram" replace />} />
                  <Route path="diagram" element={<SchemaGraph schema={workspace.schema} selectedTable={selectedTableId} onSelectTable={selectTable}/>} />
                  <Route path="data" element={<DataBrowser key={`${workspace.connection.id}-${selectedTableId}`} connectionId={workspace.connection.id} table={selectedTable} onOpenQuery={() => navigate(`/workspace/${workspace.connection.id}/query`)}/>} />
                  <Route path="query" element={<QueryWorkspace key={`${workspace.connection.id}-${selectedTableId}`} connectionId={workspace.connection.id} initialTable={selectedTable} readOnly={workspace.connection.readOnly}/>} />
                </Route>
                <Route path="*" element={<Navigate to={`/workspace/${workspace.connection.id}/diagram`} replace />} />
              </Routes>
            </Suspense>
          </section>
          {view !== "query" ? <TableInspector table={selectedTable}/> : null}
        </div>

        <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-sidebar px-3 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className={cn("size-1.5 rounded-full", workspace.connection.connected ? "bg-emerald-400" : "bg-muted-foreground")}/>{workspace.connection.connected ? "Connected" : "Static schema"}</span><span>{workspace.schema.tables.length} objects</span><span className="ml-auto font-mono">{workspace.schema.dialect.toUpperCase()}</span><span>UTF-8</span><span>Ln 1, Col 1</span>
        </footer>
      </main>
    </div>
    <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} onConnected={handleConnected}/>
    <Toaster theme={dark ? "dark" : "light"} position="bottom-right" richColors closeButton />
  </TooltipProvider>
}

function ViewButton({ active, disabled = false, onClick, icon: Icon, children }: { active: boolean; disabled?: boolean; onClick: () => void; icon: typeof Waypoints; children: React.ReactNode }) {
  return <Button variant={active ? "secondary" : "ghost"} size="sm" className={cn("h-7 px-2.5 text-[11px]", active && "bg-background shadow-xs")} disabled={disabled} onClick={onClick}><Icon className="size-3.5"/>{children}</Button>
}

function RouteLoading() {
  return <div className="grid h-full place-items-center"><div className="grid justify-items-center gap-3 text-muted-foreground"><div className="query-loader"/><span className="text-xs">Loading workspace…</span></div></div>
}
