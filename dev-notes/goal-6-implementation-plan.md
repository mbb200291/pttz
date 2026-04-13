# 目標 6：閱讀體驗 Basic 實作規劃

## 目的

這份文件把 [`spec.md`](spec.md) 目標 6 的規則整理成可實作的設計與限制說明。

---

## spec 子需求拆解與現況

| #   | spec 原文                                                              | 實作狀況（iteration 關閉時）                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 開啟文章後看到內容的時間不能超過 0.5 秒，下方回文區需要逐步渲染        | ✅ **階段目標完成**。首屏 partial 約 0.4–1.5s 可見；正文與回文以 ~230ms/頁節奏逐步增量（`readArticleLinesProgressively` + monotonic merge）；loading 期間 lightweight render path；初次開文空白佔位修正。嚴格 0.5s 未達，受 PTT RTT 架構限制。 |
| 2   | 進入看板看到文章列表的時間不超過 0.5 秒                                | ✅ **階段目標完成**。board cache + partial list parse；篩選列表 stale-while-revalidate cache（17ms）；返回看板 anchor restore（回到原點選文章附近）。 |
| 3   | 看板文章可隨著滾動自動載入                                             | ✅ **完成**：ArticleList 加 IntersectionObserver scroll sentinel，無 observer 時 fallback 手動按鈕。                                                                                   |
| 4   | 自動預覽圖片和 YouTube 影片                                            | ✅ **完成**：`parseContentSegments` + `ImagePreview` + `YouTubePreview` + `RichContent`，文章正文與推文兩處均支援。                                                                    |
| 5   | 基本文章讀相關操作（搜尋文章、查詢文章 ID、搜尋文章 ID、篩選推噓文數） | ✅ **完成**：adapter 已有 `searchArticles` / `filterArticlesByPush` / `getArticleByAid`；`useBoard` 支援 `BoardFilter`；`ArticleList` 已加入搜尋列、推噓文數快選與 AID 跳轉。          |

---

## 2026-04-29 Iteration 關閉

Goal 6 iteration 正式關閉。五個子需求均有對應實作，子需求 1、2 以「先有部分結果」為本輪驗收線（非嚴格 0.5s）。

最終測試結果：

- `npm test`：143 tests passed（12 test files）
- `npm run build`：通過

已知殘留問題：AID 路徑有時落到看板說明頁，留待後續 iteration。

---

## 2026-04-17 進度校正

本文件原先最上方狀態表仍停留在子需求 5 尚未實作的舊狀態，已依目前程式碼校正（詳細變更歷程見 goal-6-implementation-notes.md）。

---

## 可實作性結論

各子需求的技術可行性差異較大，分開評估。

---

## 子需求 1：文章開啟後直接顯示部分內容

### 問題根源：ptt-client 全讀完才 resolve

ptt-client 的 `getArticle()` 採頁面輪詢模式：

1. 進入文章頁
2. 讀取 22 行
3. 按 PgDown
4. 等 200ms socket batch
5. 重複直到 status bar 出現 `100%`
6. **全部頁面讀完，才 resolve、才回傳給前端**

短文章約 1–2s，熱門長文可能 5–10s。**目前前端在 resolve 前完全看不到任何內容。**

jPTT 等其他 PTT 瀏覽器能立即顯示是因為它們**直接訂閱每次 redraw event**，PTT 更新一個畫面就渲染一次，不等整篇讀完。

### 解決方案：`progressive render` + cache fallback 雙軌並行

ptt-client bot 有 `redraw` event，adapter 已有 `subscribeScreen()`。設計如下：

```
若 cache 命中 → 先顯示 cached article
同時 getArticle() 在背景繼續跑（收集完整資料，用於推文聚合）
每個 redraw event → partial screen parser → 更新畫面的 partialArticle
完整資料 resolve 後 → 切換到完整版（含聚合後推文）並回寫 cache
```

**不需要 fork ptt-client**，只需在 adapter 的 `getArticle()` 期間額外接 `redraw` 事件；若 redraw 太晚或 parse 失敗，則由 cache 保底避免白畫面。

