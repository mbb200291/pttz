/* @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import { ok, type Article, type CoreEvent, type PttzzzClient } from "@pttzzz/core";
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
afterEach(() => { dispose?.(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function setup(count = 1) {
  const listeners=new Set<(event: CoreEvent) => void>();
  const resolvers=new Map<number,(value: ReturnType<typeof ok<Article>>) => void>();
  const client = {
    connect: vi.fn(async () => ok(undefined)),
    login: vi.fn(async () => ok({userId:"reader"})),
    disconnect: vi.fn(async () => {}),
    subscribe: vi.fn((listener: (event: CoreEvent) => void) => { listeners.add(listener); return () => {listeners.delete(listener);}; }),
    listBoards: vi.fn(async () => ok({kind:"boards" as const,items:[{name:"Test",title:"Test"}]})),
    filterArticles: vi.fn(async () => ok({items:Array.from({length:count},(_,index)=>({key:{board:"Test",index:index+1},title:index?"Second article":"A <script>title</script>",author:"alice"}))})),
    getArticle: vi.fn(({article}:{article:{index?:number}}) => new Promise<ReturnType<typeof ok<Article>>>(r => { resolvers.set(article.index!,r); })),
  };
  const root = document.createElement("div"); document.body.append(root);
  dispose=mountApp(root,client as unknown as PttzzzClient,true);
  return {client,emit:(event:CoreEvent)=>listeners.forEach(listener=>listener(event)),finish:(index=1)=>resolvers.get(index)!(ok({
    key:{board:"Test",index},title:"Late article",author:"alice",body:"Secret body",
    completeness:"final",revision:3,replies:[],articleEdits:[],revisions:[],
    nativePushCount:0,nativeBooCount:0,nativeNeutralCount:0,
    nativeVotes:{pushCount:0,booCount:0,score:0},articleVotes:{pushCount:0,booCount:0,score:0},
  }))};
}
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
