import { Inspector } from "../ui/Inspector";

export function InspectorPane(props: React.ComponentProps<typeof Inspector>) {
  return (
    <aside className="detail-pane">
      <header className="section-header">
        <h2>
          Inspector <span className="section-index">DETAILS</span>
        </h2>
      </header>
      <Inspector {...props} />
    </aside>
  );
}
