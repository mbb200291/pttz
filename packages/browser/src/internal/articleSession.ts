import type { ArticleKey } from "@pttzzz/core";

interface ArticleSessionEvidence {
  key: ArticleKey;
  board: string;
  author: string;
  title: string;
  snapshot: string;
}

interface NormalizedArticleSession {
  key: ArticleKey;
  board: string;
  author: string;
  title: string;
  snapshot: string;
}

export type ArticleSessionDiagnostic = Readonly<{
  state: "unknown" | "article";
  reason: string;
}>;

function normalizeCaseInsensitive(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function normalizeAid(value: string): string {
  return normalizeCaseInsensitive(value).replace(/^#/u, "");
}

function normalizeKey(key: ArticleKey): ArticleKey {
  const board = normalizeCaseInsensitive(key.board);
  return typeof key.index === "number"
    ? { board, index: key.index }
    : { board, aid: normalizeAid(key.aid) };
}

function normalizeEvidence(evidence: ArticleSessionEvidence): NormalizedArticleSession {
  return {
    key: normalizeKey(evidence.key),
    board: normalizeCaseInsensitive(evidence.board),
    author: normalizeCaseInsensitive(evidence.author),
    title: normalizeTitle(evidence.title),
    snapshot: evidence.snapshot,
  };
}

function keysMatch(left: ArticleKey, right: ArticleKey): boolean {
  if (left.board !== right.board) return false;
  if (typeof left.index === "number") {
    return typeof right.index === "number" && left.index === right.index;
  }
  return typeof right.aid === "string" && left.aid === right.aid;
}

export class ArticleSessionTracker {
  private session?: NormalizedArticleSession;
  private currentDiagnostic: ArticleSessionDiagnostic = {
    state: "unknown",
    reason: "not-recorded",
  };

  get diagnostic(): ArticleSessionDiagnostic {
    return this.currentDiagnostic;
  }

  record(evidence: ArticleSessionEvidence): void {
    this.session = normalizeEvidence(evidence);
    this.currentDiagnostic = { state: "article", reason: "recorded" };
  }

  match(evidence: ArticleSessionEvidence): boolean {
    if (!this.session) return false;

    const candidate = normalizeEvidence(evidence);
    const matches = keysMatch(this.session.key, candidate.key)
      && this.session.board === candidate.board
      && this.session.author === candidate.author
      && this.session.title === candidate.title
      && this.session.snapshot === candidate.snapshot;

    if (!matches) {
      this.invalidate("mismatch");
      return false;
    }

    this.currentDiagnostic = { state: "article", reason: "matched" };
    return true;
  }

  invalidate(reason: string): void {
    this.session = undefined;
    this.currentDiagnostic = { state: "unknown", reason };
  }
}
