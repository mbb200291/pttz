/* @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import { ok, type Article, type CoreEvent, type PttzzzClient } from "@pttzzz/core";
import { mountApp } from "./app";

let dispose: (() => void) | undefined;
beforeEach(() => { vi.spyOn(window,"scrollTo").mockImplementation(()=>{}); });
afterEach(() => { dispose?.(); document.body.replaceChildren(); });
function setup() {
  const listeners=new Set<(event: CoreEvent) => void>();
  let resolve!: (value: ReturnType<typeof ok<Article>>) => void;
  const client = {
    connect: vi.fn(async () => ok(undefined)),
    login: vi.fn(async () => ok({userId:"reader"})),
    disconnect: vi.fn(async () => {}),
    subscribe: vi.fn((listener: (event: CoreEvent) => void) => { listeners.add(listener); return () => {listeners.delete(listener);}; }),
    listBoards: vi.fn(async () => ok({kind:"boards" as const,items:[{name:"Test",title:"Test"}]})),
    filterArticles: vi.fn(async () => ok({items:[{key:{board:"Test",index:1},title:"A <script>title</script>",author:"alice"}]})),
    getArticle: vi.fn(() => new Promise<ReturnType<typeof ok<Article>>>(r => { resolve=r; })),
  };
  const root = document.createElement("div"); document.body.append(root);
  dispose=mountApp(root,client as unknown as PttzzzClient,true);
  return {client,emit:(event:CoreEvent)=>listeners.forEach(listener=>listener(event)),finish:()=>resolve(ok({
    key:{board:"Test",index:1},title:"Late article",author:"alice",body:"Secret body",
    completeness:"final",revision:1,replies:[],articleEdits:[],revisions:[],
    nativePushCount:0,nativeBooCount:0,nativeNeutralCount:0,
    nativeVotes:{pushCount:0,booCount:0,score:0},articleVotes:{pushCount:0,booCount:0,score:0},
  }))};
}
it("uses safe text and read-only controls, then ignores article completion after returning", async () => {
  const test=setup();
  const item=await screen.findByRole("button",{name:/A <script>title/});
  expect(document.querySelector("script")).toBeNull();
  fireEvent.click(item);
  fireEvent.click(screen.getByRole("button",{name:"返回串流"}));
  test.finish();
  await waitFor(()=>expect(screen.queryByText("Secret body")).toBeNull());
  expect(screen.getByRole("button",{name:/A <script>title/})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"發文"})).toBeNull();
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
  const back=screen.getByRole("button",{name:"返回串流"});
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
  expect(screen.queryByText("After navigation")).toBeNull();
  test.finish();
});
