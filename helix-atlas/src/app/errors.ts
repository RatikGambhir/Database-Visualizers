import { BackendError } from "../client";

export function describeFailure(error: unknown): {
  message: string;
  detail: string | null;
} {
  if (error instanceof BackendError) {
    return { message: error.message, detail: error.detail ?? error.hint };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    detail: null,
  };
}
export function isConnectionFailure(error: unknown): boolean {
  return (
    error instanceof BackendError &&
    ["transport", "http", "invalidUrl", "result"].includes(error.kind)
  );
}
