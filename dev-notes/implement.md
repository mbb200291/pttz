# pttzzz 實作概況

這份文件記錄目前 high-level 架構與能力；產品需求仍以 `spec.md` 為準，Goal 9 的詳細決策見 [goal-9-implementation-notes.md](goal-9-implementation-notes.md)。

## 產品定位

pttzzz 是直接連接 PTT WebSocket 的現代網頁閱讀器。它將原始 PTT 推文解析成聚合、巢狀、可投票與可追蹤編輯歷史的討論串，同時保留 PTT terminal 的操作限制與不確定性。

## 目前架構

```text
apps/web (React 18 + Zustand + Vite)
        │ public DTO / Result / events / replyId writes
        ▼
@pttzzz/core
  PttzzzClient、contracts、parser、aggregation、editing、vote model
        ▲ PttGateway
        │
@pttzzz/browser
  browser/fake gateways、private terminal driver
        │
    ptt-client → /ptt-ws proxy → PTT
```

| 路徑 | 責任 |
|---|---|
| [`packages/core`](../packages/core) | UI-independent domain core 與高階 client |
| [`packages/browser`](../packages/browser) | PTT browser transport、terminal workflows、Fake PTT runtime/testing entry |
| [`apps/web`](../apps/web) | 官方 React 參考 UI |
| [`docs/whitepaper`](../docs/whitepaper) | 規範性 rule IDs 與核心語意 |
| [`docs/fixtures`](../docs/fixtures) | machine-readable conformance cases |
| [`packages/core/docs`](../packages/core/docs) | public contracts 與 AI integration guide |
| [`apps/web/docs/examples/minimal-browser`](../apps/web/docs/examples/minimal-browser) | 可 typecheck、bundle、執行的替代 UI 範例 |

Core 不依賴 React、Zustand、DOM、WebSocket、storage 或 `ptt-client`。一般 UI 只使用 `@pttzzz/core` 與 `@pttzzz/browser` package roots；`@pttzzz/core/internal` 僅保留給官方 browser adapter，第三方 UI 不得使用。

## 資料與操作模型

- Goal 11 第一階段：Web 列表增加焦點限定的箭頭導覽與回程焦點，正文可切換保留原始排版；PTT 格式編輯仍待後續實作。詳見 [Goal 11 紀錄](goal-11-implementation-notes.md)。
- Goal 10：`推樓上` 與 `回樓上：內容` 固定指前一原始樓號，無效目標保留文字且不向上猜測；已聚合來源映射到完整卡片。詳見 [Goal 10 紀錄](goal-10-implementation-notes.md)。

- 白皮書與 fixtures 固定推文聚合、巢狀回覆、投票、撤回、編輯與 partial semantics。
- 投票分成提案文章推噓、未經語意排除的 PTT 原生推噓，以及各回文推噓三個資料域；可見嵌套回覆與純回文推噓只從提案文章推噓排除。
- UI 只以 stable `replyId` 操作回覆。Core 在 private target map／`PttCommand` 中解析 exact source floor/ranges，gateway transport執行目標；原始樓號不作畫面 identity，只能另出現在 opt-in debug metadata。
- Core 保留任意深度的原始回覆關係；參考 web UI 將第四層以後投影到第三層顯示，但不改寫核心 `replyTo` 或操作目標。
- 回文區段修改以結構化零起點半開區間傳入；回覆、推噓、撤回與編輯控制文字由 core internal formatter 統一產生，browser 只負責 terminal workflow。
- `PttzzzClient` 的 read methods 回傳 `Result`，partial/final article 同時以 monotonic revision events 通知。
- 所有 expected failures 都使用 `CoreError`；write 額外分成 `not-sent`、`sent` 與 `uncertain`，後兩者不得自動重送。
- Real 與 fake gateway 共用 contract tests。`@pttzzz/browser/testing` 同時支援 reference app 的 Fake PTT runtime mode 與 tests，不污染 core runtime。
- Reference UI 的 board/article hooks 與全部 writes 已改用 public client；舊 adapter compatibility runtime 與舊 source paths 已移除。

## Host 要求

Browser bundler 目前必須提供 `Buffer`。開發、preview 與 production host 都必須提供同源 `/ptt-ws` WebSocket proxy，轉送至 `wss://ws.ptt.cc/bbs` 並注入 `Origin: https://term.ptt.cc`。可複製設定見 [minimal browser example](../apps/web/docs/examples/minimal-browser)。