### partial screen parser

只需要輕量 parser，從 24 行終端畫面中抽出：

- 文章 header（標題、作者、日期）：通常在前 3–4 行
- 正文段落：去掉 ANSI 後直接顯示

不需要解析推文（推文在文章末尾，等 `getArticle()` 完整 resolve 後再渲染）。

### 顯示狀態設計

```
進入文章
  → 若 cache 命中，先顯示 cached article
    → partialArticle 出現後，以 partial 蓋過 cache
      → 顯示正文，下方顯示「回文載入中...」
        → getArticle() resolve
          → 切換到完整版，渲染推文區塊
```

狀態優先序為：`full > partial > cache > loading`。

### 本輪實作結果

- 一般文章讀取已不再依賴 `ptt-client` 的 `getArticle()` 全文 resolve 才顯示
- 改為先開文、輪詢首屏 24 行畫面，只要 header/body 已成形就立刻送出 partial
- 之後才繼續逐頁讀取全文，推文與排序控制在完整版 ready 後補上
- 保留 article cache 作為 fallback，但主要改善點已改成「首屏先顯示」

### 2026-04-24 現況補充：逐步載入仍未完全成立

目前文章頁的體感已從「整篇讀完才出現」改善為「首屏可先看到部分內容」，但 **超出第一頁的正文與回文仍有殘留的一次性更新問題**：

- 第一頁 header / body 能先顯示
- 讀到第二頁之後，累積中的正文與回文資料不一定會穩定反映到畫面
- 使用者觀察到的效果仍可能是：
  - 先看到第一頁部分文章
  - 超出第一頁的內容先不動
  - 等全文讀完後，第二頁之後的正文與回文一次補齊

這代表目前雖然已有 `progressive read` 骨架，但「adapter 累積 partial」到「React 畫面持續採用最新 partial」這段資料流還沒有完全收斂。

### 已確認的實作現況

目前相關路徑如下：

- `src/lib/ptt/adapter.ts`
  - `waitForArticleFirstScreen()`：負責首屏 partial
  - `readArticleLinesProgressively()`：逐頁 `PgDn`，把已讀 screen append 成累積 raw lines
  - `buildPartialArticleFromRawLines()`：把目前累積 raw lines 轉成 partial article
- `src/hooks/useArticle.ts`
  - 一方面透過 `client.getArticle(..., onPartial)` 接 adapter 的累積 partial
  - 另一方面在 `loading` 期間又透過 `client.subscribeScreen()` 解析當前 redraw screen
- `src/components/Article.tsx`
  - `loading && partialArticle` 時顯示 `PartialArticleView`
  - `article` settle 後切到完整文章

目前最可疑的點不是「沒有逐頁讀」，而是 **partial 來源有兩條**：

1. adapter 逐頁累積後送出的 partial
2. hook 內另外訂閱 screen redraw、只解析單一 screen 的 partial

第二條路徑只知道「當前單頁」，不知道前面已累積的全文，容易發生：

- 把已累積的 partialArticle 蓋回單頁內容
- redraw 畫面沒有新推文時，partial 看起來像沒有進展
- 最後等 final article resolve 才一次切成完整內容

### 本次修正目標

這次子需求 1 的後續修正，不再只追求「首屏先出」，而是把需求收斂為以下可驗收行為：

- 開文後，首屏正文可立即顯示
- 翻到第二頁後，若正文變長，畫面上的正文需同步增長
- 翻到推文頁後，回文區需隨著已讀 screen 逐步增加
- 不可出現「第一頁先出現，但第二頁之後直到 final article 才一次補齊」的行為

### 修正計畫

#### 階段 A：收斂 partial 資料流

先把文章頁在 loading 期間的 partial 更新來源收斂成單一路徑，避免單頁 redraw partial 覆蓋累積 partial。

預計調整：

- `useArticle.ts`
  - 以 `client.getArticle(..., onPartial)` 的累積 partial 為主
  - 重新檢查 `subscribeScreen()` 在文章讀取期間是否仍有必要
  - 若保留 screen 訂閱，需限制只能作為「首屏尚未出現前」的 fallback，不能覆蓋已累積的 partial

