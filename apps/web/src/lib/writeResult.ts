import type { CoreError } from "@pttzzz/core";

export function canRetryWrite(error: CoreError): boolean {
  return error.outcome === "not-sent" && error.retryable;
}

export function formatWriteError(error: CoreError, fallback: string): string {
  if (error.outcome === "sent" || error.outcome === "uncertain") {
    return "尚未同步";
  }
  return error.message || fallback;
}

export function writeFingerprint(operation: string, payload: unknown): string {
  return JSON.stringify([operation, payload]);
}
