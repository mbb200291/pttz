import type { Article, ArticleSummary, PartialArticle } from "@pttzzz/core";
import type { BoardFilter } from "./viewState";

const boardCache = new Map<string, ArticleSummary[]>();
const filteredBoardCache = new Map<string, ArticleSummary[]>();
const articleCache = new Map<string, Article | PartialArticle>();
const boardScrollCache = new Map<string, number>();
const boardAnchorCache = new Map<string, BoardAnchorCache>();

function filteredBoardKey(boardName: string, filter: BoardFilter): string {
  if (filter.type === "search") {
    return `${boardName}:search:${filter.keywords.join("/")}`;
  }
  if (filter.type === "push") return `${boardName}:push:${filter.threshold}`;
  if (filter.type === "combined") {
    return `${boardName}:search:${filter.keywords.join("/")}:push:${filter.threshold}`;
  }
  return boardName;
}

export interface BoardAnchorCache {
  articleIndex: number;
  scrollY: number;
  viewportTop: number;
}

function articleKey(boardName: string, articleIndex: number): string {
  return `${boardName}:${articleIndex}`;
}

export function readBoardCache(boardName: string): ArticleSummary[] | null {
  return boardCache.get(boardName) ?? null;
}

export function readBoardScrollCache(boardName: string): number | null {
  return boardScrollCache.get(boardName) ?? null;
}

export function readBoardAnchorCache(boardName: string): BoardAnchorCache | null {
  return boardAnchorCache.get(boardName) ?? null;
}

export function writeBoardCache(boardName: string, articles: ArticleSummary[]): void {
  boardCache.set(boardName, articles);
}

export function writeBoardScrollCache(boardName: string, scrollY: number): void {
  boardScrollCache.set(boardName, scrollY);
}

export function writeBoardAnchorCache(
  boardName: string,
  anchor: BoardAnchorCache,
): void {
  boardAnchorCache.set(boardName, anchor);
}

export function readArticleCache(
  boardName: string,
  articleIndex: number,
): Article | PartialArticle | null {
  return articleCache.get(articleKey(boardName, articleIndex)) ?? null;
}

export function writeArticleCache(
  boardName: string,
  articleIndex: number,
  article: Article | PartialArticle,
): void {
  articleCache.set(articleKey(boardName, articleIndex), article);
}

export function readFilteredBoardCache(
  boardName: string,
  filter: BoardFilter,
): ArticleSummary[] | null {
  return filteredBoardCache.get(filteredBoardKey(boardName, filter)) ?? null;
}

export function writeFilteredBoardCache(
  boardName: string,
  filter: BoardFilter,
  articles: ArticleSummary[],
): void {
  filteredBoardCache.set(filteredBoardKey(boardName, filter), articles);
}

export function clearPttViewCache(): void {
  boardCache.clear();
  filteredBoardCache.clear();
  articleCache.clear();
  boardScrollCache.clear();
  boardAnchorCache.clear();
}
