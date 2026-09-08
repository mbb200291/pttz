import { articleKeyId, type ArticleSummary, type PttzzzClient } from "@pttzzz/core";
export interface FeedSnapshot { items: ArticleSummary[]; errors: string[]; completed: number; total: number }
export async function loadFeed(client: Pick<PttzzzClient, "listBoards" | "filterArticles">, current: () => boolean, progress: (done: number, total: number) => void = () => {}, minimumNativeScore = 20): Promise<FeedSnapshot> {
  const result: FeedSnapshot = {items:[],errors:[],completed:0,total:0};
  if (!current()) return result;
  const source = await client.listBoards({source:{kind:"hot"},limit:5});
  if (!current()) return result;
  if (!source.ok) return {...result, errors:[source.error.message]};
  if (source.value.kind !== "boards") return {...result, errors:["熱門看板來源格式不符"]};
  const seenBoards = new Set<string>();
  const boards = source.value.items.filter(board => {
    const key = board.name.toLowerCase();
    if (seenBoards.has(key)) return false;
    seenBoards.add(key);
    return true;
  }).slice(0,5);
  result.total = boards.length;
  const batches: ArticleSummary[][] = [];
  const seenArticles = new Set<string>();
  for (const board of boards) {
    if (!current()) return {...result, items:[]};
    const page = await client.filterArticles({board:board.name,minimumNativeScore,limit:6});
    if (!current()) return {...result, items:[]};
    if (!page.ok) result.errors.push(board.name + "：" + page.error.message);
    else batches.push(page.value.items.filter(article => {
      const key = articleKeyId(article.key);
      if (article.pinned || seenArticles.has(key)) return false;
      seenArticles.add(key);
      return true;
    }).slice(0,6));
    progress(++result.completed, result.total);
  }
  for (let row=0;row<6;row++) {
    for (const batch of batches) if (batch[row]) result.items.push(batch[row]);
  }
  return result;
}
