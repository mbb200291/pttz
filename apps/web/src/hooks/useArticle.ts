import { useCallback, useEffect, useRef, useState } from "react";
import {
  articleKeyId,
  type Article,
  type ArticleKey,
  type CoreEvent,
  type PartialArticle,
  type Reply,
  type VoteSummary,
} from "@pttzzz/core";
import { usePttSocketStore } from "./usePttSocket";
import { projectThreadForDisplay, type AggregatedPush } from "../lib/ptt/uiTypes";
import type {
  ArticleEditRecord,
  ArticleRevision,
} from "../lib/ptt/uiArticle";
import { readArticleCache, writeArticleCache } from "../lib/ptt/viewCache";

export interface ArticleData {
  title: string;
  author: string;
  date: string;
  board: string;
  body: string;
  pushes: AggregatedPush[];
  articleNotes: ArticleEditRecord[];
  revisions?: ArticleRevision[];
  score: number;
  nativePushCount?: number;
  nativeBooCount?: number;
  nativeNeutralCount?: number;
  nativeVotes?: VoteSummary;
  articleVotes?: VoteSummary;
  articlePushVoters?: string[];
  articleBooVoters?: string[];
  debug?: unknown;
}

export interface PartialArticleData {
  title: string;
  author: string;
  date: string;
  board: string;
  body: string;
  pushes?: AggregatedPush[];
  articleNotes?: ArticleEditRecord[];
  revisions?: ArticleRevision[];
  score?: number;
}

export interface UseArticleReturn {
  article: ArticleData | null;
  partialArticle: PartialArticleData | null;
  cachedArticle: PartialArticleData | null;
  loading: boolean;
  reloading: boolean;
  error: string | null;
  reload: () => Promise<boolean>;
}

type LoadMode = "initial" | "reload";

function cacheableArticle(article: Article): Article {
  if (import.meta.env.DEV || article.metadata?.raw === undefined) return article;
  const { metadata: _rawMetadata, ...withoutRaw } = article;
  return withoutRaw;
}

function replyPush(reply: Reply, order: number): AggregatedPush {
  return {
    id: reply.replyId,
    type: reply.pushType,
    author: reply.author,
    content: reply.content,
    ipAddresses: [],
    time: reply.createdAt ?? "",
    isOP: reply.isOp,
    replyTo: reply.replyTo ?? null,
    structuralDepth: reply.depth,
    score: reply.score,
    floorNumber: 0,
    anchorOrder: order,
    sourceFloors: [],
    votes: reply.votes,
    pushVoters: [],
    booVoters: [],
    editHistory: reply.edits.map((edit, index) => ({
      kind: edit.kind,
      content: edit.content,
      time: edit.createdAt ?? "",
      commandOrder: index,
      resultContent: edit.resultContent,
    })),
  };
}

function flattenReplies(replies: readonly Reply[]): AggregatedPush[] {
  const result: AggregatedPush[] = [];
  const visit = (items: readonly Reply[]) => {
    for (const reply of items) {
      if (!reply.visible) continue;
      result.push(replyPush(reply, result.length));
      visit(reply.children);
    }
  };
  visit(replies);
  return projectThreadForDisplay(result);
}

function partialView(article: PartialArticle | Article): PartialArticleData {
  return {
    title: article.title ?? "",
    author: article.author ?? "",
    date: article.completeness === "final" ? article.publishedAt ?? "" : "",
    board: article.key.board,
    body: article.body ?? "",
    pushes: flattenReplies(article.replies),
    articleNotes: (article.articleEdits ?? []).map((edit) => ({
      marker: edit.marker,
      content: edit.content,
      rawBlock: "",
      markerOffset: edit.sequence,
    })),
    revisions: (article.revisions ?? []).map((revision) => ({
      summary: revision.summary,
      rawBlock: "",
      markerOffset: revision.sequence,
    })),
    score: article.completeness === "final" ? article.articleVotes?.score ?? 0 : 0,
  };
}

