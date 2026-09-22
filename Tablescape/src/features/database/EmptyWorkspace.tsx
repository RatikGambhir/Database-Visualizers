import { Braces, FileCode2, KeyRound, Link2, Plus, ShieldCheck, Waypoints } from "@/components/ui/animated-icons"
import { Button } from "@/components/ui/button"

export function EmptyWorkspace({ onConnect }: { onConnect: () => void }) {
  return <div className="relative h-full overflow-auto bg-canvas">
    <div className="schema-empty-grid pointer-events-none absolute inset-0 opacity-55" aria-hidden="true"/>
    <div className="relative mx-auto grid min-h-full w-full max-w-6xl content-center gap-10 px-6 py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] lg:px-12">
      <section className="self-center">
        <div className="mb-7 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="h-px w-8 bg-primary"/>
          Relational database workbench
          <span className="ml-auto tabular-nums opacity-60">001</span>
        </div>
        <h1 className="max-w-xl text-[clamp(2rem,4vw,3.35rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-balance">See the structure before you touch the data.</h1>
        <p className="mt-5 max-w-lg text-[15px] leading-6 text-muted-foreground text-pretty">Connect a live database or import DDL. Tablescape maps tables, keys, and relationships into one focused workspace—without loading placeholder records or persisting credentials.</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onConnect}><Plus/>Connect database</Button>
          <button type="button" onClick={onConnect} className="group inline-flex h-10 items-center gap-2 rounded-[3px] px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <FileCode2 className="size-3.5"/>
            Import SQL schema
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        </div>
        <div className="mt-9 grid max-w-lg grid-cols-3 border-y border-border font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          <Capability icon={Waypoints} label="Map relations"/>
          <Capability icon={Braces} label="Run SQL"/>
          <Capability icon={ShieldCheck} label="Local first"/>
        </div>
      </section>

      <SchemaPlate/>
    </div>
  </div>
}

function SchemaPlate() {
  return <section aria-label="Schema diagram preview" className="relative min-h-[390px] border border-[var(--line-strong)] bg-card/94 p-5 shadow-[12px_12px_0_color-mix(in_oklab,var(--foreground)_5%,transparent)] sm:p-7">
    <div className="flex items-center border-b border-border pb-3 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
      <Waypoints className="mr-2 size-3.5 text-primary"/>
      Schema map
      <span className="ml-auto">2 objects / 1 relation</span>
    </div>
    <div className="relative mt-7 grid grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] items-center">
      <BlueprintTable index="01" title="Identity" fields={[{ label: "Primary key", key: true }, { label: "Attribute" }, { label: "Created at" }]}/>
      <div className="relative h-px bg-relationship">
        <span className="absolute left-0 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-relationship bg-card"/>
        <span className="absolute right-0 top-1/2 size-2 translate-x-1/2 -translate-y-1/2 rotate-45 bg-relationship"/>
      </div>
      <BlueprintTable index="02" title="Transaction" fields={[{ label: "Primary key", key: true }, { label: "Identity ref", relation: true }, { label: "Status" }, { label: "Recorded at" }]}/>
    </div>
    <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between border-t border-border pt-3 font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground sm:bottom-7 sm:left-7 sm:right-7">
      <span>Drag to arrange<br/>Select to inspect</span>
      <span className="text-right">Tablescape / Draft 01<br/><span className="text-relationship">Foreign key path</span></span>
    </div>
  </section>
}

function BlueprintTable({ index, title, fields }: { index: string; title: string; fields: Array<{ label: string; key?: boolean; relation?: boolean }> }) {
  return <div className="border border-[var(--line-strong)] bg-background">
    <div className="flex h-10 items-center border-b border-border px-3">
      <span className="font-mono text-[8px] text-muted-foreground">{index}</span>
      <span className="ml-2 text-xs font-semibold">{title}</span>
    </div>
    <div>{fields.map((field) => <div key={field.label} className="flex h-8 items-center gap-2 border-b border-border/65 px-3 last:border-b-0">
      {field.key ? <KeyRound className="size-3 text-primary"/> : field.relation ? <Link2 className="size-3 text-relationship"/> : <span className="size-1 bg-muted-foreground/55"/>}
      <span className="font-mono text-[9px] text-muted-foreground">{field.label}</span>
    </div>)}</div>
  </div>
}

function Capability({ icon: Icon, label }: { icon: typeof Waypoints; label: string }) {
  return <div className="flex h-12 items-center justify-center gap-2 border-r border-border last:border-r-0"><Icon className="size-3 text-primary"/>{label}</div>
}