驗收重點：

- 同一篇文章在 loading 期間，`partialArticle.body.length` 應只會維持或增加，不應退回較短內容
- `partialArticle.pushes.length` 應隨已讀 screen 維持或增加，不應被單頁 redraw 歸零或縮回

#### 階段 B：確認 adapter 每頁都 emit 累積 partial

把 `adapter.ts` 的 progressive emit 條件明確化，確保每次 `appendUniqueArticleScreenLines()` 後，只要累積內容有變化，就送出最新 partial。

預計檢查與必要修正：

- `readArticleLinesProgressively()` 每頁 append 後是否一定呼叫 `buildPartialArticleFromRawLines()`
- 是否存在條件讓第二頁之後的 partial 被跳過
- partial 是否真的由「累積 raw lines」計算，而不是只由當前 page 計算
- 若新頁只有回文增加、正文不變，仍需送出新的 partial

驗收重點：

- 第二頁仍有正文時，partial body 會持續增長
- 進入推文頁後，partial pushes 會從 0、1、2… 持續增加
- 即使 terminal status line 已顯示 `100%`，只要畫面內容仍在變化，partial 也必須繼續送出

#### 階段 C：補足防回歸測試

把目前使用者實際遇到的卡點寫成測試，不再只驗證「有 first screen partial」。

預計補的測試案例：

- 第二頁仍有正文，partial body 需比第一頁更長
- 第二頁開始出現回文，partial pushes 需隨頁數增加
- 多個 screen 都顯示 `100%`，但推文仍在增加，partial 不能提前停止
- hook 收到較舊或較短的 screen partial 時，不可覆蓋較新的累積 partial

主要檔案：

- `src/lib/ptt/__tests__/adapter.test.ts`
- `src/hooks/__tests__/useArticle.test.ts`

#### 階段 D：UI 端驗證

最後再驗證 `Article.tsx` 的 loading 呈現是否確實跟著 partial 更新：

- `PartialArticleView` 在 loading 期間持續使用最新 partial
- 正文與回文區都會逐步長出來
- final article settle 後只做一次自然切換，不造成內容倒退或閃回

### 這段修正的完成判定

此段工作完成時，應滿足以下條件：

- 開啟長文章時，第一頁後續的正文不再等全文讀完才一次顯示
- 推文區在讀到推文頁後會逐步增加，不再等 final article 一次跳出
- 單元測試能覆蓋「第二頁正文增加」與「推文逐步增加」兩類關鍵行為
- implementation notes 需同步記錄實際 root cause 與最終採用的 partial data flow

---

## 子需求 2：進入看板後直接顯示部分文章列表

### 現況

`listArticles()` 只需讀一頁畫面（不需逐頁），但在 resolve 前前端仍可能完全看不到任何列表。這次不再以 0.5 秒為先決條件，而是優先讓使用者「一進板就有東西可看」。

### 實作方向

採兩層 fallback：

1. **partial list parse 優先**：研究看板列表 `redraw` 畫面是否能直接 parse 出部分 article rows
2. **board cache 保底**：若 partial parse 不穩定或無法提早出現，則先顯示最近一次同看板列表，再背景刷新

### partial list parse 可行性判斷

若看板畫面與 `listArticles()` 使用的 row 格式一致，則可採下列流程：

```
enter board
  → redraw event 到達
    → parse visible article rows
      → 顯示 partial board list
        → listArticles() resolve
          → 以正式列表覆蓋
```

若看板畫面 redraw 不穩定、欄位不足或無法可靠辨識，則不強做 parser，直接退回 board cache。

### 本輪實作結果

- 一般看板頁已支援 `partial list parse`
- 若 redraw 尚未到位，先以 board cache 作 fallback
- 從文章返回看板時，除了記住 `scrollY`，也會記住「被點選文章列在視窗中的相對位置」
- 返回後優先用 article row anchor 還原位置，找不到 anchor 才退回純 `scrollY`