function articleView(article: Article): ArticleData {
  const projected = partialView(article);
  return {
    ...projected,
    title: article.title,
    author: article.author,
    body: article.body,
    pushes: projected.pushes ?? [],
    articleNotes: projected.articleNotes ?? [],
    revisions: projected.revisions ?? [],
    score: article.articleVotes.score,
    nativePushCount: article.nativePushCount,
    nativeBooCount: article.nativeBooCount,
    nativeNeutralCount: article.nativeNeutralCount,
    nativeVotes: article.nativeVotes,
    articleVotes: article.articleVotes,
    articlePushVoters: [],
    articleBooVoters: [],
    ...(!import.meta.env.DEV || article.metadata?.raw === undefined
      ? {}
      : { debug: article.metadata.raw }),
  };
}

export function useArticle(
  boardName: string,
  articleIndex: number,
  articleAid?: string,
  _expectedSummary?: unknown,
): UseArticleReturn {
  const client = usePttSocketStore((state) => state.client);
  const pttState = usePttSocketStore((state) => state.pttState);
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [partialArticle, setPartialArticle] = useState<PartialArticleData | null>(null);
  const [cachedArticle, setCachedArticle] = useState<PartialArticleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);

  const keyId = articleKeyId(articleAid
    ? { board: boardName, aid: articleAid }
    : { board: boardName, index: articleIndex });

  const loadArticle = useCallback(async (mode: LoadMode) => {
    if (!client) return false;
    const key: ArticleKey = articleAid
      ? { board: boardName, aid: articleAid }
      : { board: boardName, index: articleIndex };
    const currentGeneration = ++generation.current;
    const current = () => mounted.current && generation.current === currentGeneration;
    let latestRevision = 0;
    let showingCachedFinal = false;
    let acceptedFinal = false;

    if (mode === "initial") {
      setPartialArticle(null);
      const cached = articleAid ? null : readArticleCache(boardName, articleIndex);
      setCachedArticle(cached ? partialView(cached) : null);
      if (cached?.completeness === "final") {
        showingCachedFinal = true;
        setArticle(articleView(cached));
        setCachedArticle(null);
        setReloading(true);
      } else {
        setArticle(null);
        setLoading(true);
      }
    } else {
      setReloading(true);
    }
    setError(null);

    const unsubscribe = client.subscribe((event: CoreEvent) => {
      if (!current() || !(event.type === "article.partial" || event.type === "article.updated")) return;
      if (articleKeyId(event.articleKey) !== keyId || event.revision <= latestRevision) return;
      latestRevision = event.revision;
      if (event.type === "article.partial") {
        if (!showingCachedFinal) setPartialArticle(partialView(event.article));
      } else {
        acceptedFinal = true;
        setArticle(articleView(event.article));
        setPartialArticle(null);
        setCachedArticle(null);
        if (!articleAid) writeArticleCache(boardName, articleIndex, cacheableArticle(event.article));
      }
    });

    try {
      const result = await client.getArticle({
        article: key,
        includeDebugMetadata: import.meta.env.DEV,
      });
      if (!current()) return false;
      if (!result.ok) {
        setError(result.error.message || "無法載入文章");
        return acceptedFinal;
      }
      if (result.value.revision < latestRevision) return acceptedFinal;
      latestRevision = result.value.revision;
      acceptedFinal = true;
      setArticle(articleView(result.value));
      setPartialArticle(null);
      setCachedArticle(null);
      if (!articleAid) writeArticleCache(boardName, articleIndex, cacheableArticle(result.value));
      return true;
    } finally {
      unsubscribe();
      if (current()) {
        setLoading(false);
        setReloading(false);
      }
    }
  }, [articleAid, articleIndex, boardName, client, keyId]);

  const reload = useCallback(async () => {
    if (pttState !== "ready" || !client || !boardName || (!articleAid && articleIndex <= 0)) return false;
    return await loadArticle("reload");
  }, [articleAid, articleIndex, boardName, client, loadArticle, pttState]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  useEffect(() => {
    if (pttState !== "ready" || !client || !boardName || (!articleAid && articleIndex <= 0)) return;
    void loadArticle("initial");
  }, [articleAid, articleIndex, boardName, client, loadArticle, pttState]);

  return { article, partialArticle, cachedArticle, loading, reloading, error, reload };
}
