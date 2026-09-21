# pttzzz 實作概況

回文失敗指引：送出前的字數超限、不支援字元、連線及文章狀態問題以可選 `replyIssue` 傳至 UI；保留草稿並提供具體修正方式或唯讀重新載入，不自動重送。

Goal 14 第二階段已實作串流接收、儲存提示分類、分段回顯確認、正文限定編輯與明確 AID 導覽。本機可變編號採 AID 分頁錨點；失效時重新載入列表。本機六段長回文讀回逐字一致，跨頁編輯保留回文；正式站以既有快照回歸，未實站寫入。詳見 [第二階段實作筆記](goal-14-implementation-notes.md#第二階段串流與操作相容性)。

Goal 14 本機環境：Vite `/ptt-ws` 代理支援 loopback Telnet 與正式 PTT WebSocket，以 `dev:local`／`dev:ptt` 切換；`dev` 依設定選擇、預設本機，失敗不轉正式站。帳密僅保存於忽略提交的根目錄 `.env.local`。推文確認與分段依目標採本機無空格、正式站一格空白的格式，讀回解析依原文判斷；代理與格式回歸測試納入 `npm test`。詳見[使用設定](../apps/web/docs/local-ptt.md)與[實作紀錄](goal-14-implementation-notes.md)。

Goal 11 長回文：規則 0.3.0 使用 `|`／`_`、非連續兩分鐘，保留舊 `||`／`|!` 讀取相容。browser 從取消的確認畫面量測容量，以 UAO 編碼規劃並由真正核心預驗證，再逐段核對確認畫面與送達證據；續送只從未送片段開始，unknown 不重送。Web 輸入整份草稿並保留目前文章窗格的進度。編輯內容與原始尾標解析分離，避免字面符號被移除。詳見 [長文設計](goal-11-multipart-reply-design.md)、[規則對齊計畫](goal-11-multipart-rules-update-plan.md) 與 [實作紀錄](goal-11-multipart-reply-implementation-notes.md)。

Goal 11 可驗證文章工作階段：browser 完整讀文後可私下保留經 key、作者、標題與終端 snapshot 核對的文章畫面；推文型命令驗證成功便直接重用，否則沿用既有定位／重開／AID 與身分檢查。搜尋結果的相對編號必須先取得 canonical AID 才可寫入；連線版本在正文與確認前後持續核對，送出後無法證明回到同篇文章時回傳 `uncertain`。session 狀態不進入 `@pttzzz/core` 公開契約。

Goal 11 推文安全：入口依延遲 terminal prompt 嚴格轉移並記錄不含正文的語意 action trace；neutral 意外落入原生推／噓框會取消並停止，不降級、不自動重送。自動測試只使用 fake gateway 與 transcript，沒有真實 PTT 寫入。

本階段 Task 5 準備已通過 browser 262 項測試與 root build；最終 root `npm run verify`、commit、merge、push 均尚未執行。

Goal 11 推文入口：browser 支援選單後空白推文欄位及作者直接加註，開發模式提供輸入前的本機終端診斷；保留失敗停止、不自動重送的行為。

Goal 11 終端圖形：預格式化／原始本文使用 DBCS 欄寬，常用框線與色塊按格繪製以維持表格對齊；總回覆包含巢狀可見回文，第一層討論數另列。

Goal 11 漸進閱讀：載入中的本文與完整本文共用格式化呈現，保留色碼、排版選擇與媒體節點，避免純文字預覽切換到完整版時的格式閃動。

Goal 11 色碼讀取：browser 從 terminal.js 屬性還原文章 SGR，core 去除標頭時保留本文色碼，讓既有原始排版／閱讀配色能收到作者上色資訊；不改動預設字體與頁面主題。

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
- Goal 10：`推樓上`、`噓樓上` 與 `回樓上：內容` 固定指前一原始樓號，無效目標保留文字且不向上猜測；已聚合來源映射到完整卡片。詳見 [Goal 10 紀錄](goal-10-implementation-notes.md)。

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

Goal 11 首頁與看板支援任意方向鍵啟用選取、Z 自訂推文門檻，body 與區域鍵盤事件分工避免雙觸發；首頁登出呼叫目前 client.disconnect，清除登入記憶體並使用明確已登出畫面。

Goal 11 閱讀樣式預設繼承網站，僅投影作者明確 ANSI 樣式為可讀色盤；表格／ASCII 才預設等寬，手動原始排版恢復終端色彩。登入中斷保留 closed 並提示可能的重複連線上限，不自動踢除其他連線。

Goal 11 閱讀呈現：完整文章以安全 ANSI SGR 分段保留色彩，量測原文自然行寬後依容器自動採原始行寬或換行；可手動鎖定原始排版並局部橫捲。媒體固定另列，不改核心解析規則。

Goal 11 格式階段：core/browser/Web 0.3.0 新增獨立 ArticleTextStyle 範圍，支援文章高亮與 8 種前景色；browser 驗證後以編輯器控制序列傳送，Web 選字預覽且格式納入防重複寫入指紋。規則層維持 0.2.x，既有 ANSI 樣式的閱讀／重編輯 round-trip 尚未提供。

Goal 11 後續：Web 文章統計合併為核心校正票數操作列；首頁加入空間方向鍵導覽，文章 X／R 與看板 Ctrl+P 僅開啟既有編輯器。browser 最新頁讀取重新定位終端，舊頁排除重疊／置底並推進游標；useBoard 同步請求鎖與 generation 保護刷新、載入更多及快取重驗證。詳見 [Goal 11 實作紀錄](goal-11-implementation-notes.md)。

Goal 11 分頁完整性：browser 較舊頁導航改為等待可觀察進展，停滯是可重試錯誤而非列表終點；browser-private article batch 明確回報 `exhausted`。Web 合併後一律依置頂與文章索引排序，暫時載入錯誤保留游標並提供重試。PTT 列表日期只有月日，UI 以索引呈現權威順序，不推測年份；完整限制見 core contracts 與 [Goal 11 實作紀錄](goal-11-implementation-notes.md)。

Goal 11 長回文欄寬修正：core 共用容量計算扣除正文固定分隔空白；browser 以實測容量核對讀回格式，送出前經實體文字解析與聚合逐字驗證，避免 sender 自填剩餘欄數掩蓋 receiver 差異。實錄七段回文納入離線回歸；本輪未重新連線 PTT。

Goal 14 全形縮排修正：長回文分段、終端送出與讀回保留內部全形空白；補原文、指定樓層及多種容量回歸。完整驗證的既有白皮書覆蓋缺口記於 Goal 14 實作筆記，未實站送出。

- [Goal 9 architecture design](goal-9-core-architecture-design.md)
- [Goal 9 implementation plan](goal-9-implementation-plan.md)
- [Goal 9 implementation notes](goal-9-implementation-notes.md)
- [Code architecture guide](code-architecture-guide.md)
- [Public contracts](../packages/core/docs/contracts.md)
- [Core development guide](../packages/core/docs/DEVELOPMENT_GUIDE.md)
- [Core whitepaper](../docs/whitepaper/pttzzz-core.md)
