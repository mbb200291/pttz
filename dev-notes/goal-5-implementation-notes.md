# 目標 5 使用者頭像實作筆記

這份文件記錄目標 5 的評估過程與結論。規則設計討論以 [`goal-5-implementation-plan.md`](goal-5-implementation-plan.md) 為準；本文件偏向決策摘要與 pending 原因。

---

## 目前狀態

**Pending。** 原始方案（將頭像 URL 存放於 PTT 名片）評估後可行性不足，替代方案確定但優先級較低，等待後續排程。

---

## 原始方案評估：PTT 名片作為頭像 URL 載體

### 方案描述

在 PTT 個人名片中放入約定格式的頭像 URL（如 `avatar: https://i.imgur.com/xxx.jpg`），PTTzzz 讀取名片並解析 URL 顯示頭像。

### 為什麼放棄

**根本問題是名片讀取速度。**

`ptt-client` 沒有讀取名片的 API，需在 adapter 層自行實作 PTT 終端機導航序列（約 4 次 round-trip）。每次名片 query 估計耗時 400ms–1.2s，20 個不同作者需 8–24s 才能全部抓完，是 `getArticle()` 本身的 5–10 倍。

此外，adapter 所有操作共用一條 serial queue，大量 avatar 請求會佔住 queue，影響使用者主動操作（如重新整理回文）的回應速度。雖然可用 `requestIdleCallback` 延遲排入緩解，但根本速度問題無解。

開獨立第二條 PTT 連線可以解決 queue 佔用問題，但速度仍是 400ms–1.2s / 人，且需處理同帳號 duplicate login 觸發的「踢掉其他連線」提示，實作複雜度高。

**結論：名片方案的速度上限太低，放棄。**

---

## 確定的替代方案：Cloudflare Workers + KV

### 方案描述

架一個極簡 API：

- `GET /avatar/:ptt_id` → 回傳該 PTT ID 對應的頭像 URL
- `PUT /avatar/:ptt_id` → 使用者設定自己的頭像 URL（需驗證身分）

資料存放於 Cloudflare KV，以 PTT ID 為 key，頭像 URL 為 value。

PTTzzz client 查頭像時直接打這個 API，速度 < 100ms，完全解決名片方案的速度問題。

### 為什麼選這個方案

- 速度快（HTTP request，< 100ms），頭像可接近即時顯示
- 使用者可自助設定，不需要開 PR 或依賴第三方
- Cloudflare Workers + KV 有免費方案，不需要自己維運 server
- 以 PTT ID 為 key，查詢方式直觀
- 圖片本身仍存放於第三方圖床（imgur），API 只存 URL

### 與目標 2 的關係

目標 2 定義為「伺服器只提供前端靜態 serving，由 client side 直接打 PTT websocket」。Cloudflare Workers 不算傳統意義的 server，算是邊緣函式，與目標 2 精神上有一定衝突但規模極小。此方案已是在純 client 端限制下最接近可行的選擇。

### 圖床來源

第一版只接受 imgur.com（`https://i.imgur.com/` 開頭），後續透過設定 UI 擴充其他來源。

選擇 imgur 的原因：PTT 圈使用率最高、支援 hotlink、匿名上傳免帳號。建議引導使用者用 imgur 帳號上傳（避免無帳號圖片因 6 個月無流量被刪除）。

---

## 身分驗證問題（尚未定案）

`PUT /avatar/:ptt_id` 需要確認請求者確實擁有該 PTT ID，否則任何人可以覆蓋別人的頭像。

驗證方式尚未設計，是進入實作前的主要未定案項目。這也是目前 pending 的原因之一。

---

## 前端顯示設計（與方案無關，可先定案）

無論後端方案，前端顯示邏輯是固定的：

- 以 PTT 作者帳號（去除暱稱後的純 ID）查頭像 URL
- 快取至 in-memory Map，session 內永遠有效
- 圖片載入失敗或無頭像時，顯示作者 ID 首字的圓形文字 badge（fallback）
- `<img referrerpolicy="no-referrer" />`
- 顯示位置：文章列表作者欄、文章 header、回文列表

---

## 待進入實作前需定案的項目

1. **身分驗證方案**：如何確認 PUT 請求者擁有該 PTT ID
2. **快取失效策略**：頭像更新後 client 端何時重新抓取
3. **圖床白名單擴充方式**：第一版 imgur only，後續是 hardcode 白名單還是設定 UI
