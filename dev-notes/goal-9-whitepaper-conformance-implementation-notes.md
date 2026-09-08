# Goal 9 白皮書一致性實作紀錄

## 狀態

Task 1–9 已完成並通過完整驗證。變更保留在 `feature/goal-9-core-architecture`，依使用者要求尚未 merge。

## 實作發現

- 提案文章推噓、PTT 原生推噓與回文推噓已拆成三個資料域。可見嵌套回覆與純回文推噓不計入提案文章推噓，但其原始 PTT 類別仍保留於原生統計。
- 核心保存完整回覆深度與原始目標；web 介面透過 `displayReplyTo` 將第四層以後提升到第三層顯示，不改變 `replyId` 或核心目標。
- 隱藏控制事件會切斷前後文字聚合。
- 回文編輯已支援補充、替換、撤回與零起點半開區間 `[start,end)`；公開介面傳遞結構化範圍，官方 browser 使用 core internal 共用 formatter 產生控制文字。
- Web 介面使用核心 `VoteSummary` 呈現真實總數，不再由目前登入者狀態偽造總票數。
- `expectedCommand` 現在是可執行契約：fixture runner 透過公開 `PttzzzClient` 驗證回文推噓、撤回、補充、替換、區段修改與同方向重複抑制。
- 回文推噓與撤回格式已收斂到 core internal 共用 formatter；browser transcript 另驗證控制文字只格式化一次。
- 文章本文編輯只傳送更新正文，不要求自訂摘要；發送端保留簽名、既有舊版摘要與 PTT 原生 `※ 編輯:` 紀錄，且不再新增 `※ PTTzzz 編輯摘要`。
- 滿行判定依 PTT `recommend()` 的輸入容量計算：從 78 欄配置扣除 lead、日期、時間、IP 與實際作者欄，再扣除 `getdata()` 字串結尾所需的一欄。Parser 保存 `remainingContentColumns`；少於兩欄、已塞不下一個全形中文字時才直接拼接，aggregation 對舊 `isFullWidthLine` 僅保留相容 fallback。
- `parsePushBuffer` 插入黏連推文分隔時不再重寫作者欄，避免第一筆推文的 padding 遺失。
- Web rich-content 支援任意 HTTPS 主機上的 `.png`、`.jpg`、`.jpeg`、`.gif`、`.webp` 直接圖片網址；載入失敗仍退回原始連結。

## 邊界與保留項目

- Core 保有完整嵌套結構、原始目標與穩定 `replyId`；最多三層只屬於參考 web 介面的 `displayReplyTo` 投影。
- 公開寫入只接受 `replyId` 與結構化區段修改；raw floor/range 僅存在於 core private target map、`PttCommand` 與 browser transport。
- 控制文字由 `@pttzzz/core/internal` 共用 formatter 管理，第三方 UI 不應自行拼接；browser 仍負責 terminal 畫面定位、按鍵與送出結果判定。
- Public DTO 暫時保留 `score`、`viewerVote` 等 deprecated scalar aliases，以及參考 UI 的相容 view model；權威資料為 `VoteSummary`，相容欄位不得重建或偽造投票者名單。
- Core 的目前使用者回文投票快取以文章讀取結果建立，寫入成功後更新，失敗則回復；文章重載、session 變更與 disconnect 會清除相關狀態。
- 真站 terminal prompt 仍可能因 PTT 畫面改版而漂移；CI 以 transcript、fake gateway 與 isolated package smoke 驗證，不會對真站執行寫入。

## 驗證

- `@pttzzz/core`：321 tests passed。
- `@pttzzz/browser`：155 tests passed。
- `@pttzzz/web-example`：197 tests passed。
- package smoke helper：11 tests passed。
- `npm test`、`npm run build`、`npm run lint`、`npm run verify` 與 `git diff --check` 全部通過；lint 維持既有 3 個 Fast Refresh warnings、0 errors，Vite 維持既有 large chunk warning。
