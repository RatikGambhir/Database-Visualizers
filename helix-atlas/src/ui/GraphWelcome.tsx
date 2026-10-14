import { ArrowRight, Database, Network, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GraphWelcome({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="graph-welcome">
      <div className="welcome-copy">
        <span className="eyebrow">A NEW PERSPECTIVE ON YOUR DATA</span>
        <h2>Every connection<br /> tells a story.</h2>
        <p>Bring your HelixDB graph into focus. Follow relationships, ask better questions, and see how everything fits together.</p>
        <Button className="primary welcome-connect" onClick={onConnect}>Connect Now <ArrowRight size={16} /></Button>
        <span className="welcome-connection-note">Local, remote, or cloud · Automatic reads only</span>
      </div>
      <div className="atlas-map" aria-hidden="true">
        <div className="map-caption"><span>ATLAS / CONNECTED DATA</span><span>FIG. 01</span></div>
        <svg viewBox="0 0 440 310" fill="none">
          <g className="map-orbits"><circle cx="220" cy="155" r="116" /><circle cx="220" cy="155" r="73" /><path d="M20 155h400M220 20v270" /></g>
          <g className="map-paths"><path d="M84 90 220 155 335 63M220 155l117 91M220 155 100 254M220 155 365 156M84 90 100 254M335 63 365 156 337 246" /></g>
          <g className="map-node"><circle cx="84" cy="90" r="12" /><circle cx="335" cy="63" r="10" /><circle cx="337" cy="246" r="14" /><circle cx="100" cy="254" r="9" /><circle cx="365" cy="156" r="7" /></g>
          <circle className="map-center-ring" cx="220" cy="155" r="32" /><circle className="map-center" cx="220" cy="155" r="20" />
          <path d="M213 155h14m-7-7v14" stroke="var(--accent-ink)" strokeWidth="1.5" />
          <g className="map-labels"><text x="66" y="64">NODE</text><text x="266" y="106">RELATIONSHIP</text><text x="193" y="204">CONNECTION</text></g>
        </svg>
        <div className="map-caption"><span>Discover the shape of your graph.</span><Network size={15} /></div>
      </div>
      <ol className="welcome-steps">
        <li><Database /><div><span>01 / CONNECT</span><strong>Start with your instance</strong><p>One connection to your HelixDB data.</p></div></li>
        <li><Network /><div><span>02 / EXPLORE</span><strong>Follow the relationships</strong><p>Pan, zoom, and expand your network.</p></div></li>
        <li><TerminalSquare /><div><span>03 / UNDERSTAND</span><strong>Ask a sharper question</strong><p>Use HelixSQL to find what matters.</p></div></li>
      </ol>
    </div>
  );
}