---

## 子需求 3：看板文章隨著滾動自動載入

### 現況

目前只有手動「載入更多」按鈕，無 scroll 自動觸發。

### 實作方式

與 PushThread 的 lazy rendering 相同，加 IntersectionObserver sentinel：

```tsx
const sentinelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!hasMore || loadingMore) return;
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) loadMore();
  });
  if (sentinelRef.current) observer.observe(sentinelRef.current);
  return () => observer.disconnect();
}, [hasMore, loadingMore]);
```

- 使用者捲到列表底部，sentinel 進入 viewport，自動觸發 `loadMore()`
- 無 `IntersectionObserver` 時保留手動按鈕 fallback
- `loadingMore` flag 防止重複觸發

---

## 子需求 4：自動預覽圖片和 YouTube 影片

### 預覽範圍

文章正文與回文區塊都需要支援預覽。兩者共用相同的 URL 偵測與預覽元件邏輯，差異只在渲染位置：

- 文章 body：目前是 `<pre>` 純文字，需改為 segment 渲染
- 回文內容：`PushItem` 的 `content` 目前是 `<p>` 純文字，同樣需要 segment 渲染

### 共用 URL 偵測

抽出獨立的 `parseContentSegments(text: string): ContentSegment[]`，文章 body 和回文 content 都使用同一個 parser：

```ts
type ContentSegment =
  | { kind: "text"; content: string }
  | { kind: "image"; url: string }
  | { kind: "youtube"; videoId: string; url: string };
```

**圖片**：

- `https://i.imgur.com/<id>.<ext>`（jpg / png / gif / webp）
- `https://imgur.com/<id>.<ext>`
- 之後可擴充其他圖床

**YouTube**：

- `https://www.youtube.com/watch?v=<id>`
- `https://youtu.be/<id>`
- `https://m.youtube.com/watch?v=<id>`

### 顯示策略

- 純文字段落：文章 body 用 `<pre>` 保留原格式；回文 content 用 `<span>` 行內
- 圖片 URL：行內顯示縮圖，點擊可放大，`onError` fallback 回純文字 URL
- YouTube URL：顯示縮圖（`https://img.youtube.com/vi/<id>/hqdefault.jpg`），點擊展開 iframe（click-to-play）

### YouTube embed 策略

不預設直接嵌入 `<iframe>`：

- 每個 iframe 都會觸發 YouTube 請求，浪費頻寬與隱私
- 第一版採 click-to-play：顯示縮圖，點擊後才展開 iframe

YouTube iframe 加 `sandbox="allow-scripts allow-same-origin allow-presentation"`，圖片加 `referrerpolicy="no-referrer"`。

---

## 子需求 5：基本文章讀相關操作（搜尋、查詢 ID、篩選推噓文數）

### PTT 支援的操作

| PTT 操作             | 說明                                            |
| -------------------- | ----------------------------------------------- |
| `/` → 搜尋標題關鍵字 | 在目前看板搜尋標題含關鍵字的文章                |
| `a` → 搜尋作者       | 在目前看板搜尋特定作者文章                      |
| `#` → 輸入文章 AID   | 直接跳到特定 AID 的文章                         |
| `Z` → 篩選推噓文數   | 輸入門檻值篩選推文數 ≥ N 的文章（負數篩選噓文） |

目前 `listArticles()` 只支援 `beforeIndex` 分頁，不支援上述操作。

### a. 搜尋文章（標題關鍵字）

**adapter 新增：**

```ts
searchArticles(boardName: string, keyword: string): Promise<ArticleSummary[]>
```

導航序列：在看板列表按 `/` → 輸入關鍵字 → 讀取搜尋結果畫面 → 解析文章列表。

**UI：** 看板列表頂部加搜尋 input，enter 觸發搜尋，清空 input 回到一般列表。

### b. 查詢文章 ID / 搜尋文章 ID（AID 跳轉）

PTT 的「文章 ID」有兩種形態：

- **AID**（Article ID）：如 `1abc2DEF`，PTT 內部唯一識別碼
- **流水號 index**：看板內文章序號，`listArticles` 目前用的就是這個

