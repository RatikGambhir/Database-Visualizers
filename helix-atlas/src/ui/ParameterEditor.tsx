import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ParameterDraft } from "../app/parameters";

export function ParameterEditor({ rows, onChange }: { rows: ParameterDraft[]; onChange: (rows: ParameterDraft[]) => void }) {
  function update(id: number, change: Partial<ParameterDraft>) {
    onChange(rows.map((row) => row.id === id ? { ...row, ...change } : row));
  }
  return (
    <details className="parameter-editor">
      <summary>Parameters ({rows.length})</summary>
      <p className="hint-text">Use :name in values and filters. Integer and node ID values retain every digit.</p>
      {rows.map((row, index) => (
        <div key={row.id} className="parameter-row">
          <Input aria-label={`Parameter ${index + 1} name`} placeholder="name" value={row.name} onChange={(e) => update(row.id, { name: e.target.value })} />
          <select aria-label={`Parameter ${index + 1} type`} value={row.type} onChange={(e) => update(row.id, { type: e.target.value as ParameterDraft["type"], value: e.target.value === "boolean" ? "true" : "" })}>
            <option value="string">String</option><option value="integer">Integer</option><option value="nodeId">Node ID</option><option value="float">Float</option><option value="boolean">Boolean</option><option value="null">Null</option>
          </select>
          {row.type === "boolean" ? <select aria-label={`Parameter ${index + 1} value`} value={row.value} onChange={(e) => update(row.id, { value: e.target.value })}><option value="true">true</option><option value="false">false</option></select> : <Input aria-label={`Parameter ${index + 1} value`} value={row.value} disabled={row.type === "null"} onChange={(e) => update(row.id, { value: e.target.value })} />}
          <Button variant="ghost" aria-label={`Remove parameter ${index + 1}`} onClick={() => onChange(rows.filter((r) => r.id !== row.id))}>Remove</Button>
        </div>
      ))}
      <Button variant="outline" onClick={() => onChange([...rows, { id: Math.max(-1, ...rows.map((row) => row.id)) + 1, name: "", type: "string", value: "" }])}>Add parameter</Button>
    </details>
  );
}
