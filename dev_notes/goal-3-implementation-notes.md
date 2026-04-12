# 目標 3 回文討論串實作筆記

這份文件記錄目標 3 回文解析與討論串 UI 這波實作的主要決策、踩坑與目前狀態。規則設計本身以 [`goal-3-implementation-plan.md`](/Users/linbangqi/pttzzz/dev_notes/goal-3-implementation-plan.md) 為準；本文件偏向實作摘要與 debug 紀錄。

---

## 目前完成狀態

已完成：

- 將 PTT raw push 轉成聚合後 reply model
- 支援同作者臨近回文聚合
- 支援 `回x樓` 類型的巢狀回覆
- 支援原始 PTT 樓號 `rawFloor` 與聚合後 reply id 的對應
- 支援 OP 標籤
- 支援文章編輯紀錄區塊
- 支援作者透過文章編輯插入的特殊 reply node
- 支援回文卡片式 UI
- 支援巢狀 reply 顯示
- 支援回文 score 顯示
- 回文 IP 目前直接顯示在作者 id 右側

主要資料流：

1. `ptt-client` 取得文章 raw lines
2. parser 清理 ANSI / backspace artifact
3. parser 抽出 raw push、文章編輯紀錄、作者編輯補充文字
4. aggregator 做同作者聚合、`回x樓` 掛靠、score 計算
5. UI 只渲染 adapter 給出的 thread model，不再自行判斷語意

---

## 回文聚合規則實作摘要

目前同作者回文聚合採單向掃描。

同作者的下一則回文會聚合到最近的同作者群組，條件是：

- 前一段結尾不是回文終止符
- 或前一段結尾有串接符號 `||`
- 若兩段不連續，中間隔了其他作者回文，還需時間間隔不大於 `k=5` 分鐘

目前終止符：

- `。`
- `.`
- `!`
- `?`
- `！`
- `？`
- `;`
- `；`

`||` 是控制符：

- 放在回文末端
- 可覆蓋終止符，強制與後續同作者回文合併
- 聚合輸出時會移除，不顯示在 UI

塞滿單行不再是聚合必要條件，只影響聚合後的顯示接法：

- 前一段若是滿行，下一段直接接在同一行後方
- 前一段若不是滿行，下一段保留為同一 reply block 內的新行

---

## 滿行判斷踩坑

一開始用固定 byte 門檻判斷推文是否塞滿：

- 先前假設 PTT 推文內容區約 45 bytes
- 後來在實站看到像 `新聞：專家：「跑山獸的存在」讓7.5億消` 這種約 37 bytes 的內容，視覺上已經貼近 IP 欄
- 固定門檻會誤判為未滿，導致下一行沒有直接接續

目前做法：

- parser 在 `RawPush` 上標記 `isFullWidthLine`
- 判斷依據是原始 PTT 行中 content 到 IP / time 欄前的 spacing、content 近似 byte 長度、以及整列可見寬度
- aggregator 優先使用 `isFullWidthLine`
- 若 raw push 沒有 metadata，才 fallback 到近似 byte 長度

目前實作細節：

- `content` 到 IP 欄前的 padding 很短時，視為滿行
- `content` 近似 Big5 byte 長度達滿行門檻時，視為滿行
- `推/噓/→ + 作者 + 冒號 + content` 的整列可見寬度接近 IP 欄時，也視為滿行
- 第三點是為了處理長作者 ID：作者欄吃掉更多半形欄寬時，content 本身 byte 數可能不高，但實際上已經只剩一個半形 buffer，塞不進下一個中文字

這個設計的原因：

- 真實 content 欄寬不是看板固定值
- 會受到作者 ID 長度、IP 顯示、時間欄、字寬影響
- parser 最接近原始行格式，最適合判斷「視覺上是否貼到欄位邊界」

### 2026-04-12：IP 欄前 padding 稍寬但內容已滿行

實站 case：

```txt
推 CMCC: 函釋是在說明可以列入，懂嗎？ 而非限制必須    42.73.44.229 04/12 08:43
→ CMCC: 列入，因為政治獻金有稅法上優勢，所以釋法     42.73.44.229 04/12 08:43
```

問題：