「查詢 / 搜尋文章 ID」解讀為：輸入 AID 直接跳到該文章。

**adapter 新增：**

```ts
getArticleByAid(boardName: string, aid: string): Promise<AdapterArticleData | null>
```

導航序列：在看板按 `#` → 輸入 AID → 進入文章。

**UI：** 搜尋 input 偵測輸入格式，自動判斷是關鍵字搜尋還是 AID 跳轉。

### c. 篩選指定推噓文數文章

採用 **PTT 內建篩選**，不做前端篩選。

原因：前端篩選只作用於已載入的文章，若使用者篩選「≥ 100 推」，但前端只載入了 20 篇，結果可能顯示 0 筆——即使看板裡確實有爆文。使用者無法分辨「真的沒有」還是「還沒載入到」，體驗有誤導性。

PTT 看板原生支援推文數篩選（觸發鍵位：`Z`，已實測確認），server 直接回傳符合條件的文章列表，結果完整。

**PTT 篩選 prompt 原文**：「搜尋推文數高於多少 (<0則搜噓文數) 的文章:」— 負數可篩選噓文。

**adapter 新增：**

```ts
filterArticlesByPush(boardName: string, threshold: number): Promise<ArticleSummary[]>
```

導航序列：在看板列表觸發推文數篩選 → 輸入門檻值 → 讀取篩選後畫面 → 解析文章列表。

篩選結果的翻頁採逐步載入（scroll sentinel），與搜尋結果相同。

**UI：** 搜尋框旁加篩選快選（≥10 / ≥30 / ≥100 / 爆），旁邊有輸入框可手動輸入任意數字。搜尋與篩選可同時生效。

**✅ 實測已完成（2026-04-12）：**

1. 觸發鍵位：`Z`，prompt 為「搜尋推文數高於多少 (<0則搜噓文數) 的文章:」
2. 篩選結果畫面格式與一般看板列表相同（欄位：index / push / date / author / tag / title）
3. title bar 由「看板《X》」變為「系列《X》」（搜尋/篩選模式的共同標誌）
4. PgUp / PgDn 在篩選結果視圖中均可正常翻頁
5. 文章 index 為 board-wide 流水號，與一般看板相同 → `beforeIndex` 分頁邏輯可直接沿用

---

## 實作順序

### 階段 1：文章頁直接顯示部分內容（最優先，直接影響核心體驗）

- 檢查 `getArticle()` / `useArticle()` 的 listener 掛載時機，盡量讓第一次 partial 更早出現
- 新增 article cache（一般文章頁）
- Article 元件支援 `full / partial / cache / loading` 狀態切換

### 階段 2：看板頁直接顯示部分列表

- 驗證看板 `redraw` 畫面是否可 parse 出 partial rows
- 若可行，新增 partial board list 流程
- 若不可行，直接實作 board cache fallback

### 階段 3：scroll 自動載入（子需求 3，成本最低）

- ArticleList 加 IntersectionObserver sentinel
- 保留手動按鈕 fallback

### 階段 4：圖片與 YouTube 預覽（子需求 4）

- 實作 body segment parser
- 實作 `ImagePreview` 元件
- 實作 YouTube click-to-play 元件

### 階段 5：搜尋與篩選（子需求 5）

- adapter 推噓分篩選功能（PTT 內建）
- adapter 搜尋標題功能
- adapter AID 跳轉功能

---

## 已定案項目

