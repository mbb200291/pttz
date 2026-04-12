# 目標 5：使用者頭像實作規劃

## 目的

這份文件把 [`spec.md`](spec.md) 目標 5 的規則整理成可實作的設計與限制說明：

- 哪些規則可以直接做
- 哪些規則需要先定義細節或繞道
- 哪些規則有根本性的技術限制
- 目前架構需要哪些延伸

---

## spec 原文解讀

> 能設定圖像，將頭像連結放在第三方圖片託管平台，實際可以用於顯示在發文和回文，將該圖片的連結放在個人名片區，顯示時需及時讀取該資訊

拆解為以下子需求：

1. 使用者能在第三方圖片平台（imgur）上傳並取得圖片連結
2. 使用者能把該連結存放在自己的 PTT 個人名片（名片區）
3. PTTzzz 在顯示文章作者 / 回文作者時，讀取對方名片並抽出頭像連結
4. 將頭像顯示在文章列表作者欄、文章 header、回文列表中

---

## 已定案的使用者決策

| 項目 | 決定 |
|------|------|
| 第一版範圍 | 只做顯示面，設定面（在 PTTzzz 內編輯名片）列後續 |
| 頭像顯示位置 | 文章列表作者欄、文章 header、回文列表 |
| 圖床來源 | 第一版只接受 imgur.com，後續透過設定 UI 擴充 |
| 快取策略 | in-memory 快取，session 內永遠有效，不持久化 |

---

## 可實作性結論

整體可實作，但有三個根本性限制：

### 限制 1：ptt-client 無讀取名片 API，名片讀取會佔用主連線 queue

`ptt-client` v0.9.0 完全沒有 `getUserCard()` 或任何讀取名片的方法。

更關鍵的是，adapter 所有操作（`listArticles`、`getArticle`、`disconnect`）共用同一條 serial queue，任何 `getUserCard()` 請求都會排進同一條 queue。若使用者按「重新整理回文」時有大量 avatar 請求在 queue 中等待，refresh 要等全部 avatar 跑完才能執行——這會使主要操作感覺卡頓。

adapter 也沒有「儲存目前位置 → 查名片 → 還原位置」的機制，導航後狀態不可靠。

**第一版的因應方式**：

- avatar 請求在 queue 中設為低優先級；使用者主動觸發的操作（getArticle、listArticles）一律比 avatar 請求先執行
- 每篇文章最多排入 N 個 avatar 請求（第一版建議 20），超過上限的作者不抓名片，避免 queue 汙染
- 每個作者只抓一次（快取命中直接跳過），快取 null 結果也不重複抓

**第二版選項**：開獨立第二條 PTT 連線專門查名片，不影響主連線 queue。但同帳號登入第二次會觸發 PTT 的「踢掉其他連線」提示，目前 adapter 沒有處理這個情境，需要額外設計。

### 限制 2：「設定圖像」需要寫入名片

把頭像連結寫進名片，需要進入名片編輯介面輸入文字並儲存，屬於寫入型操作。

第一版不做設定面，使用者自行在 PTT 用戶端（如 PttChrome、批踢踢實業坊 App）編輯名片後，PTTzzz 讀取顯示。

### 限制 3：快取對使用者的 loading 影響

快取對使用者體驗是必要的，不是可選的。

不快取時：每次顯示文章都重新抓所有作者名片，100 個作者 × 200–500ms = 數十秒 loading。

有快取時：每個作者只在「本 session 第一次遇到」時打一次 PTT，結果存在 memory。同 session 再次遇到同作者無需等待。主要 loading 只發生在第一次看到某作者的那一刻，以懶加載方式呈現，不阻塞主畫面。

---

## 核心設計原則

### 1. 名片作為頭像連結的載體

PTT 名片是使用者可自由編輯的文字頁面。

約定格式：名片中放入一行包含頭像 URL 的標記：

```
avatar: https://i.imgur.com/xxxxxxx.jpg
```

parser 掃描名片文字，抽出第一個符合格式的 URL。

格式規則：

- 行首關鍵字：`avatar:`、`頭像:`、`圖像:`（大小寫不拘，冒號前後可有空白）
- URL 必須以 `https://i.imgur.com/` 開頭（第一版只接受 imgur）
- 若多行都符合，只取第一個

### 2. 懶加載 + in-memory 快取

不在文章載入時預先抓所有作者名片。

流程：

1. 渲染回文時，發現某作者沒有快取
2. 觸發非同步請求讀取該作者名片（排入 low-priority queue）
3. 快取結果，包括「名片中無頭像」的 null 結果
4. 有結果後更新 UI（頭像從 fallback 換成圖片）

快取 key 為作者帳號（去除暱稱後的純 ID）。

### 3. 只做顯示面

第一版只讀取、解析、顯示頭像。使用者自行在 PTT 用戶端設定名片。

後續目標：在 PTTzzz 內提供引導 UI（開啟 imgur 上傳頁、貼入連結、自動寫進名片）。

### 4. 圖床來源：imgur only（第一版）

只接受 `https://i.imgur.com/` 開頭的 URL，避免第三方任意圖源的安全與穩定性風險。

選擇 imgur 的原因：

- PTT 圈最常用圖床，使用者熟悉度最高
- 支援 hotlink（可直接用 `<img src>` 顯示）
- 匿名上傳免帳號，門檻低
- URL 格式固定：`https://i.imgur.com/<id>.<ext>`

