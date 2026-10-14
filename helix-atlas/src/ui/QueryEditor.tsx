import { Play, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import type { BackendError, CompiledQuery } from "../client";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  running: boolean;
  available: boolean;
  /** Parse/compile failure for the current text, if any. */
  error: BackendError | null;
  compiled?: CompiledQuery | null;
}

/**
 * A textarea with a gutter and an inline error marker.
 *
 * Deliberately not a full code editor: the language is small, and a plain
 * textarea keeps selection, undo and IME behaviour native.
 */
export function QueryEditor({
  value,
  onChange,
  onRun,
  running,
  available,
  error,
  compiled,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineCount = useMemo(
    () => Math.max(value.split("\n").length, 1),
    [value],
  );
  const canRun = available && !running && error === null && (!compiled?.mutation || compiled.mutation.executable);

  useEffect(() => {
    if (window.matchMedia("(min-width: 761px)").matches)
      textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd+Enter runs; a bare Enter stays a newline so queries can be typed
    // across several lines the way SQL usually is.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (canRun) onRun();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const target = event.currentTarget;
      const { selectionStart, selectionEnd } = target;
      const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
      onChange(next);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = selectionStart + 2;
      });
    }
  };

  /** Moves the caret to the offending token so the fix is one keystroke away. */
  const jumpToError = () => {
    const textarea = textareaRef.current;
    if (!textarea || !error?.span) return;
    textarea.focus();
    textarea.setSelectionRange(
      utf16Offset(value, error.span.start),
      utf16Offset(value, Math.max(error.span.end, error.span.start + 1)),
    );
  };

  return (
    <section className="query-editor">
      <header>
        <div className="editor-heading">
          <span className="eyebrow">WORKSPACE / HELIXSQL</span>
          <h2>Query editor</h2>
        </div>
        <div className="editor-actions">
          <span className="run-shortcut">
            <Kbd>{navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>↵</Kbd>
          </span>
          <Button
            variant="default"
            className="primary"
            onClick={onRun}
            disabled={!canRun}
            title={compiled?.mutation?.blockedReason || (
              available
                ? "Run the current query"
                : error ? "Resolve the error before running" : "Run queries in the Tauri desktop app")
            }
          >
            {running ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {running ? "Running…" : compiled?.executionKind === "write" ? "Run mutation" : "Run query"}
          </Button>
        </div>
      </header>

      <div className="editor-body">
        <div className="gutter" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, index) => (
            <span
              key={index}
              className={
                error?.span?.line === index + 1 ? "gutter-error" : undefined
              }
            >
              {index + 1}
            </span>
          ))}
        </div>
        <Textarea
          ref={textareaRef}
          value={value}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="HelixSQL query"
          aria-invalid={error !== null}
        />
      </div>

      <div className="editor-footnote"><span>HelixSQL</span><span>{lineCount} {lineCount === 1 ? "line" : "lines"} · {compiled?.mutation ? "Mutation" : "Read only"}</span></div>
      {compiled?.mutation && <p className="mutation-preview" role="status"><span>{compiled.summary}. {compiled.mutation.blockedReason || "Requires the Atlas mutation server extension, checked before submission"}.</span></p>}
      {error && (
        <p className="editor-error" role="alert">
          <Button variant="link" onClick={jumpToError}>
            {error.span
              ? `line ${error.span.line}:${error.span.column}`
              : "error"}
          </Button>
          <span>{error.message}</span>
          {error.hint && <em>{error.hint}</em>}
        </p>
      )}
    </section>
  );
}

/** Rust spans use UTF-8 bytes; textarea selections use UTF-16 code units. */
function utf16Offset(source: string, byteOffset: number): number {
  let bytes = 0;
  let units = 0;
  for (const character of source) {
    if (bytes >= byteOffset) break;
    const cp = character.codePointAt(0)!;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    units += character.length;
  }
  return units;
}
