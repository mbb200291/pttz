import { articleKeyId, ok, type Article, type ArticleSummary, type PartialArticle, type PttzzzClient, type Reply, type Result } from "@pttzzz/core";
import { feedBody, loadFeed, type FeedSnapshot } from "./feed";
import { articleLink, parseArticleLink } from "./articleLink";
import { attachPullRefresh } from "./pullRefresh";
import { RequestScope } from "./requestScope";
import { mediaFromText, updateMedia } from "./media";
import { renderArticleBody, plainArticleText } from "./articleBody";
import { renderReplies } from "./replyPresentation";

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

export function mountApp(root: HTMLElement, client: PttzzzClient, preview = false, connectionLabel = "正式 PTT（ws.ptt.cc）"): () => void {
  const scope = new RequestScope();
  let user = "";
  let refreshing: Promise<void> | undefined;
  let refreshButton: HTMLButtonElement | undefined;
  let sharedKey = parseArticleLink(location.href);
  let feed: FeedSnapshot = {items:[],errors:[],completed:0,total:0};
  type CachedArticle = { snapshot?: Article | PartialArticle; pending?: Promise<Result<Article>>; error?: string };
  const articleCache = new Map<string, CachedArticle>();
  const expanded = new Set<string>();
  let previewUpdates = new Map<string, () => void>();
  let stopPreviews = () => {};
  function clearPreviews(): void {
    stopPreviews(); previewUpdates.clear(); articleCache.clear(); expanded.clear();
  }
  // The same read serves the excerpt and inline discussion.
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
    previewUpdates.get(id)?.();
    return target.pending;
  }
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
  const pullIndicator=node("div","","pull-indicator");
  pullIndicator.setAttribute("role","status");
  main.append(pullIndicator,status,content);
  root.replaceChildren(header,main,footer);
  const stopPull=attachPullRefresh(root,pullIndicator,refresh,()=>Boolean(user) && !refreshing && !sharedKey);

  function showStatus(text: string): void { status.textContent=text; }
  function heading(text: string): HTMLHeadingElement {
    const title=node("h1",text);
    title.tabIndex=-1;
    return title;
  }
  function reset(message: string): void {
    clearPreviews();
    scope.invalidate(); user=""; feed={items:[],errors:[],completed:0,total:0};
    account.replaceChildren();
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
    content.replaceChildren(title,intro,...(preview ? [] : [node("p",connectionLabel,"muted")]),form);
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
      feed={items:[],errors:[],completed:0,total:0};
      account.replaceChildren(node("span",preview ? "預覽模式" : user),button("登出",()=>{
        clearPreviews();
        scope.invalidate(); user=""; feed={items:[],errors:[],completed:0,total:0};
        account.replaceChildren(); content.replaceChildren(heading("正在登出…"));
        void client.disconnect().then(()=>reset("已登出。"),()=>reset("連線清理失敗，請重新整理。"));
      }));
      if(sharedKey) {
        feed={items:[{key:sharedKey,title:"分享的文章",author:""}],errors:[],completed:0,total:0};
        expanded.add(articleKeyId(sharedKey)); renderFeed();
      } else await refresh();
    } catch { if (current()) showStatus("讀取失敗，請稍後再試。"); }
  }

  function renderFeed(): void {
    scope.invalidate(); stopPreviews();
    previewUpdates = new Map();
    let active = true;
    let reading = false;
    const queue: ArticleSummary[] = [];
    const queued = new Set<string>();
    const drain = async (): Promise<void> => {
      if (reading) return;
      reading = true;
      while (active && queue.length) {
        const article = queue.shift()!;
        if (!active) break;
        await readArticle(article);
        queued.delete(articleKeyId(article.key));
      }
      reading = false;
    };
    const enqueue = (article: ArticleSummary, retry = false): void => {
      const id = articleKeyId(article.key);
      const entry = articleCache.get(id);
      if (!active || queued.has(id) || entry?.snapshot?.completeness === "final" || (entry?.error && !retry)) return;
      if (entry) entry.error = undefined;
      queued.add(id); queue.push(article); previewUpdates.get(id)?.(); void drain();
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
      active = false; queue.length = 0; observer?.disconnect(); previewUpdates.clear();
    };
    const title=heading(sharedKey ? "分享的文章" : "熱門討論");
    const top=node("div","","feed-heading");
    refreshButton=button(sharedKey ? "返回熱門討論" : "重新整理",()=>{
      if(sharedKey) {
        sharedKey=undefined;
        const url=new URL(location.href);
        for(const key of ["board","aid","index"]) url.searchParams.delete(key);
        history.replaceState(null,"",url);
      }
      void refresh();
    },"refresh-button");
    top.append(title,refreshButton);
    const explanation=node("p",preview
      ? "示例資料 · 非即時熱門"
      : sharedKey ? "" : "近三日精選","muted");
    const list=node("div","","feed");
    for (const article of feed.items) {
      const id = articleKeyId(article.key);
      const item=node("article","","feed-item");
      item.dataset.articleId=id;
      const avatar=node("span",article.author.slice(0,2).toUpperCase() || "P","avatar");
      item.append(avatar);
      const details=node("div","","item-detail");
      const toggleExpanded=():void=>{
        if (expanded.has(id)) expanded.delete(id); else { expanded.add(id); enqueue(article); }
        update();
      };
      const titleButton=button(article.title,toggleExpanded,"item-title");
      titleButton.dataset.articleId=id;
      const byline=node("div","","byline");
      const authorName=node("strong",article.author);
      byline.append(authorName,node("span",article.key.board,"board-name"),node("time",article.publishedAt ?? "","published-at"));
      details.append(byline,titleButton);
      const body=node("div","","feed-body");
      body.id="feed-body-"+feed.items.indexOf(article);
      const loading=node("p","內文等待載入…","muted excerpt-status");
      const toggle=button("收合",toggleExpanded,"text-action");
      const discussion=node("section","","inline-discussion"); discussion.id=body.id+"-discussion";
      const counts=node("p","","muted");
      const native=node("details"); const nativeCounts=node("p");
      native.append(node("summary","PTT 原始統計"),nativeCounts);
      const history=node("details"); history.hidden=true;
      history.append(node("summary","文章編輯紀錄"));
      const replyContent=node("div");
      const replyHeading=node("h2","回覆"); replyHeading.tabIndex=-1;
      discussion.dataset.noPullRefresh="";
      discussion.append(replyHeading,replyContent,counts,native,history);
      replyContent.append(node("p","回覆讀取中…","muted"));
      const votes=node("span","推 — · 噓 —","article-votes");
      const discussionButton=button("討論 —",()=>{
        toggleExpanded();
        if(expanded.has(id)) { replyHeading.focus({preventScroll:true}); replyHeading.scrollIntoView?.({block:"nearest"}); }
      },"discussion-action");
      discussionButton.setAttribute("aria-controls",discussion.id);
      const sharePanel=node("div","","share-panel"); sharePanel.hidden=true;
      sharePanel.dataset.noPullRefresh="";
      const shareInput=node("input"); shareInput.readOnly=true; shareInput.setAttribute("aria-label","分享連結");
      const shareUrl=articleLink(article.key,location.href,preview);
      shareInput.value=shareUrl ?? "";
      shareInput.addEventListener("click",()=>shareInput.select());
      const shareStatus=node("span","","muted"); shareStatus.setAttribute("role","status");
      const copy=async ():Promise<void>=>{
        if (!shareUrl) return;
        sharePanel.hidden=false; shareStatus.textContent="";
        try { await navigator.clipboard.writeText(shareInput.value); shareStatus.textContent="已複製連結"; }
        catch { shareStatus.textContent="選取連結以複製"; shareInput.focus(); shareInput.select(); }
      };
      sharePanel.append(shareInput,button("複製",()=>void copy()),button("關閉",()=>{sharePanel.hidden=true;shareButton.focus();}),shareStatus);
      const shareButton=button("分享",()=>{
        if (!shareUrl) return;
        if(typeof navigator.share!=="function") {void copy();return;}
        shareButton.disabled=true;
        void navigator.share({title:titleButton.textContent ?? article.title,url:shareInput.value}).catch(error=>{
          if(error?.name!=="AbortError") return copy();
        }).finally(()=>{shareButton.disabled=false;});
      },"share-action");
      shareButton.setAttribute("aria-label","分享文章");
      shareButton.disabled=!shareUrl;
      if (!shareUrl) shareButton.title="此文章暫無分享連結";
      titleButton.setAttribute("aria-controls",body.id+" "+discussion.id);
      toggle.setAttribute("aria-controls",body.id+" "+discussion.id);
      const media=node("div","","media-strip"); media.tabIndex=0; media.hidden=true;
      media.dataset.noPullRefresh="";
      media.setAttribute("role","region"); media.setAttribute("aria-label","文章媒體，可左右捲動");
      let mediaText: string | undefined;
      let renderedBody: string | undefined;
      let discussionSnapshot: Article | PartialArticle | undefined;
      let pointerStart: {x:number;y:number} | undefined;
      let dragged=false;
      item.addEventListener("pointerdown",event=>{pointerStart={x:event.clientX,y:event.clientY};dragged=false;});
      item.addEventListener("pointermove",event=>{
        if(pointerStart && Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>8) dragged=true;
      });
      item.addEventListener("pointercancel",()=>{dragged=true;pointerStart=undefined;});
      item.addEventListener("click",event=>{
        if(dragged || window.getSelection()?.toString() || (event.target as Element).closest("button,a,input,summary,details,.media-strip,.inline-discussion")) return;
        toggleExpanded();
      });
      const retry=button("重試內文",()=>enqueue(article,true),"text-action"); retry.hidden=true;
      const update=():void=>{
        const entry=articleCache.get(id);
        const snapshot=entry?.snapshot;
        if(sharedKey && snapshot?.title) titleButton.textContent=snapshot.title;
        if(snapshot?.author) {authorName.textContent=snapshot.author;avatar.textContent=snapshot.author.slice(0,2).toUpperCase();}
        const text=snapshot?.body===undefined ? undefined : feedBody(snapshot.body,{...article,title:snapshot.title ?? article.title,author:snapshot.author ?? article.author});
        if (text!==undefined && renderedBody!==text) { renderedBody=text;renderArticleBody(body,text); }
        const mediaBody=plainArticleText(text ?? "");
        if(mediaBody!==mediaText) {mediaText=mediaBody;updateMedia(media,mediaFromText(mediaBody));}
        const isExpanded=expanded.has(id);
        body.classList.toggle("expanded",isExpanded);
        titleButton.setAttribute("aria-expanded",String(isExpanded));
        toggle.setAttribute("aria-expanded",String(isExpanded));
        toggle.hidden=!isExpanded;
        discussion.hidden=!isExpanded;
        const replyCount=snapshot ? visibleReplyCount(snapshot.replies) : undefined;
        const complete=snapshot?.completeness==="final";
        votes.textContent=snapshot?.articleVotes ? `推 ${snapshot.articleVotes.pushCount} · 噓 ${snapshot.articleVotes.booCount}${complete ? "" : " · 更新中"}` : "推 — · 噓 —";
        discussionButton.textContent=`討論 ${replyCount===undefined ? "—" : String(replyCount)+(complete ? "" : "+")}`;
        discussionButton.setAttribute("aria-expanded",String(isExpanded));
        discussionButton.setAttribute("aria-label",`${isExpanded ? "收合" : "展開"}討論，${replyCount===undefined ? "尚未讀取" : `${replyCount} 則回覆${complete ? "" : "，讀取中"}`}`);
        if(!snapshot) replyContent.replaceChildren(node("p",entry?.error ? "留言未能載入，請重試內文。" : "回覆讀取中…","muted"));
        if(isExpanded && snapshot && snapshot!==discussionSnapshot) {
          discussionSnapshot=snapshot;
          counts.textContent=snapshot.articleVotes ? `文章推 ${snapshot.articleVotes.pushCount} / 噓 ${snapshot.articleVotes.booCount}` : "文章統計讀取中…";
          nativeCounts.textContent=snapshot.nativeVotes ? `推 ${snapshot.nativeVotes.pushCount} / 噓 ${snapshot.nativeVotes.booCount}` : "讀取中…";
          history.hidden=snapshot.completeness!=="final" || !snapshot.articleEdits.length;
          if(snapshot.completeness==="final") for(const edit of snapshot.articleEdits) history.append(node("pre",edit.marker+"\n"+edit.content));
          replyContent.replaceChildren(renderReplies(snapshot.replies,snapshot.completeness==="final"));
          if(!snapshot.replies.length) replyContent.append(node("p",snapshot.completeness==="final"?"尚無回覆":"回覆讀取中…","muted"));
        }
        loading.textContent=entry?.error ?? (complete ? (text?.trim() ? "" : "（無內文）") : entry?.pending ? (text ? "正在讀取其餘內容…" : "內文讀取中…") : queued.has(id) ? "內文排隊中…" : "內文等待載入…");
        loading.hidden=!loading.textContent;
        retry.hidden=!entry?.error;
      };
      const actions=node("div","","feed-actions");
      actions.append(votes,discussionButton,shareButton);
      const readingActions=node("div","","reading-actions"); readingActions.append(toggle,retry);
      details.append(body,media,loading,readingActions,actions,sharePanel,discussion);
      previewUpdates.set(id,update); update();
      item.append(details); list.append(item);
      observer?.observe(item);
      if (!observer || sharedKey) enqueue(article);
    }
    if (!feed.items.length) list.append(node("p","這次沒有取得符合條件的文章。可以稍後重新整理。","empty"));
    const errors=node("div","","errors");
    for (const error of feed.errors) errors.append(node("p",error));
    content.replaceChildren(top,explanation,errors,list);
    showStatus("");
  }
  function refresh(): Promise<void> {
    if(refreshing) return refreshing;
    refreshing=performRefresh().finally(()=>{refreshing=undefined;main.classList.remove("refreshing");if(refreshButton) refreshButton.disabled=false;});
    return refreshing;
  }
  async function performRefresh(): Promise<void> {
    if(refreshButton) refreshButton.disabled=true;
    main.classList.add("refreshing");
    stopPreviews();
    const current=scope.next();
    if(!feed.items.length) content.replaceChildren(heading("正在整理討論…"));
    showStatus("讀取熱門看板…");
    try {
      // Public reads cannot be cancelled; let the current body finish before switching boards.
      await Promise.all([...articleCache.values()].flatMap(entry => entry.pending ? [entry.pending] : []));
      if (!current()) return;
      const result=await loadFeed(client,current,(done,total)=>showStatus("已讀取 "+done+" / "+total+" 個看板"),{preview});
      if (!current()) return;
      // A failed source or zero successful boards must not masquerade as an empty success.
      if (result.errors.length && !result.succeeded) {
        renderFeed(); showStatus("讀取失敗，已保留本次登入先前取得的列表。" + result.errors.join("；")); return;
      }
      clearPreviews();
      feed=result; renderFeed();
    } catch { if(current()) {renderFeed();showStatus("讀取失敗，已保留本次登入先前取得的列表。");} }
  }
  renderLogin();
  if(preview) void login("preview","preview");
  return ()=>{stopPull();clearPreviews();scope.invalidate();unsubscribe();root.replaceChildren();};
}

function visibleReplyCount(replies: readonly Reply[]): number {
  const queue=[...replies]; let count=0;
  while(queue.length) {const reply=queue.pop()!;if(reply.visible) count++;queue.push(...reply.children);}
  return count;
}