- 舊判斷只看 content 欄位到 IP 欄前的 trailing spaces 是否小於等於 3。
- 這類行雖然視覺上已經滿行，但 IP 前可能仍有 4 個以上 padding spaces。
- parser 會標成 `isFullWidthLine: false`，aggregator 因此在聚合後保留換行。

目前做法：

- parser 滿行判斷改為兩個條件任一成立即可：
  - IP 前 padding 很短
  - content 近似 Big5 byte 長度已達滿行門檻
- 這讓「視覺上已滿但 padding 稍寬」的實站推文仍能正確標為滿行。

### 2026-04-12：長作者 ID 會吃掉內容欄寬

實站 case：

```txt
推 alisabonsai: 候選人在選舉的時候只想要曝光換選       49.216.90.142 04/12 08:24
→ alisabonsai: 票 會想要肖像權換鈔票的還是首見          49.216.90.142 04/12 08:24
```

問題：

- `候選人在選舉的時候只想要曝光換選` 的 content 近似 Big5 byte 長度只有 32。
- 若只看 content byte 長度，會低於固定滿行門檻。
- 但 `alisabonsai` 作者 ID 較長，`推 alisabonsai:` 本身會吃掉更多半形欄寬。
- 此時內容後方即使還有一個半形空間，也塞不進下一個中文字，所以使用者視覺上會把它理解為滿行切斷。

目前做法：

- 滿行判斷再加入整列可見寬度：
  - `推/噓/→ + 作者 + 冒號 + 內容`
- 當整列寬度接近 IP 欄且只剩約一個半形 buffer 時，也標記為 `isFullWidthLine: true`。
- 這比單純把 content byte 門檻調低更保守，因為短作者的短內容不會因此被誤判為滿行。

測試覆蓋：

- `parser.test.ts` 有 regression case 確認 CMCC 這類 IP 前 padding 稍寬的滿行會被標為 `isFullWidthLine: true`
- `parser.test.ts` 有 regression case 確認 `alisabonsai` 這類長作者 ID 造成內容欄變短時，也會被標為 `isFullWidthLine: true`
- `pushAggregator.test.ts` 既有 case 確認 `isFullWidthLine: true` 時，聚合後下一段會直接接續在同一行

---

## `回x樓` 與樓號語意

已定案：`回x樓` 的 `x` 指向原始 PTT 推文樓號，不是聚合後 UI 顯示序號。

原因：

- PTT 使用者說的「幾樓」是原始推文行序
- 聚合後若重新編號，會破壞原始 PTT 用法
- UI 若改排序或改折疊，不應改變 `回x樓` 的語意

目前每個聚合後 reply 會保留：

- `id`
- `sourceFloors`
- `replyTo`

解析流程：

1. raw push 先分配 `rawFloor`
2. 聚合時把 raw floor 收進 `sourceFloors`
3. 偵測 `回x樓` prefix
4. 找出哪個聚合 reply 的 `sourceFloors` 包含 `x`
5. 將目前 reply 掛到該 reply 的 `id`

支援的 prefix：

- `回x樓`
- `回xf` / `回xF`
- `TO xf`
- `TOxf`
- `reply to xf`
- `>>xf`

`x` 支援：

- 阿拉伯數字
- 常見中文數字

---

## `回x樓` 相關踩坑

### 自己回自己

問題：

- 如果某則回文內容是 `回2樓...`，而它自己的 `sourceFloors` 正好包含 `2`
- 舊邏輯會把 `replyTo` 設成自己的 id
- UI 會形成 self-cycle，該節點可能從 top-level 消失

目前保護：

- 目標不能是自己
- 目標的 `anchorOrder` 必須早於目前節點
- 不符合時維持第一層，且不移除原始 prefix

### 目標樓層不存在

目前行為：

- 維持第一層
- 不移除原始 prefix
- 不掛到任何父 reply 下

### `TO1f` 無空白格式

問題：

- 實站或測試中可能出現 `To1f`
- 舊 pattern 只接受 `TO 1f`

目前已支援：

- `TO1f`
- `TO 1f`

---

## UI 實作與踩坑

### 巢狀 reply 只顯示一層

問題：

- 資料層已經有二層以上 `replyTo`
- 但 `PushThread` 遞迴時只把第一層 children 傳下去
- grandchildren 沒有傳入，所以 UI 會漏顯示第二層以上回覆

