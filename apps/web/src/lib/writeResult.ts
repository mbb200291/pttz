import type { CoreError } from "@pttzzz/core";

export function canRetryWrite(error: CoreError): boolean {
  return error.outcome === "not-sent" && error.retryable;
}

export function formatWriteError(error: CoreError, fallback: string): string {
  if (error.outcome === "sent") {
    return `已送出但後續確認失敗，請重新載入確認：${error.message || fallback}`;
  }
  return error.outcome === "uncertain"
    ? `可能已送出，請重新載入確認：${error.message || fallback}`
    : error.message || fallback;
}

export function writeFingerprint(operation: string, payload: unknown): string {
  return JSON.stringify([operation, payload]);
}
