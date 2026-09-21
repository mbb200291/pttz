import { useCallback, useEffect, useMemo, useState } from "react";
import type { CoreError, PrepareReplyDraftInput, ReplyDraftPlanner, Result } from "@pttzzz/core";

export type DraftPlannerState =
  | { status: "loading" }
  | { status: "error"; error: CoreError }
  | { status: "ready"; planner: ReplyDraftPlanner };
type Prepare = (input: PrepareReplyDraftInput) => Promise<Result<ReplyDraftPlanner>>;
const unavailable: CoreError = { code: "REPLY_PLAN_FAILED", message: "無法計算回文", retryable: true };

export function useReplyDraftPlanner(input: PrepareReplyDraftInput | null, prepare?: Prepare) {
  const key = JSON.stringify(input);
  const request = useMemo<PrepareReplyDraftInput | null>(() => JSON.parse(key), [key]);
  const [revision, setRevision] = useState(0);
  const [resolved, setResolved] = useState<{ request: typeof request; prepare: typeof prepare; revision: number; state: DraftPlannerState }>();
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!request) return;
    let active = true;
    const finish = (state: DraftPlannerState) => {
      if (active) setResolved({ request, prepare, revision, state });
    };
    if (!prepare) finish({ status: "error", error: { code: "UNSUPPORTED", message: "此連線不支援回文計數", retryable: false } });
    else void Promise.resolve().then(() => prepare(request)).then(result => finish(result.ok
      ? { status: "ready", planner: result.value }
      : { status: "error", error: result.error }), () => finish({ status: "error", error: unavailable }));
    return () => { active = false; };
  }, [request, prepare, revision]);
  // Never render a previous target's counter while its replacement effect starts.
  const state: DraftPlannerState = resolved?.request === request && resolved?.prepare === prepare && resolved?.revision === revision
    ? resolved.state : { status: "loading" };
  return { state, retry };
}
