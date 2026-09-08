import { articleKeyId, ok, type Article, type ArticleSummary, type PartialArticle, type PttzzzClient, type Reply, type Result } from "@pttzzz/core";
import { feedBody, loadFeed, type FeedSnapshot } from "./feed";
import { RequestScope } from "./requestScope";

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}
function button(text: string, action: () => void, className = ""): HTMLButtonElement {
  const element = node("button", text, className);
  element.type = "button";
  element.addEventListener("click", action);
  return element;
}

export function mountApp(root: HTMLElement, client: PttzzzClient, preview = false): () => void {
  const scope = new RequestScope();
  let user = "";
  let feed: FeedSnapshot = {items:[],errors:[],completed:0,total:0};
  let feedScroll = 0;
  let selectedId = "";
  type CachedArticle = { snapshot?: Article | PartialArticle; pending?: Promise<Result<Article>>; error?: string };
  const articleCache = new Map<string, CachedArticle>();
  const expanded = new Set<string>();
  let previewUpdates = new Map<string, () => void>();
  let stopPreviews = () => {};
  function clearPreviews(): void {
    stopPreviews(); previewUpdates.clear(); articleCache.clear(); expanded.clear();
  }
  // The same read serves a visible excerpt and an explicitly opened article.
  function readArticle(article: ArticleSummary): Promise<Result<Article>> {
    const id = articleKeyId(article.key);
    let entry = articleCache.get(id);
    if (entry?.snapshot?.completeness === "final") return Promise.resolve(ok(entry.snapshot));
    if (entry?.pending) return entry.pending;
    entry = { snapshot: entry?.snapshot };
    articleCache.set(id, entry);
    const target = entry;
    let revision = -Infinity;
    let final = false;
    const publish = (snapshot: Article | PartialArticle): void => {
      if (articleCache.get(id) !== target || articleKeyId(snapshot.key) !== id || final || snapshot.revision <= revision) return;
      revision = snapshot.revision; final = snapshot.completeness === "final";
      target.snapshot = snapshot;
      previewUpdates.get(id)?.();
    };
    const stop = client.subscribe(event => {
      if (event.type === "article.partial" || event.type === "article.updated") publish(event.article);
    });
    target.pending = (async () => {
      try {
        const result = await client.getArticle({ article: article.key });
        if (result.ok) publish(result.value);
        else target.error = result.error.message;
        return result;
      } catch {
        target.error = "內文讀取失敗";
        return { ok: false, error: { code: "READ_FAILED", message: target.error, retryable: true } } as const;
      } finally {
        stop(); target.pending = undefined;
        if (articleCache.get(id) === target) previewUpdates.get(id)?.();
      }
    })();
    return target.pending;
  }
  let unsubscribeArticle: (() => void) | undefined;
  function stopReading(): void { unsubscribeArticle?.(); unsubscribeArticle=undefined; }
  const header = node("header");
  const brand = node("a", "pttz", "brand");
  brand.href = location.pathname + (preview ? "?preview=1" : "");
  const account = node("div", "", "account");
  header.append(brand, node("span","串流 / STREAM","edition"),account);
  const main = node("main");
  const status = node("p", "", "status");
  status.setAttribute("role","status");
  const content = node("section");
  const footer = node("footer", "PTT 的討論，不只一種閱讀方式。");
  main.append(status,content);
  root.replaceChildren(header,main,footer);

  function showStatus(text: string): void { status.textContent=text; }
  function heading(text: string): HTMLHeadingElement {
    const title=node("h1",text);
    title.tabIndex=-1;
    return title;
  }
  function reset(message: string): void {
    clearPreviews();
    scope.invalidate(); stopReading(); user=""; feed={items:[],errors:[],completed:0,total:0};
    selectedId=""; feedScroll=0; account.replaceChildren();
    content.replaceChildren(heading("閱讀暫停"),button("重新登入",()=>location.reload()));
    showStatus(message);
  }
  const unsubscribe=client.subscribe(event=>{
    if ((event.type==="connection.changed" && event.status==="disconnected") ||
        (event.type==="session.changed" && user && event.session?.userId!==user)) {
      reset("連線已結束，請重新登入。");
    }
  });

  function renderLogin(): void {
    const title=heading("從討論，遇見新的觀點。");
    const intro=node("p","跨越看板，讀取 PTT 熱門看板中的文章。","intro");
    const form=node("form"); form.className="login";
    const name=node("input"); name.name="username"; name.autocomplete="username"; name.required=true;
    const password=node("input"); password.name="password"; password.type="password"; password.autocomplete="current-password"; password.required=true;
    const nameLabel=node("label","PTT 帳號"); nameLabel.append(name);
    const passwordLabel=node("label","密碼"); passwordLabel.append(password);
    const submit=node("button","登入 PTT","primary"); submit.type="submit";
    form.append(nameLabel,passwordLabel,submit,node("p","密碼僅用於本次登入；此版本只提供閱讀功能。","muted"));
    form.addEventListener("submit",event=>{
      event.preventDefault(); submit.disabled=true;
      void login(name.value.trim(),password.value).finally(()=>{password.value="";submit.disabled=false;});
    });
    content.replaceChildren(title,intro,form);
  }

  async function login(username: string, password: string): Promise<void> {
    const current=scope.next();
    showStatus("連線中…");
    try {
      const connected=await client.connect();
      if (!current()) return;
      if (!connected.ok) { showStatus(connected.error.message); return; }
      let result=await client.login({username,password,disconnectExistingSession:false});
      if (!current()) return;
      if (!result.ok && result.error.message==="duplicate_login") {
        const disconnectExistingSession=window.confirm("PTT 偵測到其他連線。是否中斷其他連線？取消則保留。");
        result=await client.login({username,password,disconnectExistingSession});
      }
      if (!current()) return;
      if (!result.ok) { showStatus(result.error.message); return; }
      user=result.value.userId;
      clearPreviews();
      feed={items:[],errors:[],completed:0,total:0}; feedScroll=0; selectedId="";
      account.replaceChildren(node("span",preview ? "預覽模式" : user),button("登出",()=>{
        clearPreviews();
        scope.invalidate(); user=""; feed={items:[],errors:[],completed:0,total:0};
        account.replaceChildren(); content.replaceChildren(heading("正在登出…"));
        void client.disconnect().then(()=>reset("已登出。"),()=>reset("連線清理失敗，請重新整理。"));
      }));
      await refresh();
    } catch { if (current()) showStatus("讀取失敗，請稍後再試。"); }
  }

  function renderFeed(restore = false): void {
    scope.invalidate(); stopReading(); stopPreviews();
    previewUpdates = new Map();
    let active = true;
    let reading = false;
    const queue: ArticleSummary[] = [];
    const queued = new Set<string>();
    const resizeCallbacks: (() => void)[] = [];
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => resizeCallbacks.forEach(update => update()));
    const drain = async (): Promise<void> => {
      if (reading) return;
      reading = true;
      while (active && queue.length) {
        const article = queue.shift()!;
        if (!active) break;
        await readArticle(article);
      }
      reading = false;
    };
    const enqueue = (article: ArticleSummary): void => {
      const id = articleKeyId(article.key);
      if (!active || queued.has(id)) return;
      queued.add(id); queue.push(article); void drain();
    };
    const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const article = feed.items.find(item => articleKeyId(item.key) === (entry.target as HTMLElement).dataset.articleId);
        if (article) enqueue(article);
        observer?.unobserve(entry.target);
      }
    });
    stopPreviews = () => {
      active = false; queue.length = 0; observer?.disconnect(); resize?.disconnect(); previewUpdates.clear();
    };
    const title=heading("熱門討論");
    const top=node("div","","feed-heading");
    top.append(title,button("重新整理",()=>void refresh()));
    const explanation=node("p",preview
      ? "示例資料 · 非即時熱門 · 預覽未套用推數門檻"
      : "前五個熱門看板 · PTT 原生推數至少 20 · 各板最多六篇，依來源交錯排列","muted");
    const list=node("div","","feed");
    for (const article of feed.items) {
      const id = articleKeyId(article.key);
      const item=node("article","","feed-item");
      item.dataset.articleId=id;
      item.append(node("span",article.author.slice(0,2).toUpperCase(),"avatar"));
      const details=node("div","","item-detail");
      const titleButton=button(article.title,()=>void openArticle(article),"item-title");
      titleButton.dataset.articleId=id;
      details.append(node("span",article.author+" · "+article.key.board,"byline"),
        titleButton);
      const body=node("div","","feed-body");
      body.id="feed-body-"+feed.items.indexOf(article);
      const loading=node("p","內文等待載入…","muted excerpt-status");
      const toggle=button("展開全文",()=>{
        if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        update();
      },"text-action");
      toggle.setAttribute("aria-controls",body.id); toggle.hidden=true;
      const retry=button("重試內文",()=>void readArticle(article),"text-action"); retry.hidden=true;
      const update=():void=>{
        const entry=articleCache.get(id);
        const snapshot=entry?.snapshot;
        const text=snapshot?.body===undefined ? undefined : feedBody(snapshot.body,article);
        if (text!==undefined && body.textContent!==text) body.textContent=text;
        const isExpanded=expanded.has(id);
        body.classList.toggle("expanded",isExpanded);
        toggle.setAttribute("aria-expanded",String(isExpanded));
        toggle.textContent=isExpanded?"收合":"展開全文";
        const height=body.scrollHeight;
        const lineHeight=parseFloat(getComputedStyle(body).lineHeight) || 24;
        toggle.hidden=!(height>lineHeight*5+1 || (!height && (text?.split("\n").length ?? 0)>5));
        const complete=snapshot?.completeness==="final";
        loading.textContent=entry?.error ?? (complete ? (text?.trim() ? "" : "（無內文）") : text ? "正在讀取其餘內容…" : "內文等待載入…");
        loading.hidden=!loading.textContent;
        retry.hidden=!entry?.error;
      };
      const actions=node("div","","feed-actions");
      actions.append(toggle,retry,button("查看討論",()=>void openArticle(article),"text-action"),
        node("span",[article.publishedAt,article.nativeScoreLabel ?? article.nativeScore?.toString()].filter(Boolean).join(" · "),"muted"));
      details.append(body,loading,actions);
      previewUpdates.set(id,update); resizeCallbacks.push(update); update();
      item.append(details); list.append(item);
      resize?.observe(body);
      observer?.observe(item);
      if (!observer) enqueue(article);
    }
    if (!feed.items.length) list.append(node("p","這次沒有取得符合條件的文章。可以稍後重新整理。","empty"));
    const errors=node("div","","errors");
    for (const error of feed.errors) errors.append(node("p",error));
    content.replaceChildren(top,explanation,errors,list);
    showStatus("");
    if (restore) {
      const selected=Array.from(list.querySelectorAll<HTMLButtonElement>("button")).find(item=>item.dataset.articleId===selectedId);
      selected?.focus({preventScroll:true});
      window.scrollTo(0,feedScroll);
    }
  }
  async function refresh(): Promise<void> {
    clearPreviews();
    stopReading();
    const current=scope.next();
    content.replaceChildren(heading("正在整理討論…"),node("p","依序讀取熱門看板，不會自動發文或回覆。","muted"));
    showStatus("讀取熱門看板…");
    try {
      const result=await loadFeed(client,current,(done,total)=>showStatus("已讀取 "+done+" / "+total+" 個看板"),preview?0:20);
      if (!current()) return;
      feed=result; feedScroll=0; renderFeed();
    } catch { if(current()) {renderFeed();showStatus("讀取失敗，已保留本次登入先前取得的列表。");} }
  }
  function replies(replies: readonly Reply[], final: boolean): HTMLElement {
    const list=node("div","","replies");
    const queue=[...replies].reverse().map(reply=>({reply,depth:0,parent:""}));
    while(queue.length) {
      const {reply,depth,parent}=queue.pop()!;
      for (const child of [...reply.children].reverse()) queue.push({reply:child,depth:depth+1,parent:reply.author});
      if (!reply.visible) continue;
      const item=node("article","","reply");
      item.dataset.replyId=reply.replyId;
      item.style.marginInlineStart=Math.min(depth,3)*12+"px";
      const label=reply.pushType==="push"?"推":reply.pushType==="boo"?"噓":"→";
      item.append(node("strong",reply.author+(reply.isOp?" · 原作者":"")+" · "+label),
        node("p",reply.content,"reply-content"),node("p","推 "+reply.votes.pushCount+" · 噓 "+reply.votes.booCount+(parent?" · 回覆 "+parent:""),"muted"));
      if (final && reply.edits.length) {
        const history=node("details"); history.append(node("summary","編輯歷程"));
        for(const edit of reply.edits) history.append(node("pre",[edit.createdAt,edit.kind,edit.content].filter(Boolean).join("\n")));
        item.append(history);
      }
      list.append(item);
    }
    return list;
  }
  function articleView(summary: ArticleSummary): (article: Article | PartialArticle) => void {
    const title=heading(summary.title);
    const back=button("返回串流",()=>renderFeed(true));
    const byline=node("p",summary.author+" · "+summary.key.board,"byline");
    const body=node("pre","","article-body"); body.tabIndex=0; body.setAttribute("aria-label","文章正文");
    const votes=node("p","","muted");
    const native=node("details");
    const nativeCounts=node("p");
    native.append(node("summary","PTT 原始統計"),nativeCounts);
    const history=node("details"); history.hidden=true; history.append(node("summary","文章編輯紀錄"));
    const discussion=node("section");
    content.replaceChildren(back,title,byline,body,votes,native,history,node("h2","討論"),discussion);
    title.focus({preventScroll:true});
    return article=>{
      title.textContent=article.title ?? summary.title;
      byline.textContent=(article.author ?? summary.author)+" · "+summary.key.board;
      if(article.body!==undefined && body.textContent!==article.body) body.textContent=article.body;
      votes.textContent=article.articleVotes ? "文章推噓：推 "+article.articleVotes.pushCount+" / 噓 "+article.articleVotes.booCount : "文章統計讀取中…";
      nativeCounts.textContent=article.nativeVotes ? "推 "+article.nativeVotes.pushCount+" / 噓 "+article.nativeVotes.booCount : "讀取中…";
      discussion.replaceChildren(replies(article.replies,article.completeness==="final"));
      if(article.completeness==="final" && article.articleEdits.length) {
        history.hidden=false;
        for(const edit of article.articleEdits) history.append(node("pre",edit.marker+"\n"+edit.content));
      }
    };
  }
  async function openArticle(article: ArticleSummary): Promise<void> {
    stopPreviews();
    feedScroll=window.scrollY; selectedId=articleKeyId(article.key);
    stopReading();
    const current=scope.next();
    const update=articleView(article);
    let revision=-Infinity;
    let final=false;
    const accept=(snapshot: Article | PartialArticle): void=>{
      if (!current() || final || articleKeyId(snapshot.key)!==selectedId || snapshot.revision<=revision) return;
      revision=snapshot.revision; final=snapshot.completeness==="final";
      update(snapshot); showStatus(final ? "" : "內文已載入，繼續讀取討論…");
    };
    const stop=client.subscribe(event=>{
      if(event.type==="article.partial" || event.type==="article.updated") accept(event.article);
    });
    unsubscribeArticle=stop;
    window.scrollTo(0,0); showStatus("讀取完整文章…");
    try {
      const cached=articleCache.get(selectedId)?.snapshot;
      if(cached) accept(cached);
      const result=await readArticle(article);
      if (!current()) return;
      if(!result.ok) {showStatus(result.error.message);return;}
      accept(result.value);
    } catch { if(current()) showStatus("文章讀取失敗，請返回串流重試。"); }
    finally { stop(); if(unsubscribeArticle===stop) unsubscribeArticle=undefined; }
  }
  renderLogin();
  if(preview) void login("preview","preview");
  return ()=>{clearPreviews();scope.invalidate();stopReading();unsubscribe();root.replaceChildren();};
}
