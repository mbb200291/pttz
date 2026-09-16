/* @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import { ok, type Article, type CoreEvent, type PttzzzClient, type Result } from "@pttzzz/core";
import { mountApp } from "./app";

let dispose: (() => void) | undefined;
let intersect: IntersectionObserverCallback;
beforeEach(() => {
  vi.spyOn(window,"scrollTo").mockImplementation(()=>{});
  vi.stubGlobal("IntersectionObserver",class {
    constructor(callback: IntersectionObserverCallback) { intersect=callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { window.history.replaceState(null,"","/"); dispose?.(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function setup(count = 1) {
  const listeners=new Set<(event: CoreEvent) => void>();
  const resolvers=new Map<number,(value: Result<Article>) => void>();
  const client = {
    connect: vi.fn(async () => ok(undefined)),
    login: vi.fn(async () => ok({userId:"reader"})),
    disconnect: vi.fn(async () => {}),
    subscribe: vi.fn((listener: (event: CoreEvent) => void) => { listeners.add(listener); return () => {listeners.delete(listener);}; }),
    listBoards: vi.fn<PttzzzClient["listBoards"]>(async () => ok({kind:"boards" as const,items:[{name:"Test",title:"Test"}]})),
    filterArticles: vi.fn<PttzzzClient["filterArticles"]>(async () => ok({items:Array.from({length:count},(_,index)=>({key:{board:"Test",index:index+1},title:index?"Second article":"A <script>title</script>",author:"alice"}))})),
    getArticle: vi.fn(({article}:{article:{index?:number}}) => new Promise<Result<Article>>(r => { resolvers.set(article.index!,r); })),
  };
  const root = document.createElement("div"); document.body.append(root);
  dispose=mountApp(root,client as unknown as PttzzzClient,true);
  return {client,fail:(index=1)=>resolvers.get(index)!(failure),emit:(event:CoreEvent)=>listeners.forEach(listener=>listener(event)),finish:(index=1)=>resolvers.get(index)!(ok({
    key:{board:"Test",index},title:"Late article",author:"alice",body:"Secret body",
    completeness:"final",revision:3,replies:[],articleEdits:[],revisions:[],
    nativePushCount:0,nativeBooCount:0,nativeNeutralCount:0,
    nativeVotes:{pushCount:0,booCount:0,score:0},articleVotes:{pushCount:0,booCount:0,score:0},
  }))};
}
const failure = {ok:false as const,error:{code:"READ_FAILED",message:"測試讀取失敗",retryable:true}};

it("queues retries behind visible reads and publishes deduplicated queued/loading states immediately", async () => {
  const test=setup(3);
  await screen.findByRole("button",{name:/A <script>title/});
  const cards=Array.from(document.querySelectorAll(".feed-item"));
  intersect(cards.map(target=>({target,isIntersecting:true})) as IntersectionObserverEntry[],{} as IntersectionObserver);
  test.fail(1);
  const retry=await screen.findByRole("button",{name:"重試內文"});
  await waitFor(()=>expect(test.client.getArticle).toHaveBeenCalledTimes(2));
  fireEvent.click(retry); fireEvent.click(retry);
  expect(test.client.getArticle).toHaveBeenCalledTimes(2);
  expect(cards[0].querySelector(".excerpt-status")?.textContent).toBe("內文排隊中…");
  expect(screen.queryByRole("button",{name:"重試內文"})).toBeNull();
  fireEvent.click(cards[0].querySelector("button")!);
  test.finish(2);
  await waitFor(()=>expect(test.client.getArticle).toHaveBeenCalledTimes(3));
  expect(test.client.getArticle.mock.calls.map(([input])=>input.article.index)).toEqual([1,2,3]);
  test.finish(3);
  await waitFor(()=>expect(test.client.getArticle).toHaveBeenCalledTimes(4));
  expect(cards[0].querySelector(".excerpt-status")?.textContent).toBe("內文讀取中…");
  test.finish(1);
  await waitFor(()=>expect(cards[0].querySelector(".feed-body")?.textContent).toBe("Secret body"));
  expect(test.client.getArticle).toHaveBeenCalledTimes(4);
});

it.each(["source-result","source-throw","all-boards"])("preserves readable bodies and expanded discussion after %s refresh failure", async kind => {
  const test=setup();
  fireEvent.click(await screen.findByRole("button",{name:/A <script>title/}));
  test.finish();
  await screen.findByText("Secret body");
  if(kind==="source-result") test.client.listBoards.mockResolvedValueOnce(failure);
  else if(kind==="source-throw") test.client.listBoards.mockRejectedValueOnce(new Error("offline"));
  else test.client.filterArticles.mockResolvedValueOnce(failure);
  fireEvent.click(screen.getByRole("button",{name:"重新整理"}));
  await screen.findByText(/已保留/);
  expect(screen.getByText("Secret body")).toBeTruthy();
  expect(screen.getByRole("button",{name:/A <script>title/}).getAttribute("aria-expanded")).toBe("true");
  expect(test.client.getArticle).toHaveBeenCalledTimes(1);
});

it("replaces old content for a successful empty refresh", async () => {
  const test=setup();
  fireEvent.click(await screen.findByRole("button",{name:/A <script>title/}));
  test.finish(); await screen.findByText("Secret body");
  test.client.filterArticles.mockResolvedValueOnce(ok({items:[]}));
  fireEvent.click(screen.getByRole("button",{name:"重新整理"}));
  await screen.findByText(/這次沒有取得符合條件/);
  expect(screen.queryByText("Secret body")).toBeNull();
  expect(screen.queryByText(/已保留/)).toBeNull();
});

it("waits for the active body before refreshing and restores a failed partial without starting old queued work", async () => {
  const test=setup(2);
  const title=await screen.findByRole("button",{name:/A <script>title/});
  fireEvent.click(title);
  intersect(Array.from(document.querySelectorAll(".feed-item")).map(target=>({target,isIntersecting:true})) as IntersectionObserverEntry[],{} as IntersectionObserver);
  test.emit({type:"article.partial",articleKey:{board:"Test",index:1},revision:1,
    article:{key:{board:"Test",index:1},revision:1,completeness:"incomplete",body:"Readable partial",replies:[]}});
  test.client.listBoards.mockResolvedValueOnce(failure);
  fireEvent.click(screen.getByRole("button",{name:"重新整理"}));
  expect(test.client.listBoards).toHaveBeenCalledTimes(1);
  test.fail();
  await screen.findByText(/已保留/);
  expect(screen.getByText("Readable partial")).toBeTruthy();
  expect(test.client.getArticle).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button",{name:"重試內文"}));
  expect(test.client.getArticle).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Readable partial")).toBeTruthy();
  expect(screen.getByText("正在讀取其餘內容…")).toBeTruthy();
  test.finish();
});

it("accepts a partially successful refreshed feed and reports the failed board", async () => {
  const test=setup();
  await screen.findByRole("button",{name:/A <script>title/});
  test.client.listBoards.mockResolvedValueOnce(ok({kind:"boards",items:[{name:"New",title:"New"},{name:"Failed",title:"Failed"}]}));
  test.client.filterArticles.mockResolvedValueOnce(ok({items:[{key:{board:"New",index:1},title:"Fresh article",author:"new"}]})).mockResolvedValueOnce(failure);
  fireEvent.click(screen.getByRole("button",{name:"重新整理"}));
  await screen.findByRole("button",{name:"Fresh article"});
  expect(screen.queryByRole("button",{name:/A <script>title/})).toBeNull();
  expect(screen.getByText("Failed：測試讀取失敗")).toBeTruthy();
});

it("drops a queued retry on disconnect", async () => {
  const test=setup(2);
  await screen.findByRole("button",{name:/A <script>title/});
  intersect(Array.from(document.querySelectorAll(".feed-item")).map(target=>({target,isIntersecting:true})) as IntersectionObserverEntry[],{} as IntersectionObserver);
  test.fail();
  fireEvent.click(await screen.findByRole("button",{name:"重試內文"}));
  test.emit({type:"connection.changed",status:"disconnected"});
  test.finish(2);
  await screen.findByRole("button",{name:"重新登入"});
  expect(test.client.getArticle).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("Secret body")).toBeNull();
});
it("uses safe text and returning stays on the feed when the shared article finishes", async () => {
  const test=setup();
  const item=await screen.findByRole("button",{name:/A <script>title/});
  expect(document.querySelector("script")).toBeNull();
  fireEvent.click(item);
  fireEvent.click(item);
  test.finish();
  await waitFor(()=>expect(document.querySelector(".feed-body")?.textContent).toBe("Secret body"));
  expect(screen.queryByRole("button",{name:"返回串流"})).toBeNull();
  expect(screen.getByRole("button",{name:/A <script>title/})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"發文"})).toBeNull();
});
it("serializes visible previews and reuses a completed body for discussion", async () => {
  const test=setup(2);
  const title=await screen.findByRole("button",{name:/A <script>title/});
  const cards=Array.from(document.querySelectorAll(".feed-item"));
  intersect(cards.map(target=>({target,isIntersecting:true})) as IntersectionObserverEntry[],{} as IntersectionObserver);
  expect(test.client.getArticle).toHaveBeenCalledTimes(1);
  test.finish(1);
  await waitFor(()=>expect(test.client.getArticle).toHaveBeenCalledTimes(2));
  fireEvent.click(title);
  expect(screen.getByText("Secret body")).toBeTruthy();
  expect(test.client.getArticle).toHaveBeenCalledTimes(2);
  test.finish(2);
});
it("stops queued previews and clears cached bodies when disconnected", async () => {
  const test=setup(2);
  await screen.findByRole("button",{name:/A <script>title/});
  intersect(Array.from(document.querySelectorAll(".feed-item")).map(target=>({target,isIntersecting:true})) as IntersectionObserverEntry[],{} as IntersectionObserver);
  test.emit({type:"connection.changed",status:"disconnected"});
  test.finish();
  await waitFor(()=>expect(screen.getByRole("button",{name:"重新登入"})).toBeTruthy());
  expect(test.client.getArticle).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Secret body")).toBeNull();
});
it("retries a failed excerpt explicitly and hides expansion for short bodies", async () => {
  const test=setup();
  await screen.findByRole("button",{name:/A <script>title/});
  test.client.getArticle.mockRejectedValueOnce(new Error("read failed"));
  intersect([{target:document.querySelector(".feed-item")!,isIntersecting:true}] as IntersectionObserverEntry[],{} as IntersectionObserver);
  await screen.findByText("內文讀取失敗");
  fireEvent.click(screen.getByRole("button",{name:"重試內文"}));
  expect(test.client.getArticle).toHaveBeenCalledTimes(2);
  test.finish();
  await waitFor(()=>expect(document.querySelector(".feed-body")?.textContent).toBe("Secret body"));
  expect(screen.queryByRole("button",{name:"展開全文"})).toBeNull();
  expect(screen.queryByRole("button",{name:"重試內文"})).toBeNull();
});
it("loads a visible excerpt before opening and expands inline without another read", async () => {
  const test=setup();
  await screen.findByRole("button",{name:/A <script>title/});
  expect(test.client.getArticle).not.toHaveBeenCalled();
  const card=document.querySelector(".feed-item")!;
  intersect([{target:card,isIntersecting:true}] as IntersectionObserverEntry[],{} as IntersectionObserver);
  expect(test.client.getArticle).toHaveBeenCalledTimes(1);
  test.emit({
    type:"article.partial",articleKey:{board:"Test",index:1},revision:1,
    article:{key:{board:"Test",index:1},revision:1,completeness:"incomplete",body:"第一段\n第二段\n第三段\n第四段\n第五段\n第六段",replies:[]},
  });
  const excerpt=card.querySelector<HTMLElement>(".feed-body")!;
  expect(excerpt.textContent).toContain("第一段");
  const toggle=screen.getByRole("button",{name:/A <script>title/});
  fireEvent.click(card);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(screen.queryByRole("button",{name:"返回串流"})).toBeNull();
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(test.client.getArticle).toHaveBeenCalledTimes(1);
  test.finish();
});
it("clears the feed and pending reads on disconnect", async () => {
  const test=setup();
  fireEvent.click(await screen.findByRole("button",{name:/A <script>title/}));
  test.emit({type:"connection.changed",status:"disconnected"});
  test.finish();
  await screen.findByRole("button",{name:"重新登入"});
  expect(screen.queryByText("Secret body")).toBeNull();
  expect(screen.queryByRole("button",{name:/A <script>title/})).toBeNull();
});
it("shows partial content, rejects older revisions and other articles without replacing focus", async () => {
  const test=setup();
  fireEvent.click(await screen.findByRole("button",{name:/A <script>title/}));
  const back=screen.getByRole("button",{name:/A <script>title/});
  back.focus();
  const emitPartial=(index:number, revision:number, body:string)=>test.emit({
    type:"article.partial",articleKey:{board:"Test",index},revision,
    article:{key:{board:"Test",index},revision,completeness:"incomplete",body,replies:[]},
  });
  emitPartial(1,2,"Newest partial");
  expect(screen.getByText("Newest partial")).toBeTruthy();
  emitPartial(1,1,"Old partial");
  emitPartial(2,3,"Wrong article");
  expect(screen.queryByText("Old partial")).toBeNull();
  expect(screen.queryByText("Wrong article")).toBeNull();
  expect(document.activeElement).toBe(back);
  fireEvent.click(back);
  emitPartial(1,4,"After navigation");
  expect(document.querySelector(".feed-body")?.textContent).toBe("After navigation");
  expect(screen.queryByRole("button",{name:"返回串流"})).toBeNull();
  test.finish();
});

it("expands replies inline, keeps media stable and ignores media or text selection clicks", async () => {
  const test=setup();
  const title=await screen.findByRole("button",{name:/A <script>title/});
  const card=document.querySelector<HTMLElement>(".feed-item")!;
  fireEvent.click(card);
  expect(title.getAttribute("aria-expanded")).toBe("true");
  expect(screen.queryByRole("button",{name:"查看討論"})).toBeNull();
  const snapshot = {key:{board:"Test",index:1},revision:1,completeness:"incomplete" as const,
    body:"正文\nhttps://example.com/a.jpg\nhttps://youtu.be/dQw4w9WgXcQ", replies:[{
      replyId:"r1",author:"bob",content:"這是回覆",pushType:"neutral" as const,depth:0,
      score:0,votes:{pushCount:0,booCount:0,score:0},visible:true,isOp:false,edits:[],children:[],
    }]};
  test.emit({type:"article.partial",articleKey:snapshot.key,revision:1,article:snapshot});
  expect(screen.getByText("這是回覆")).toBeTruthy();
  const frame=card.querySelector("iframe")!;
  expect(frame).not.toBeNull();
  const native=screen.getByText("PTT 原始統計").parentElement as HTMLDetailsElement;
  native.open=true; native.querySelector("summary")!.focus();
  fireEvent.click(card.querySelector(".media-strip")!);
  expect(title.getAttribute("aria-expanded")).toBe("true");
  const range=document.createRange(); range.selectNodeContents(card.querySelector(".feed-body")!);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  expect(window.getSelection()!.toString()).toContain("正文");
  fireEvent.click(card);
  expect(title.getAttribute("aria-expanded")).toBe("true");
  window.getSelection()!.removeAllRanges();
  test.emit({type:"article.partial",articleKey:snapshot.key,revision:2,article:{...snapshot,revision:2,body:snapshot.body+"\n更新"}});
  expect(card.querySelector("iframe")).toBe(frame);
  expect(screen.getByText("PTT 原始統計").parentElement).toBe(native);
  expect(native.open).toBe(true);
  expect(document.activeElement).toBe(native.querySelector("summary"));
  fireEvent.click(title);
  expect(card.querySelector<HTMLElement>(".inline-discussion")!.hidden).toBe(true);
  expect(card.querySelector("iframe")).toBe(frame);
  test.finish();
});

it("exposes discussion before loading and counts visible nested replies without treating unknown as zero", async () => {
  const test=setup();
  const open=await screen.findByRole("button",{name:"展開討論，尚未讀取"});
  expect(document.querySelector(".article-votes")?.textContent).toContain("推 —");
  fireEvent.click(open);
  expect(screen.getByText("回覆讀取中…")).toBeTruthy();
  const child={replyId:"child",author:"child",content:"Nested reply",pushType:"neutral" as const,depth:1,score:0,votes:{pushCount:0,booCount:0,score:0},visible:true,isOp:false,edits:[],children:[]};
  test.emit({type:"article.partial",articleKey:{board:"Test",index:1},revision:1,article:{key:{board:"Test",index:1},revision:1,completeness:"incomplete",body:"Body",articleVotes:{pushCount:4,booCount:2,score:2},replies:[{...child,replyId:"hidden",visible:false,content:"Hidden control",children:[child]}]}});
  expect(screen.getByText("Nested reply")).toBeTruthy();
  expect(screen.queryByText("Hidden control")).toBeNull();
  expect(document.querySelector(".article-votes")?.textContent).toContain("推 4");
  expect(open.textContent).toContain("討論 1+");
  fireEvent.click(open);
  expect(document.querySelector<HTMLElement>(".inline-discussion")!.hidden).toBe(true);
  test.finish();
  await waitFor(()=>expect(open.textContent).toContain("討論 0"));
});

it("offers a selectable share URL when clipboard access fails without expanding the article", async () => {
  setup();
  Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:vi.fn().mockRejectedValue(new Error("denied"))}});
  Object.defineProperty(navigator,"share",{configurable:true,value:undefined});
  fireEvent.click(await screen.findByRole("button",{name:"分享文章"}));
  const field=await screen.findByRole("textbox",{name:"分享連結"}) as HTMLInputElement;
  expect(new URL(field.value).searchParams.get("board")).toBe("Test");
  expect(new URL(field.value).searchParams.get("index")).toBe("1");
  expect(new URL(field.value).searchParams.get("preview")).toBe("1");
  expect(screen.getByRole("button",{name:/A <script>title/}).getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText("已複製連結")).toBeNull();
});

it("opens a shared article outside the hot feed after login", async () => {
  window.history.replaceState(null,"","/?preview=1&board=Other&aid=Shared123");
  const test=setup();
  await waitFor(()=>expect(test.client.getArticle).toHaveBeenCalledWith({article:{board:"Other",aid:"Shared123"}}));
  expect(screen.getByRole("heading",{name:"分享的文章"})).toBeTruthy();
  window.history.replaceState(null,"","/");
});

it("keeps the previous feed visible and prevents repeated refresh commands while waiting", async () => {
  const test=setup();
  fireEvent.click(await screen.findByRole("button",{name:/A <script>title/}));
  test.finish(); await screen.findByText("Secret body");
  let resolveBoards: ((value: Awaited<ReturnType<PttzzzClient["listBoards"]>>) => void) | undefined;
  test.client.listBoards.mockImplementationOnce(()=>new Promise(resolve=>{resolveBoards=resolve;}));
  const refresh=screen.getByRole("button",{name:"重新整理"});
  fireEvent.click(refresh); fireEvent.click(refresh);
  expect(screen.getByText("Secret body")).toBeTruthy();
  expect((refresh as HTMLButtonElement).disabled).toBe(true);
  await waitFor(()=>expect(test.client.listBoards).toHaveBeenCalledTimes(2));
  resolveBoards!(ok({kind:"boards",items:[]}));
  await screen.findByText(/這次沒有取得/);
  expect(test.client.listBoards).toHaveBeenCalledTimes(2);
});

it("clears the shared article URL when returning to the hot feed", async () => {
  window.history.replaceState(null,"","/?preview=1&board=Test&index=1");
  const test=setup();
  const back=await screen.findByRole("button",{name:"返回熱門討論"});
  test.finish(); await screen.findByText("Secret body");
  fireEvent.click(back);
  await screen.findByRole("heading",{name:"熱門討論"});
  expect(new URL(location.href).searchParams.has("board")).toBe(false);
  expect(new URL(location.href).searchParams.has("index")).toBe(false);
  expect(new URL(location.href).searchParams.get("preview")).toBe("1");
});

it("does not claim share success or copy when the native share sheet is cancelled", async () => {
  setup();
  const writeText=vi.fn();
  Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});
  Object.defineProperty(navigator,"share",{configurable:true,value:vi.fn().mockRejectedValue(new DOMException("cancelled","AbortError"))});
  const share=await screen.findByRole("button",{name:"分享文章"});
  fireEvent.click(share);
  await waitFor(()=>expect((share as HTMLButtonElement).disabled).toBe(false));
  expect(writeText).not.toHaveBeenCalled();
  expect(screen.queryByRole("textbox",{name:"分享連結"})).toBeNull();
});

it("wires top pull refresh to a single feed reload while preserving the readable feed", async () => {
  const test=setup();
  await screen.findByRole("button",{name:/A <script>title/});
  const target=document.querySelector(".feed-heading")!;
  const pull=()=>{
    fireEvent.touchStart(target,{touches:[{identifier:1,clientX:10,clientY:20}]});
    fireEvent.touchMove(target,{touches:[{identifier:1,clientX:12,clientY:110}],cancelable:true});
    fireEvent.touchEnd(target,{touches:[]});
  };
  let resolveBoards: ((value: Awaited<ReturnType<PttzzzClient["listBoards"]>>) => void) | undefined;
  test.client.listBoards.mockImplementationOnce(()=>new Promise(resolve=>{resolveBoards=resolve;}));
  pull();
  const refresh=screen.getByRole("button",{name:"重新整理"});
  expect((refresh as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("button",{name:/A <script>title/})).toBeTruthy();
  expect(document.querySelector(".pull-indicator")?.getAttribute("data-state")).toBe("refreshing");
  pull(); fireEvent.click(refresh);
  await waitFor(()=>expect(test.client.listBoards).toHaveBeenCalledTimes(2));
  resolveBoards!(ok({kind:"boards",items:[]}));
  await screen.findByText(/這次沒有取得/);
  await waitFor(()=>expect(document.querySelector(".pull-indicator")?.getAttribute("data-state")).toBe("idle"));
  expect((screen.getByRole("button",{name:"重新整理"}) as HTMLButtonElement).disabled).toBe(false);
  expect(test.client.listBoards).toHaveBeenCalledTimes(2);
});
