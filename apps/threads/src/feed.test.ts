import { describe, expect, it, vi } from "vitest";
import { ok, type ArticleSummary } from "@pttzzz/core";
import { feedBody, loadFeed } from "./feed";
const article = (board: string, index: number, pinned = false): ArticleSummary => ({key:{board,index},title:board+index,author:"alice",pinned,nativeScoreLabel:"爆"});
const boards = ["A","B","C","D","E","F"];
it("omits only a matching duplicated PTT header from the inline excerpt", () => {
  const summary=article("Test",1);
  expect(feedBody("作者  alice\n標題  Test1\n時間  Tue Sep 08 12:00:00 2026\n\n這是正文",summary)).toBe("這是正文");
  expect(feedBody("作者  someoneElse\n標題  Test1\n時間  今天\n\n這是正文",summary)).toContain("作者");
  expect(feedBody("  保留縮排\n作者在文章中說明",summary)).toBe("  保留縮排\n作者在文章中說明");
});
function source() {
  return {
    listBoards: vi.fn(async () => ok({kind:"boards" as const,items:boards.map(name=>({name,title:name}))})),
    filterArticles: vi.fn(async ({board}: {board:string}) => ok({items:[article(board,1),article(board,2)]})),
  };
}
describe("hot-board selection feed", () => {
  it("reads at most five boards with explicit threshold and interleaves source order", async () => {
    const client=source();
    const result=await loadFeed(client,()=>true);
    expect(client.listBoards).toHaveBeenCalledWith({source:{kind:"hot"},limit:5});
    expect(client.filterArticles).toHaveBeenCalledTimes(5);
    expect(client.filterArticles).toHaveBeenNthCalledWith(1,{board:"A",minimumNativeScore:20,limit:6});
    expect(result.items.map(a=>a.title)).toEqual(["A1","B1","C1","D1","E1","A2","B2","C2","D2","E2"]);
  });
  it("stops submitting work when navigation invalidates the generation", async () => {
    const client=source();let current=true;
    client.filterArticles.mockImplementationOnce(async ({board})=>{current=false;return ok({items:[article(board,1)]});});
    const result=await loadFeed(client,()=>current);
    expect(client.filterArticles).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([]);
  });
  it("retains other boards after a failure, and excludes pinned and duplicate rows", async () => {
    const client=source();
    const filterArticles=vi.fn(async ({board}:{board:string})=>board==="B"
      ? {ok:false as const,error:{code:"READ_FAILED",message:"看板讀取失敗",retryable:false}}
      : ok({items:[article(board,0,true),article(board,1),article(board,1)]}));
    const result=await loadFeed({...client,filterArticles},()=>true);
    expect(result.errors).toEqual(["B：看板讀取失敗"]);
    expect(result.items.map(a=>a.title)).toEqual(["A1","C1","D1","E1"]);
  });
  it("retains successful batches when a later board throws", async () => {
    const client=source();
    client.filterArticles.mockImplementation(async ({board})=>{
      if (board === "B") throw new Error("offline");
      return ok({items:[article(board,1)]});
    });
    const result=await loadFeed(client,()=>true);
    expect(result.items.map(a=>a.title)).toEqual(["A1","C1","D1","E1"]);
    expect(result.completed).toBe(5);
    expect(result.errors).toEqual(["B：看板讀取失敗"]);
  });
});
