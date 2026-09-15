import { useMemo, useState } from "react"
import { Database, FileCode2, FileStack, LoaderCircle, Server, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { chooseDatabaseFile, chooseSqlFile, connectDatabase, importSqlFile } from "@/lib/database-api"
import type { ConnectionInput, DatabaseKind, DatabaseSchema, ConnectionProfile } from "@/lib/types"
import { cn } from "@/lib/utils"

type ConnectResult = { connection: ConnectionProfile; schema: DatabaseSchema }

interface ConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: (result: ConnectResult) => void
}

const options: Array<{ kind: Exclude<DatabaseKind, "sample" | "sql-file">; label: string; detail: string; icon: typeof Database }> = [
  { kind: "sqlite", label: "SQLite", detail: "Open a local .db file", icon: FileStack },
  { kind: "postgres", label: "PostgreSQL", detail: "Local, container, or hosted", icon: Database },
  { kind: "mysql", label: "MySQL", detail: "MySQL or MariaDB URL", icon: Server },
]

const placeholders = {
  sqlite: "Choose a local database file",
  postgres: "postgresql://user:password@localhost:5432/database",
  mysql: "mysql://user:password@localhost:3306/database",
}

export function ConnectDialog({ open, onOpenChange, onConnected }: ConnectDialogProps) {
  const [kind, setKind] = useState<"sqlite" | "postgres" | "mysql">("sqlite")
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [readOnly, setReadOnly] = useState(true)
  const [pending, setPending] = useState(false)
  const selected = useMemo(() => options.find((option) => option.kind === kind)!, [kind])

  const chooseFile = async () => {
    const path = await chooseDatabaseFile()
    if (path) {
      setLocation(path)
      if (!name) setName(path.split(/[\\/]/).pop()?.replace(/\.(db|sqlite|sqlite3)$/i, "") ?? "SQLite")
    } else if (!("__TAURI_INTERNALS__" in window)) {
      toast.info("File picking is available in the Tauri desktop app.")
    }
  }

  const submit = async () => {
    if (!name.trim() || !location.trim()) return
    setPending(true)
    try {
      const config: ConnectionInput = { name: name.trim(), kind, readOnly, ...(kind === "sqlite" ? { path: location.trim() } : { url: location.trim() }) }
      const result = await connectDatabase(config)
      onConnected(result)
      toast.success(`Connected to ${result.connection.name}`)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection failed")
    } finally {
      setPending(false)
    }
  }

  const importSql = async () => {
    const path = await chooseSqlFile()
    if (!path) {
      if (!("__TAURI_INTERNALS__" in window)) toast.info("SQL import is available in the Tauri desktop app.")
      return
    }
    setPending(true)
    try {
      const fileName = path.split(/[\\/]/).pop()?.replace(/\.sql$/i, "") ?? "Imported schema"
      const result = await importSqlFile(path, fileName)
      onConnected(result)
      toast.success(`Imported ${result.schema.tables.length} objects from SQL`)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import SQL")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <div className="mb-2 flex items-center gap-2"><Badge variant="outline">NEW CONNECTION</Badge><Badge variant="success"><ShieldCheck /> Local-first</Badge></div>
          <DialogTitle className="text-xl">Connect a database</DialogTitle>
          <DialogDescription>Credentials are passed directly to the Rust process and kept out of browser storage.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 p-6">
          <Tabs value={kind} onValueChange={(value) => { setKind(value as typeof kind); setLocation("") }}>
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-muted/55 p-1">
              {options.map((option) => <TabsTrigger key={option.kind} value={option.kind} className="h-14 flex-col items-start gap-0.5 px-3 text-left"><span className="flex w-full items-center gap-2 text-sm"><option.icon className="size-3.5" />{option.label}</span><span className="w-full font-normal text-muted-foreground">{option.detail}</span></TabsTrigger>)}
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-[1fr_180px] gap-4">
            <div className="grid gap-2">
              <Label htmlFor="connection-name">Connection name</Label>
              <Input id="connection-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={selected.label + " workspace"} autoFocus />
            </div>
            <div className="grid gap-2">
              <Label>Mode</Label>
              <div className="flex h-9 rounded-md border border-input bg-background p-0.5">
                <Button type="button" variant={readOnly ? "secondary" : "ghost"} size="sm" className="h-7 flex-1" onClick={() => setReadOnly(true)}>Read only</Button>
                <Button type="button" variant={!readOnly ? "secondary" : "ghost"} size="sm" className="h-7 flex-1" onClick={() => setReadOnly(false)}>Editable</Button>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="connection-location">{kind === "sqlite" ? "Database file" : "Connection URL"}</Label>
            <div className="flex gap-2">
              <Input id="connection-location" type={kind === "sqlite" ? "text" : "password"} value={location} onChange={(event) => setLocation(event.target.value)} placeholder={placeholders[kind]} onKeyDown={(event) => { if (event.key === "Enter") void submit() }} />
              {kind === "sqlite" ? <Button type="button" variant="outline" onClick={() => void chooseFile()}>Browse…</Button> : null}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{kind === "sqlite" ? "The file is opened directly by the native process. WAL and foreign keys are supported." : "Supports SSL parameters provided by your database URL. Passwords are never saved to localStorage."}</p>
          </div>

          <button type="button" onClick={() => void importSql()} className={cn("group flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-left transition hover:border-primary/50 hover:bg-primary/5", pending && "pointer-events-none opacity-50")}>
            <span className="grid size-9 place-items-center rounded-md border border-border bg-background"><FileCode2 className="size-4 text-muted-foreground" /></span>
            <span className="grid gap-0.5"><span className="text-sm font-medium">Import a SQL schema file</span><span className="text-xs text-muted-foreground">Parse DDL without needing a running database</span></span>
          </button>
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={pending || !name.trim() || !location.trim()}>{pending ? <LoaderCircle className="animate-spin" /> : null}Connect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