## 常用指令

```bash
npm run dev       # apps/web + /ptt-ws proxy
npm test          # core + browser + web tests
npm run build     # packages + web production build
npm run lint
npm run verify    # tests + helper tests + build + lint + pack/example smoke
```

預覽模式：`?preview=home`、`?preview=board`、`?preview=article`、`?preview=login`。Fake PTT 模式仍可用 `?mockPtt=1&mockUser=alice` 測多帳號讀寫。

## 已完成能力

- 真實 PTT WebSocket connect/login/disconnect 與安全的重複登入選項。
- 熱門／最愛／分類看板、文章分頁、搜尋、篩選、AID 讀取與 progressive article；熱門來源使用 PTT `TopBoards` 入口，並由公開 `Board` DTO 提供可取得的即時人數或原始人氣標記。
- 推文聚合、巢狀回覆、文章／回文投票、撤回、編輯歷史與 OP 標示。
- 發文、文章編輯／刪除、文章回覆、回覆某樓、回文投票及其撤回。
- Stable reply identity、stale generation/revision 防護、exact terminal targeting。
- `sent`／`uncertain` UI safety lock，避免模糊結果造成重複寫入。
- 任意 HTTPS 直接圖片／imgur／YouTube rich content、回覆排序與 lazy rendering。
- Fake gateway、共享 gateway contract suite、terminal transcript tests。
- 可發布 `@pttzzz/core@0.1.0` 與 `@pttzzz/browser@0.1.0`，以及 isolated `npm pack` consumer smoke。
- 人類／AI API 文件與可執行 minimal browser alternate UI。

## 目前限制

- 推文聚合仍是依時間、終止符、`||` 與 PTT 右側資訊欄剩餘空間判斷的 deterministic heuristic；原始欄距不可用時保守換行。
- `ptt-client` 與 terminal prompt 可能因真站畫面變動而需更新 transcript/parser。
- 真站 write 尚未成為 CI smoke；內容可能送出的錯誤必須維持 `sent`／`uncertain` 保守結果。
- `createArticle()` 成功只回 `void`，不承諾立即取得新文章 identity。
- Core per-article maps 在同一 session 內未設 eviction，disconnect 才全部清除。
- Article composer 的 editable body/footer split 是 reference UI projection，尚非 core public policy。
- Production bundle 有 large chunk warning；lint 有 3 個既有 Fast Refresh warnings，均無 build/lint error。

## 驗證狀態

2026-08-29：684 tests 通過（core 321、browser 155、web 197、pack helper 11）；build、lint（0 errors、3 個既有 Fast Refresh warnings）、package pack、isolated install、ESM/types、deep-import boundary 與 minimal UI execution smoke 通過。

## 細節文件

Goal 11 閱讀呈現：完整文章以安全 ANSI SGR 分段保留色彩，量測原文自然行寬後依容器自動採原始行寬或換行；可手動鎖定原始排版並局部橫捲。媒體固定另列，不改核心解析規則。

Goal 11 格式階段：core/browser/Web 0.3.0 新增獨立 ArticleTextStyle 範圍，支援文章高亮與 8 種前景色；browser 驗證後以編輯器控制序列傳送，Web 選字預覽且格式納入防重複寫入指紋。規則層維持 0.2.x，既有 ANSI 樣式的閱讀／重編輯 round-trip 尚未提供。

Goal 11 後續：Web 文章統計合併為核心校正票數操作列；首頁加入空間方向鍵導覽，文章 X／R 與看板 Ctrl+P 僅開啟既有編輯器。browser 最新頁讀取重新定位終端，舊頁排除重疊／置底並推進游標；useBoard 同步請求鎖與 generation 保護刷新、載入更多及快取重驗證。詳見 [Goal 11 實作紀錄](goal-11-implementation-notes.md)。

- [Goal 9 architecture design](goal-9-core-architecture-design.md)
- [Goal 9 implementation plan](goal-9-implementation-plan.md)
- [Goal 9 implementation notes](goal-9-implementation-notes.md)
- [Code architecture guide](code-architecture-guide.md)
- [Public contracts](../packages/core/docs/contracts.md)
- [Core development guide](../packages/core/docs/DEVELOPMENT_GUIDE.md)
- [Core whitepaper](../docs/whitepaper/pttzzz-core.md)