注意事項：

- imgur 無帳號上傳的圖片若 6 個月無流量可能被刪除
- 建議在後續設定 UI 引導使用者用 imgur **帳號**上傳，較穩定

### 5. 圖片安全性

- `<img>` 加上 `referrerpolicy="no-referrer"`
- 圖片載入失敗時（`onError`）切換為文字 fallback（作者 ID 首字圓形 badge）
- 預設顯示 fallback，圖片載入成功後替換

---

## 技術設計

### 1. adapter 層：讀取名片

在 `src/lib/ptt/adapter.ts` 新增方法：

```ts
getUserCard(username: string): Promise<string | null>
```

- 回傳使用者名片的原始文字（ANSI 清理後）
- 使用者不存在或名片空白則回傳 `null`
- 使用 `this.runSerial()` 排入 serial queue，與其他操作序列化
- 在 teardown 路徑確保能回到安全頁面狀態

具體導航序列需實測。PTT 從一般頁面查詢使用者名片的常見路徑：進入使用者查詢介面 → 輸入帳號 → 讀取名片頁畫面 → 返回。

### 2. parser：抽出頭像 URL

在 `src/lib/ptt/parser.ts` 或獨立的 `avatarParser.ts` 新增：

```ts
function parseAvatarUrl(cardText: string): string | null
```

- 掃描名片文字，找第一個符合格式的行
- 支援的格式：`avatar: <url>`、`頭像: <url>`、`圖像: <url>`（大小寫不拘）
- URL 必須以 `https://i.imgur.com/` 開頭（第一版）
- 先做 ANSI 清理再掃描

### 3. 快取與懶加載 hook

新增 `src/hooks/useAvatarCache.ts`：

```ts
function useAvatarCache(): {
  getAvatar: (username: string) => string | null | undefined;
  fetchAvatar: (username: string) => void;
}
```

- `undefined`：尚未請求或請求中
- `null`：已請求，名片中無頭像 URL
- `string`：已取得頭像 URL

快取使用 module-level Map 存放，React state 驅動 re-render。

對同一個 username：
- 若快取已有結果（含 null），直接回傳，不重複發請求
- 若請求中，不重複觸發

### 4. 優先級控制

`fetchAvatar()` 排入 adapter queue 前，先確認：

- 目前 adapter 是否 idle（無其他操作在 queue 中）
- 若 adapter 正忙，延遲到 idle 後才排入

實作方式：在 `fetchAvatar()` 加入 `requestIdleCallback`（或 `setTimeout(fn, 0)` fallback）後再呼叫 `getUserCard()`，讓主要操作有機會先執行。

每篇文章最多排入 20 個 avatar 請求，超過上限的作者顯示 fallback，不抓名片。

### 5. UI 元件

新增 `AvatarImage` 元件：

```tsx
<AvatarImage username={push.author} size={32} />
```

- 呼叫 `useAvatarCache()` 取得 URL
- 若 URL 存在，渲染 `<img referrerpolicy="no-referrer" />`
- 圖片載入失敗（`onError`）時切換為文字 fallback
- 若 null 或 undefined，渲染文字 fallback（作者 ID 首字的圓形 badge）
- mount 時觸發 `fetchAvatar(username)`

顯示位置：

- `PushItem`：回文作者左側
- 文章 header：文章作者旁
- `ArticleList`（`ArticleRow`）：文章列表作者欄

---

## 實作順序

### 階段 1：名片導航序列確認

- 實測 PTT 終端機從一般頁面查詢名片的完整指令序列
- 確認 teardown 路徑能安全返回
- 實作 `getUserCard(username)`

### 階段 2：parser 與快取

- 實作 `parseAvatarUrl(cardText)`
- 加單元測試（各種名片格式、無 URL、非 imgur URL 應回 null）
- 實作 `useAvatarCache`

### 階段 3：UI 整合

- 實作 `AvatarImage` 元件
- 整合進 `PushItem`、文章 header、`ArticleRow`
- 確認 fallback 行為與圖片尺寸一致性

---

## 未定案項目

1. **名片導航序列**：確切的 PTT 終端機指令序列，需實測確認
2. **快取失效策略**：第一版 session 內永遠有效；是否要加 TTL 或手動刷新，待觀察真站行為後決定
3. **idle 等待實作方式**：`requestIdleCallback` vs `setTimeout(fn, 0)` vs adapter 暴露 isIdle 狀態

---

## 主要風險

### 1. PTT 名片導航破壞 adapter 狀態

讀取名片需要 adapter 暫時導航到其他頁面，若中途失敗，adapter 可能停在非預期畫面。

需要在 `getUserCard()` 的錯誤路徑確保能返回安全狀態，並整個操作與其他命令序列化。

### 2. avatar 請求塞住 queue

即使加了「低優先級」和「最多 20 個」的保護，若使用者在 20 個 avatar 請求完成前按「重新整理回文」，refresh 仍需排隊。

第一版可接受這個限制，使用者可以等 avatar 請求完成。第二版若問題明顯，再評估獨立連線方案。

### 3. 名片格式無規範

PTT 名片是純文字，parser 只能做 heuristic 掃描。ANSI 顏色碼、複雜排版都可能干擾。確保 ANSI 清理在 URL 抽取之前完成。

### 4. imgur 圖片穩定性

無帳號上傳的 imgur 圖片可能因無流量被刪除。`onError` fallback 是必要的安全網。
