import { expect, it, vi } from "vitest";
import { ok, type ArticleSummary, type PttzzzClient } from "@pttzzz/core";
import { feedBody, loadFeed } from "./feed";
const now = new Date("2026-09-22T16:01:00Z"); // September 23 in Taiwan.
const article = (index: number, extra: Partial<ArticleSummary> = {}): ArticleSummary => ({key:{board:"Test",index},title:`Article ${index}`,author:"alice",publishedAt:"9/23",nativeScoreLabel:"",...extra});
function source() {
  return {
    filterArticles: vi.fn<PttzzzClient["filterArticles"]>(async () => ok({items:[]})),
    listBoards: vi.fn<PttzzzClient["listBoards"]>(async () => ok({kind:"boards",items:[{name:"Test",title:"Test"}]})),
    listArticles: vi.fn<PttzzzClient["listArticles"]>(async () => ok({items:[article(1),article(2)]})),
  };
}
const read = (client: ReturnType<typeof source>, date=now) => loadFeed(client,()=>true,undefined,{now:date});
it("omits only a matching duplicated PTT header", () => {
  const summary=article(1);
  expect(feedBody("作者  alice\n標題  Article 1\n時間  Tue Sep 08 12:00:00 2026\n\n正文",summary)).toBe("正文");
  expect(feedBody("作者  someoneElse\n標題  Article 1\n時間  今天\n正文",summary)).toContain("作者");
  expect(feedBody("  保留縮排\n作者在文章中說明",summary)).toBe("  保留縮排\n作者在文章中說明");
});
it("includes low scores but excludes old, future, unknown, pinned and deleted rows", async () => {
  const client=source();
  client.listArticles.mockResolvedValue(ok({items:[article(1),article(2,{publishedAt:"9/21",nativeScoreLabel:"X1"}),article(3,{publishedAt:"9/20"}),article(4,{publishedAt:"9/24"}),article(5,{publishedAt:undefined}),article(6,{pinned:true}),article(7,{author:"-",title:"(本文已被刪除) [alice]"}),article(8,{publishedAt:"2025-09-23"})]}));
  expect((await read(client)).items.map(a=>a.key.index)).toEqual([1,2]);
});
it.each([
  ["2027-01-01T00:00:00+08:00",["1/01","12/31","12/30","12/29"]],
  ["2024-03-01T00:00:00+08:00",["3/01","2/29","2/28","2/27"]],
])("keeps three calendar days across boundaries at %s", async (date,dates) => {
  const client=source();client.listArticles.mockResolvedValue(ok({items:dates.map((publishedAt,i)=>article(i,{publishedAt}))}));
  expect((await read(client,new Date(date))).items.map(a=>a.key.index)).toEqual([0,1,2]);
});
it("reads at most two cursor pages, deduplicates, and sorts native score bands", async () => {
  const client=source();
  client.listArticles.mockResolvedValueOnce(ok({items:[article(1,{nativeScoreLabel:"20"}),article(2,{nativeScoreLabel:"爆"})],nextCursor:"older"}))
    .mockResolvedValueOnce(ok({items:[article(1),article(3,{nativeScore:50}),article(4,{nativeScoreLabel:"XX"}),article(5)],nextCursor:"ignored"}));
  expect((await read(client)).items.map(a=>a.key.index)).toEqual([2,3,1,5,4]);
  expect(client.listArticles.mock.calls).toEqual([[{board:"Test",limit:20}],[{board:"Test",limit:20,cursor:"older"}]]);
});
it("limits unique boards to five and the sorted result to thirty", async () => {
  const client=source();
  client.listBoards.mockResolvedValue(ok({kind:"boards",items:["A","a","B","C","D","E","F"].map(name=>({name,title:name}))}));
  client.listArticles.mockImplementation(async ({board})=>ok({items:Array.from({length:20},(_,i)=>article(i,{key:{board,index:i},nativeScore:i}))}));
  const result=await read(client);
  expect(client.listArticles.mock.calls.map(([input])=>input.board)).toEqual(["A","B","C","D","E"]);
  expect(result.items).toHaveLength(30);
  expect(result.items.slice(0,5).map(a=>a.nativeScore)).toEqual([19,19,19,19,19]);
});
it("retains the first page when the second fails without treating the board as wholly failed", async () => {
  const client=source();
  client.listArticles.mockResolvedValueOnce(ok({items:[article(1)],nextCursor:"older"})).mockRejectedValueOnce(new Error("offline"));
  const result=await read(client);
  expect(result.items).toHaveLength(1);expect(result.succeeded).toBe(1);expect(result.errors).toHaveLength(1);
});
it("does not request another page after navigation invalidates the result", async () => {
  const client=source();let current=true;
  client.listArticles.mockImplementationOnce(async ()=>{current=false;return ok({items:[article(1)],nextCursor:"older"});});
  expect((await loadFeed(client,()=>current,undefined,{now})).items).toEqual([]);
  expect(client.listArticles).toHaveBeenCalledTimes(1);
});

it("continues other boards after a failed read and reports zero successes when all fail", async () => {
  const client=source();
  client.listBoards.mockResolvedValue(ok({kind:"boards",items:[{name:"A",title:"A"},{name:"B",title:"B"}]}));
  client.listArticles.mockRejectedValueOnce(new Error("offline"));
  const result=await read(client);
  expect(result.items).toHaveLength(2);expect(result.succeeded).toBe(1);expect(result.completed).toBe(2);
  client.listArticles.mockRejectedValue(new Error("offline"));
  expect(await read(client)).toMatchObject({items:[],succeeded:0,completed:2});
});

it("keeps stable source order for equal scores and only exempts preview dates", async () => {
  const client=source();
  client.listArticles.mockResolvedValue(ok({items:[article(1,{publishedAt:"9/20"}),article(2,{publishedAt:"9/20"}),article(3,{pinned:true}),article(4,{author:"-"})]}));
  expect((await read(client)).items).toEqual([]);
  expect((await loadFeed(client,()=>true,undefined,{now,preview:true})).items.map(a=>a.key.index)).toEqual([1,2]);
  expect(client.filterArticles).not.toHaveBeenCalled();
});
