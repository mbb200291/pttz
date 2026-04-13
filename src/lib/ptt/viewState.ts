import type { PttState } from "../../hooks/usePttSocket";
import type { ArticleSummary } from "./parser";

export type BoardFilter =
  | { type: "search"; keyword: string }
  | { type: "push"; threshold: number };

export type AppView =
  | { type: "home" }
  | { type: "board"; name: string; filter?: BoardFilter | null }
  | { type: "article"; board: string; index: number; summary?: ArticleSummary; filter?: BoardFilter | null }
  | { type: "article-by-aid"; board: string; aid: string };

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

  // article-by-aid view also safe when ready
  if (view.type === "article-by-aid") return view;

  return view;
}