目前做法：

- `PushThread` 建立 `childrenMap`
- `PushItem` 遞迴渲染時持續讀 `childrenMap.get(child.id)`
- 資料層可以任意深度
- UI 視覺縮排最多只增加到第 3 層

### 回文 IP 顯示

最初做法：

- IP 放在作者 hover tooltip

後來調整：

- IP 直接顯示在作者 id 右側
- 使用灰階小字降低干擾
- 不再依賴 hover，手機和截圖時也能看到

### 回文 score 顯示

資料層已經有 reply score：

- 子回覆 `push` 計 `+1`
- 子回覆 `boo` 計 `-1`
- `neutral` 不計分

UI 目前顯示：

- 正分：`推 +N`
- 負分：`噓 -N`
- 0 分不顯示

這個 score 綁在被回覆的聚合 reply 上，不綁在原始 raw push 上。

---

## OP 標籤踩坑

問題：

- 文章作者欄常是 `askz0 (askz0)`
- 推文作者欄是 `askz0`
- 若直接用完整字串比對，OP 標籤會漏掉

目前做法：

- aggregator 先把文章作者正規化成帳號 id
- 用帳號 id 比對 raw push author
- 作者編輯產生的特殊 reply node 仍標為 OP

---

## 作者編輯與編輯紀錄

目前拆成兩種資料：

- `ArticleEditRecord`
- `OpEditedReplySegment`

`ArticleEditRecord`：

- 由 `※ 編輯:` 行產生
- 顯示在文章正文下方、回文區塊之前
- 不參與 reply tree
- 不參與 score

`OpEditedReplySegment`：

- 指作者透過文章編輯實際插入到推文區中的補充文字
- 會變成特殊型別 `edit` reply node
- 掛到最靠近上方的 reply
- UI 用 `編` / `作者編輯` 做視覺區隔

踩坑：

- 不能把 `※ 編輯:` 自己當成作者回覆
- 真正要進 thread 的是作者新增的文字，不是編輯紀錄行
- 插入文字可能出現在兩則推文之間，也可能和下一個 push marker 貼在同一行，需要保留 raw offset

---

## Debug dump

為了讓實站解析問題可以被重現，目前有 dev-only debug dump。

用途：

- 使用者在真站遇到漏推文、聚合錯誤、樓層錯誤時，可以輸出目前文章解析狀態
- 不需要直接交出完整帳號狀態或操作 PTT 寫入功能

dump 內容包含：

- boardName
- articleIndex
- title
- author
- rawLineCount
- firstLines
- lastLines
- parsedPushCount
- parsedLastPushes
- articleNoteCount
- articleNotes
- bottomStatusLine

這波多數 parser / aggregator 修正都靠 debug dump 定位。

---

## 已驗證測試

目前這波主要覆蓋：

- `parser.test.ts`
- `pushAggregator.test.ts`
- `adapter.test.ts`
- `PushThread.test.tsx`
- `LoginModal.test.tsx`
- `usePttSocket.test.ts`

常用驗證命令：

```bash
pnpm vitest run src/lib/ptt/__tests__/parser.test.ts src/lib/ptt/__tests__/pushAggregator.test.ts src/lib/ptt/__tests__/adapter.test.ts src/components/__tests__/PushThread.test.tsx
pnpm vitest run src/hooks/__tests__/usePttSocket.test.ts src/components/__tests__/LoginModal.test.tsx
pnpm exec vite build
```

目前 build 仍會有 Vite chunk size warning，屬既有 bundle size 問題，和本次 thread model 修正無直接關係。

---

## 目前仍需注意

- 聚合規則仍是 heuristic，不可能完整理解所有 PTT 使用者語意
- `isFullWidthLine` 依賴 raw line spacing，若 PTT 顯示格式改變需要重測
- `ptt-client.getArticle()` 是否完整讀到所有推文，仍需靠更多真站 dump 驗證
- 目前所有 PTT 操作仍應維持只讀，不應加入發文、推文、回文等危險操作
- 如果未來要支援回文排序，例如最新回覆在最上方，`rawFloor` 與 `anchorOrder` 必須繼續保留，不能只依 UI 排序重建 thread
