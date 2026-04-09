import type { PttState } from "../../hooks/usePttSocket";

export type AppView =
  | { type: "home" }
  | { type: "board"; name: string }
  | { type: "article"; board: string; index: number };

export function getSafeViewForPttState(view: AppView, pttState: PttState): AppView {
  if (pttState === "ready" || view.type === "home") {
    return view;
  }

  if (
    pttState === "need_login" ||
    pttState === "logging_in" ||
    pttState === "waiting_auth" ||
    pttState === "duplicate_login" ||
    pttState === "guest_overload" ||
    pttState === "closed" ||
    pttState === "error"
  ) {
    return { type: "home" };
  }

  return view;
}
