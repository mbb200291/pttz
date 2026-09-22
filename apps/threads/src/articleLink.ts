import type { ArticleKey } from '@pttzzz/core';

export function articleLink(key: ArticleKey, locationHref: string, preview: boolean): string | undefined {
  if (key.aid === undefined) return undefined;
  const aid = key.aid.replace(/^#/, '');
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(aid)) return undefined;
  const url = new URL(locationHref);
  url.search = '';
  url.hash = '';
  url.searchParams.set('board', key.board);
  url.searchParams.set('aid', aid);
  if (!parseArticleLink(url.href)) return undefined;
  if (preview) url.searchParams.set('preview', '1');
  return url.href;
}

export function parseArticleLink(href: string): ArticleKey | undefined {
  let params: URLSearchParams;
  try {
    params = new URL(href).searchParams;
  } catch {
    return undefined;
  }
  if (params.getAll('board').length !== 1) return undefined;
  const board = params.get('board')!;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(board)) return undefined;

  const aids = params.getAll('aid');
  const indices = params.getAll('index');
  if (aids.length === 1 && indices.length === 0) {
    const aid = aids[0].replace(/^#/, '');
    return /^[A-Za-z0-9_-]{1,32}$/.test(aid) ? { board, aid } : undefined;
  }
  if (indices.length === 1 && aids.length === 0 && /^[1-9][0-9]*$/.test(indices[0])) {
    const index = Number(indices[0]);
    if (Number.isSafeInteger(index)) return { board, index };
  }
  return undefined;
}
