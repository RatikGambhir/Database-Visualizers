import { useCallback, useEffect, useRef, useState } from "react";
import { BackendError, compileQuery, type CompiledQuery, type Parameters } from "../client";

/** Live Rust validation with a debounce and cleanup for stale editor requests. */
export function useQueryCompilation(
  desktop: boolean,
  query: string,
  connectionRevision: number | undefined,
  parameters?: Parameters,
  parameterError: BackendError | null = null,
) {
  const [compileState, setCompileState] = useState<{
    source: string;
    parameters?: Parameters;
    compiled: CompiledQuery | null;
    error: BackendError | null;
  }>({ source: "", compiled: null, error: null });

  const generation = useRef(0);

  // Rust is the source of truth even for live editor validation. A short
  // debounce avoids crossing IPC for every key event in a fast typing burst.
  useEffect(() => {
    const requestGeneration = ++generation.current;
    const source = query;
    if (parameterError) {
      setCompileState({ source, parameters, compiled: null, error: parameterError });
      return;
    }
    if (!source.trim() || !desktop) {
      setCompileState({ source, parameters, compiled: null, error: null });
      return;
    }
    setCompileState({ source, parameters, compiled: null, error: null });
    let current = true;
    const timer = window.setTimeout(() => {
      if (requestGeneration !== generation.current) return;
      void compileQuery(source, parameters)
        .then((compiled) => {
          if (current && requestGeneration === generation.current) setCompileState({ source, parameters, compiled, error: null });
        })
        .catch((error: unknown) => {
          if (!current || requestGeneration !== generation.current) return;
          const failure =
            error instanceof BackendError
              ? error
              : new BackendError(String(error));
          setCompileState({ source, parameters, compiled: null, error: failure });
        });
    }, 120);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [desktop, query, connectionRevision, parameters, parameterError]);
  const resetCompilation = useCallback(() => {
    generation.current += 1;
    setCompileState({ source: "", compiled: null, error: null });
  }, []);
  return { compileState, resetCompilation };
}
