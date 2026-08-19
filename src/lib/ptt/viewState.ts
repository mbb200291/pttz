import type { PttState } from "../../hooks/usePttSocket";
import type { ArticleSummary } from "./parser";
import type { ArticleData } from "../../hooks/useArticle";

export type BoardFilter =
  | { type: "search"; keywords: string[] }
  | { type: "push"; threshold: number }
  | { type: "combined"; keywords: string[]; threshold: number };

export type AppView =
  | { type: "home" }
  | { type: "board"; name: string; filter?: BoardFilter | null }
  | { type: "article"; board: string; index: number; summary?: ArticleSummary; filter?: BoardFilter | null }
  | { type: "article-by-aid"; board: string; aid: string }
  | { type: "compose"; board: string; categoryOptions?: string[] }
  | {
      type: "compose-edit";
      board: string;
      articleIndex: number;
      article: ArticleData;
      summary?: ArticleSummary;
      filter?: BoardFilter | null;
    }
  | {
      type: "compose-reply";
      board: string;
      articleIndex: number;
      articleAid?: string;
      article: ArticleData;
      summary?: ArticleSummary;
      filter?: BoardFilter | null;
    };

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
