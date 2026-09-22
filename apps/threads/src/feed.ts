import { articleKeyId, type ArticleSummary, type PttzzzClient } from "@pttzzz/core";
export interface FeedSnapshot { items: ArticleSummary[]; errors: string[]; completed: number; total: number; succeeded?: number }
/** Avoid repeating the card's metadata; never alter the core article body. */
export function feedBody(body: string, summary: ArticleSummary): string {
  const lines=body.split("\n");
  const author=lines[0]?.match(/^作者\s+(\S+)/)?.[1];
  const title=lines[1]?.match(/^標題\s+(.+)/)?.[1].trim();
  if (author===summary.author && title===summary.title && /^時間\s+\S/.test(lines[2] ?? "")) {
    return lines.slice(3).join("\n").replace(/^\n+/,"");
  }
  return body;
}
interface FeedOptions { now?: Date; preview?: boolean }
function recentDates(now: Date): Set<string> {
  const parts=new Intl.DateTimeFormat("en",{timeZone:"Asia/Taipei",year:"numeric",month:"numeric",day:"numeric"}).formatToParts(now);
  const part=(name:string)=>Number(parts.find(p=>p.type===name)!.value);
  const today=Date.UTC(part("year"),part("month")-1,part("day"));
  const dates=new Set<string>();
  for (let offset=0;offset<3;offset++) {
    const day=new Date(today-offset*86_400_000);
    dates.add(`${day.getUTCMonth()+1}/${day.getUTCDate()}`);
    dates.add(day.toISOString().slice(0,10));
  }
  return dates;
}
function isRecent(value: string | undefined, dates: Set<string>): boolean {
  const text=value?.trim() ?? "";
  const md=/^(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (md) return dates.has(`${Number(md[1])}/${Number(md[2])}`);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && dates.has(text);
}
/** Rank coarse terminal labels without presenting them as exact vote counts. */
function score(article: ArticleSummary): number {
  if (article.nativeScore !== undefined && Number.isFinite(article.nativeScore)) return article.nativeScore;
  const label=article.nativeScoreLabel?.trim() ?? "";
  if (label==="爆") return 100;
  if (label==="XX") return -100;
  if (/^X[1-9]$/.test(label)) return -10*Number(label[1]);
  if (label==="") return 0;
  return /^-?\d+$/.test(label) ? Number(label) : -Infinity;
}
export async function loadFeed(client: Pick<PttzzzClient,"listBoards" | "listArticles">, current:()=>boolean, progress:(done:number,total:number)=>void=()=>{}, options:FeedOptions={}): Promise<FeedSnapshot> {
  const result:FeedSnapshot={items:[],errors:[],completed:0,total:0,succeeded:0};
  const dates=recentDates(options.now ?? new Date());
  if (!current()) return result;
  const source=await client.listBoards({source:{kind:"hot"},limit:5});
  if (!current()) return result;
  if (!source.ok) return {...result,errors:[source.error.message]};
  if (source.value.kind!=="boards") return {...result,errors:["熱門看板來源格式不符"]};
  const seenBoards=new Set<string>();
  const boards=source.value.items.filter(board=>{
    const key=board.name.toLowerCase();
    if (seenBoards.has(key)) return false;
    seenBoards.add(key);return true;
  }).slice(0,5);
  result.total=boards.length;
  const seenArticles=new Set<string>();
  for (const board of boards) {
    if (!current()) return {...result,items:[]};
    let cursor:string | undefined;
    for (let pageIndex=0;pageIndex<2;pageIndex++) {
      const page=await client.listArticles({board:board.name,limit:20,...(cursor ? {cursor} : {})}).catch(()=>({ok:false as const,error:{message:"看板讀取失敗"}}));
      if (!current()) return {...result,items:[]};
      if (!page.ok) {result.errors.push(board.name+"："+page.error.message);break;}
      if (pageIndex===0) result.succeeded!++;
      for (const article of page.value.items) {
        const key=articleKeyId(article.key);
        if (article.pinned || article.author.trim()==="-" || seenArticles.has(key)) continue;
        if (!options.preview && !isRecent(article.publishedAt,dates)) continue;
        seenArticles.add(key);result.items.push(article);
      }
      const next=page.value.nextCursor;
      if (!next || next===cursor) break;
      cursor=next;
    }
    progress(++result.completed,result.total);
  }
  result.items.sort((a,b)=>score(b)-score(a));
  result.items=result.items.slice(0,30);
  return result;
}
