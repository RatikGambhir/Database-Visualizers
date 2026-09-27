import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import "./SplashScreen.css";

type SplashTokenKind =
  | "keyword"
  | "entity"
  | "label"
  | "property"
  | "direction"
  | "operator"
  | "literal"
  | "number"
  | "punctuation";

interface SplashToken {
  text: string;
  kind: SplashTokenKind;
}

interface SplashLine {
  tokens: SplashToken[];
}

interface Props {
  onComplete: () => void;
  minDuration?: number;
}

/** A valid HelixSQL graph query, tokenized for the animated editor preview. */
const HELIX_SQL_PREVIEW: SplashLine[] = [
  {
    tokens: [
      { text: "QUERY", kind: "keyword" },
      { text: " ", kind: "punctuation" },
      { text: "NODES", kind: "entity" },
      { text: ":", kind: "punctuation" },
      { text: "User", kind: "label" },
    ],
  },
  {
    tokens: [
      { text: "WHERE", kind: "keyword" },
      { text: " active ", kind: "property" },
      { text: "=", kind: "operator" },
      { text: " ", kind: "punctuation" },
      { text: "true", kind: "literal" },
    ],
  },
  {
    tokens: [
      { text: "TRAVERSE", kind: "keyword" },
      { text: " ", kind: "punctuation" },
      { text: "OUT", kind: "direction" },
      { text: " ", kind: "punctuation" },
      { text: "Follows", kind: "label" },
    ],
  },
  {
    tokens: [
      { text: "WITH", kind: "keyword" },
      { text: " name", kind: "property" },
      { text: ", ", kind: "punctuation" },
      { text: "email", kind: "property" },
    ],
  },
  {
    tokens: [
      { text: "ORDER BY", kind: "keyword" },
      { text: " name ", kind: "property" },
      { text: "ASC", kind: "keyword" },
    ],
  },
  {
    tokens: [
      { text: "LIMIT", kind: "keyword" },
      { text: " ", kind: "punctuation" },
      { text: "150", kind: "number" },
      { text: "  ", kind: "punctuation" },
      { text: "EDGE LIMIT", kind: "keyword" },
      { text: " ", kind: "punctuation" },
      { text: "600", kind: "number" },
    ],
  },
];

export const SPLASH_QUERY = HELIX_SQL_PREVIEW
  .map((line) => line.tokens.map((token) => token.text).join(""))
  .join("\n");

const EXIT_DURATION_MS = 560;

export function SplashScreen({ onComplete, minDuration = 2_000 }: Props) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [exiting, setExiting] = useState(false);
  const completed = useRef(false);
  const continueButton = useRef<HTMLButtonElement>(null);

  const exit = useCallback(() => {
    if (!ready || completed.current) return;
    completed.current = true;
    setExiting(true);
    window.setTimeout(onComplete, EXIT_DURATION_MS);
  }, [onComplete, ready]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduceMotion ? 180 : Math.max(minDuration, 900);
    const lineDelay = Math.max(80, Math.floor(duration / (HELIX_SQL_PREVIEW.length + 2)));

    if (reduceMotion) setVisibleLines(HELIX_SQL_PREVIEW.length);
    let lineTimer: number | undefined;
    if (!reduceMotion) {
      lineTimer = window.setInterval(() => {
        setVisibleLines((current) => {
          if (current >= HELIX_SQL_PREVIEW.length) {
            window.clearInterval(lineTimer);
            return current;
          }
          return current + 1;
        });
      }, lineDelay);
    }

    const progressTimer = window.setInterval(() => {
      setProgress((current) => Math.min(94, current + Math.max(1, (94 - current) * 0.09)));
    }, reduceMotion ? 40 : 70);

    const readyTimer = window.setTimeout(() => {
      window.clearInterval(progressTimer);
      window.clearInterval(lineTimer);
      setVisibleLines(HELIX_SQL_PREVIEW.length);
      setProgress(100);
      setReady(true);
    }, duration);

    return () => {
      window.clearInterval(lineTimer);
      window.clearInterval(progressTimer);
      window.clearTimeout(readyTimer);
    };
  }, [minDuration]);

  useEffect(() => {
    if (!ready) return;
    continueButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") exit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exit, ready]);

  const loadingTask =
    progress < 34
      ? "Preparing HelixSQL"
      : progress < 70
        ? "Restoring workspace"
        : "Finalizing visualizer";

  return (
    <section
      className={exiting ? "splash-root splash-exit" : "splash-root"}
      aria-label="Helix Atlas welcome"
    >
      <div className="splash-bg-base" aria-hidden="true" />
      <div className="splash-bg-glow" aria-hidden="true" />
      <div className="splash-noise" aria-hidden="true" />

      <div className="splash-content">
        <header className="splash-brand splash-reveal splash-reveal-brand">
          <SplashLogo />
          <div className="splash-brand-name">
            <span>Helix</span>
            <strong>Atlas</strong>
          </div>
          <p>A clearer view of connected data.</p>
          <span className="splash-language-badge">GRAPH DATA WORKBENCH · HELIXSQL</span>
        </header>

        <div className="splash-window splash-reveal splash-reveal-window">
          <div className="splash-titlebar">
            <div className="splash-traffic-lights" aria-hidden="true">
              <span className="red" />
              <span className="yellow" />
              <span className="green" />
            </div>
            <span>GRAPH QUERY · HELIXSQL</span>
            <i aria-hidden="true" />
          </div>

          <div className="splash-editor" aria-label="Example HelixSQL graph query">
            {HELIX_SQL_PREVIEW.map((line, index) => (
              <div
                className={index < visibleLines ? "splash-code-line visible" : "splash-code-line"}
                style={{ "--line-index": index } as React.CSSProperties}
                key={index}
              >
                <span className="splash-line-number" aria-hidden="true">{index + 1}</span>
                <code>
                  {line.tokens.map((token, tokenIndex) => (
                    <span className={`splash-token-${token.kind}`} key={`${token.kind}-${tokenIndex}`}>
                      {token.text}
                    </span>
                  ))}
                </code>
              </div>
            ))}
            <span
              className={visibleLines >= HELIX_SQL_PREVIEW.length ? "splash-cursor hidden" : "splash-cursor"}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="splash-progress-region splash-reveal splash-reveal-progress">
          <Progress
            className="splash-progress-track"
            aria-label="Preparing Helix Atlas"
            value={Math.round(progress)}
          />

          {ready ? (
            <Button ref={continueButton} variant="default" className="splash-enter" onClick={exit}>
              Continue
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </Button>
          ) : (
            <div className="splash-status" role="status">
              <span aria-hidden="true" />
              {loadingTask}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SplashLogo() {
  return (
    <svg className="splash-logo" viewBox="0 0 64 64" role="img" aria-label="Helix Atlas">
      <rect x="4" y="4" width="56" height="56" rx="10" fill="var(--accent)" />
      <path d="M20 24 32 42 44 24M20 24h24" fill="none" stroke="var(--accent-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity=".65" />
      <circle cx="20" cy="24" r="5" fill="var(--accent-ink)" />
      <circle cx="44" cy="24" r="5" fill="var(--accent-ink)" />
      <circle cx="32" cy="42" r="5" fill="var(--accent-ink)" />
    </svg>
  );
}