1. 子需求 1、2 這一輪先不追 0.5 秒硬門檻，改以「直接打開就有部分結果顯示」為優先目標
2. 文章頁採 `progressive render` + article cache fallback
3. 看板頁採 `partial list parse` 優先、board cache 保底
4. 不 fork ptt-client，在 adapter 層接 `redraw` event
5. scroll 自動載入使用 IntersectionObserver，與 PushThread 相同模式
6. 圖片預覽白名單第一版只接受 imgur
7. YouTube 採 click-to-play，不預設嵌入 iframe
8. 推噓分篩選使用 PTT 內建篩選，不做前端 filter
9. 圖片與 YouTube 預覽同時支援文章正文與回文區塊，共用 `parseContentSegments()` parser
10. 搜尋 UI：搜尋框偵測輸入格式自動切換關鍵字搜尋 / AID 跳轉；篩選快選（≥10 / ≥30 / ≥100 / 爆）+ 手動輸入框並存；搜尋與篩選可同時生效
11. 本輪 cache / partial 優化只涵蓋一般文章頁與一般看板頁，不擴到搜尋、推噓篩選、AID 特殊流程

---

## 未定案項目

1. **搜尋 UI 的入口設計**：搜尋框放哪、是否和篩選共用一列（待 UI 草稿後確認）

## 已定案項目（補充）

7. 文章頁狀態優先序：`full > partial > cache > loading`
8. 看板頁狀態優先序：`full > partial > cache > loading`
9. partial screen parser 的 header 格式：在 progressive render 實作前先在真站確認 PTT 文章前幾行格式穩定性
10. PTT 搜尋結果翻頁：與一般看板列表相同，採逐步載入（scroll sentinel 觸發繼續抓下一批）
11. 推噓分篩選 UI：輸入框 + 預設快選（≥10、≥30、≥100、爆）並存，輸入框允許手動輸入任意數字（PTT 內建篩選，非前端 filter）

---

## 主要風險

### 1. partial screen parser 需實測

**✅ 實測已完成（2026-04-12）。** PTT 文章 header 格式固定如下，ANSI 清理後可直接以行首關鍵字定位：

```
作者  <author> (<nickname>)                 看板  <board_name>
標題  [tag] <title>
時間  <DayOfWeek> <Mon> <Day> HH:MM:SS <Year>
─────────────────────────────────────────
<article body starts here>
```

- 三行 header 以「作者」「標題」「時間」開頭，位置固定
- 第 4 行為水平分隔線（─ 字元組成）
- body 從第 5 行開始，至第 24 行（終端機高度限制，底部為 status bar）
- 此格式在真站八卦板確認穩定，**風險 1 消除**。

### 2. redraw event 在 getArticle 期間的噪音

`redraw` event 在整個 session 都會觸發，不是只在讀文章時。需要在 adapter 層加 context flag，確認目前處於「文章讀取中」狀態，才把 redraw 內容當作 partial article 處理。

### 3. 看板 partial list parser 可能不穩定

看板列表畫面的 redraw 若沒有穩定 title bar、row 欄位或索引格式，partial parser 可能會比 article partial 更脆弱。若實測不穩，應直接放棄 parser，退回 board cache，不應硬撐。

### 4. cache 可能造成短暫陳舊資料顯示

cache 只適合用來縮短白畫面時間，不應讓使用者誤以為資料已是最新。因此 UI 不做複雜 merge，只做暫時顯示，live 資料一到就整塊覆蓋。

### 5. body 解析引入安全風險

掃描文章 body 並渲染圖片 / iframe，需嚴格限制白名單，避免 XSS 或任意資源載入。

### 6. 搜尋結果翻頁支援

PTT 看板搜尋是 server 端內建功能（按 `/` → 輸入關鍵字 → PTT 回傳篩選後的文章列表畫面），複雜度與 `listArticles()` 相近。

**✅ 實測已完成（2026-04-12）：**

1. 搜尋結果格式與一般看板列表相同 → 現有 parser 可直接沿用
2. PgUp / PgDn 在搜尋結果視圖中均可正常翻頁
3. 文章 index 為 board-wide 流水號 → `beforeIndex` 分頁邏輯可直接沿用，不需為搜尋模式實作獨立分頁
4. title bar 由「看板《X》」變為「系列《X》」，與篩選模式相同
5. 搜尋 `/`、篩選 `Z`、一般看板三種模式結果視圖格式完全相同，adapter 可統一複用同一套 parser 與翻頁邏輯

**結論：風險 4 消除。搜尋與篩選的 adapter 實作複雜度與 `listArticles()` 相當。**
