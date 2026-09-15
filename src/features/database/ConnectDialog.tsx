import { useState } from "react"
import { toast } from "sonner"
import { FileCode2, FileStack, Globe2, HardDrive, Server, ShieldCheck } from "@/components/ui/animated-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { chooseDatabaseFile, chooseSqlFile, connectDatabase, importSqlFile } from "@/lib/database-api"
import type { ConnectionInput, DatabaseSchema, ConnectionProfile } from "@/lib/types"

type ConnectResult = { connection: ConnectionProfile; schema: DatabaseSchema }

interface ConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: (result: ConnectResult) => void
}

const options = [
  { source: "sqlite", label: "SQLite", detail: "Open a database file", icon: FileStack },
  { source: "server", label: "Other database", detail: "Connect with a server URL", icon: Server },
] as const

const serverLocations = [
  { value: "local", label: "Local", detail: "Running on this machine", icon: HardDrive },
  { value: "remote", label: "Remote", detail: "Hosted on another server", icon: Globe2 },
] as const

type ConnectionSource = typeof options[number]["source"]
type ServerLocation = typeof serverLocations[number]["value"]

export function ConnectDialog({ open, onOpenChange, onConnected }: ConnectDialogProps) {
  const [source, setSource] = useState<ConnectionSource>("sqlite")
  const [serverLocation, setServerLocation] = useState<ServerLocation>("local")
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [readOnly, setReadOnly] = useState(true)
  const [pending, setPending] = useState(false)

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
    const kind = source === "sqlite" ? "sqlite" : inferServerKind(location)
    if (!kind) {
      toast.error("Use a PostgreSQL or MySQL connection URL, beginning with postgresql://, postgres://, or mysql://.")
      return
    }
    setPending(true)
    try {
      const config: ConnectionInput = { name: name.trim(), kind, readOnly, ...(source === "sqlite" ? { path: location.trim() } : { url: location.trim() }) }
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
          <Tabs value={source} onValueChange={(value) => { setSource(value as ConnectionSource); setLocation("") }}>
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-muted/55 p-1">
              {options.map((option) => <TabsTrigger key={option.source} value={option.source} className="h-14 flex-col items-start gap-0.5 px-3 text-left"><span className="flex w-full items-center gap-2 text-sm"><option.icon className="size-3.5" />{option.label}</span><span className="w-full font-normal text-muted-foreground">{option.detail}</span></TabsTrigger>)}
            </TabsList>
          </Tabs>

          {source === "server" ? <div className="grid gap-2">
            <FieldLabel>Server location</FieldLabel>
            <ButtonGroup className="grid w-full grid-cols-2" aria-label="Server location">
              {serverLocations.map((option) => <Button key={option.value} type="button" variant={serverLocation === option.value ? "secondary" : "outline"} aria-pressed={serverLocation === option.value} onClick={() => { setServerLocation(option.value); setLocation("") }} className="h-auto justify-start gap-3 p-3 text-left"><span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background"><option.icon className={serverLocation === option.value ? "text-primary" : "text-muted-foreground"}/></span><span><span className="block text-xs font-semibold">{option.label}</span><span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">{option.detail}</span></span></Button>)}
            </ButtonGroup>
          </div> : null}

          <div className="grid grid-cols-[1fr_180px] gap-4">
            <Field>
              <FieldLabel htmlFor="connection-name">Connection name</FieldLabel>
              <Input id="connection-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={source === "sqlite" ? "Local workspace…" : `${serverLocation === "local" ? "Local" : "Remote"} database…`} autoFocus />
            </Field>
            <Field>
              <FieldLabel>Mode</FieldLabel>
              <ButtonGroup className="w-full" aria-label="Connection mode">
                <Button type="button" variant={readOnly ? "secondary" : "outline"} size="sm" className="flex-1" aria-pressed={readOnly} onClick={() => setReadOnly(true)}>Read only</Button>
                <Button type="button" variant={!readOnly ? "secondary" : "outline"} size="sm" className="flex-1" aria-pressed={!readOnly} onClick={() => setReadOnly(false)}>Editable</Button>
              </ButtonGroup>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="connection-location">{source === "sqlite" ? "Database file" : "Connection URL"}</FieldLabel>
            <div className="flex gap-2">
              <Input id="connection-location" type={source === "sqlite" ? "text" : "password"} value={location} onChange={(event) => setLocation(event.target.value)} placeholder={source === "sqlite" ? "Choose a local database file…" : serverLocation === "local" ? "postgresql://user:password@localhost:5432/database" : "postgresql://user:password@db.example.com:5432/database"} spellCheck={false} autoCapitalize="none" autoComplete="off" onKeyDown={(event) => { if (event.key === "Enter") void submit() }} />
              {source === "sqlite" ? <Button type="button" variant="outline" onClick={() => void chooseFile()}>Browse…</Button> : null}
            </div>
            <FieldDescription>{source === "sqlite" ? "The native process opens the file directly. WAL and foreign keys are supported." : <>The database driver is inferred from the URL. PostgreSQL, MySQL, and compatible servers are supported; credentials stay out of browser storage.</>}</FieldDescription>
          </Field>

          <Button type="button" variant="outline" disabled={pending} onClick={() => void importSql()} className="group h-auto justify-start gap-3 border-dashed bg-muted/20 p-3 text-left hover:border-primary/50 hover:bg-primary/5">
            <span className="grid size-9 place-items-center rounded-md border border-border bg-background"><FileCode2 className="size-4 text-muted-foreground" /></span>
            <span className="grid gap-0.5"><span className="text-sm font-medium">Import a SQL schema file</span><span className="text-xs font-normal text-muted-foreground">Parse DDL without needing a running database</span></span>
          </Button>
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={pending || !name.trim() || !location.trim()}>{pending ? <Spinner className="text-current" /> : null}Connect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function inferServerKind(url: string): "postgres" | "mysql" | null {
  const scheme = url.trim().match(/^([a-z][a-z\d+.-]*):\/\//i)?.[1]?.toLowerCase()
  if (scheme === "postgres" || scheme === "postgresql") return "postgres"
  if (scheme === "mysql") return "mysql"
  return null
}
