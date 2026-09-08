# Whitepaper Fixture Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將白皮書每一條第一層編號細則轉成可執行、可人工審查的 fixture，依 RAW、MERGE、THREAD、VOTE、EDIT、OP 分檔。

**Architecture:** 白皮書仍是規則來源。Fixture 使用 `RULE-000.N` 細則代號與 `primaryRule` 描述案例目的；Vitest runner 負責 schema、雙向覆蓋與實際核心輸出比較。這階段不修改 production code，實際輸出不符合白皮書的案例允許維持紅燈並列入差異清單。

發送端細則以選用的 `expectedCommand` 表達；本階段驗證其資料契約，不新增第二套命令實作。最大顯示深度等介面策略另存於 `apps/web/docs/fixtures/`，不放進核心 fixture。

**Tech Stack:** Markdown、JSON Schema draft 2020-12、TypeScript、Vitest、既有 `aggregatePushes` fixture runner。

---

### Task 1: 建立細則級 fixture 契約

**Files:**
- Modify: `docs/fixtures/thread-events/schema.json`
- Modify: `packages/core/src/whitepaperFixtures.test.ts`

- [x] **Step 1: 先寫會失敗的契約測試**

在 `FixtureCase` 加入 `primaryRule: string`，把規則格式改為 `^(RAW|MERGE|THREAD|VOTE|EDIT|OP)-[0-9]{3}\.[0-9]+$`。新增測試驗證缺少 `primaryRule`、`primaryRule` 不在 `rules`、不存在的細則與跨檔錯誤都會失敗。

- [x] **Step 2: 執行紅燈測試**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts`

Expected: FAIL，因既有 fixture 沒有 `primaryRule`，且 runner 尚未辨識細則代號。

- [x] **Step 3: 最小修改 schema 與白皮書細則擷取**

Schema case required 改為：

```json
"required": ["id", "primaryRule", "rules", "articleAuthor", "rawPushes", "expected"]
```

Runner 從每個 `#### RULE-000` 區段擷取第一層 `1.`、`2.` 條目，形成 `RULE-000.1`。只解析第一層編號，不把縮排中的格式範例當成新細則。

Schema 另加入選用：

```json
"expectedCommand": { "action": "vote-reply", "pushType": "neutral", "content": "推12樓" }
```

被發送端阻止的操作使用 `{ "action": "vote-reply", "suppressed": true, "reason": "duplicate-direction" }`。

- [x] **Step 4: 確認測試只剩 fixture 資料缺失**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts`

Expected: FAIL，錯誤明確指出舊 fixture 缺少 `primaryRule` 或舊 Rule ID 格式無效。

### Task 2: 將既有案例依大項拆檔

**Files:**
- Create: `docs/fixtures/thread-events/raw.json`
- Create: `docs/fixtures/thread-events/merge.json`
- Create: `docs/fixtures/thread-events/thread.json`
- Create: `docs/fixtures/thread-events/vote.json`
- Create: `docs/fixtures/thread-events/edit.json`
- Create: `docs/fixtures/thread-events/op.json`
- Delete: `docs/fixtures/thread-events/aggregation.json`
- Delete: `docs/fixtures/thread-events/nested-replies.json`
- Delete: `docs/fixtures/thread-events/votes-and-edits.json`
- Modify: `packages/core/src/whitepaperFixtures.test.ts`

- [x] **Step 1: 建立六份空陣列並切換 imports**

Runner 只載入六個新檔，並以 `{ name, prefix, cases }` 保存來源檔資訊；檢查 `primaryRule` 必須符合該檔前綴。

- [x] **Step 2: 執行紅燈覆蓋測試**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts`

Expected: FAIL，列出全部未覆蓋白皮書細則。

- [x] **Step 3: 搬移既有案例**

保留既有輸入與 expected，依主要語意搬入新檔並改用細則代號。`PARTIAL-001` 不屬目前白皮書細則，從這組 fixture 的 `rules` 移除；既有 staged incomplete/final 資料保留作案例資料。

- [x] **Step 4: 驗證 JSON 與唯一 ID**

Run: `jq empty docs/fixtures/thread-events/{raw,merge,thread,vote,edit,op}.json`

Expected: PASS。

### Task 3: 補齊 RAW 與 MERGE 細則案例

**Files:**
- Modify: `docs/fixtures/thread-events/raw.json`
- Modify: `docs/fixtures/thread-events/merge.json`

- [x] **Step 1: RAW-001.1～RAW-001.6**

案例分別驗證：所有原始事件占樓、`x樓/xF` 原始定位、合併來源樓號、隱藏不重編、UI 卡序非樓號、控制事件不可見。需要結構欄位時使用 `expectedNormalizedEvents`，避免新增第二套 expected 格式。

- [x] **Step 2: MERGE-001.1～MERGE-003.3**

案例分別驗證：同作者同目標、連續超時仍合併、不連續五分鐘、各切斷條件、終止符、`||` 越過終止符並隱藏但不放寬其他條件、滿行直連、未滿換行，以及拼接判斷不影響分群。

- [x] **Step 3: 執行 fixture suite 並記錄差異**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts`

Expected: schema 與 coverage 通過；行為比較可 PASS 或因實作差異 FAIL。

### Task 4: 補齊 THREAD 與 OP 細則案例

**Files:**
- Modify: `docs/fixtures/thread-events/thread.json`
- Modify: `docs/fixtures/thread-events/op.json`
- Modify: `docs/fixtures/thread-events/schema.json`
- Modify: `packages/core/src/whitepaperFixtures.test.ts`

- [x] **Step 1: THREAD-001.1～THREAD-004.2**

覆蓋所有回覆格式、合法邊界、移除格式、不遞迴、推噓加文字的雙重效果、純推噓隱藏、續行繼承與不同目標切斷、原始 target 保留及顯示深度不改定位。

- [x] **Step 2: 增加 OP fixture 輸入**

Schema 與 `FixtureCase` 增加選用 `opEditedReplies`，欄位對應既有 `OpEditedReplySegment`：

```json
{
  "marker": "作者編輯",
  "content": "作者補充",
  "rawBlock": "作者補充",
  "contentAnchorOffset": 250,
  "markerOffset": 250
}
```

Runner 將它作為 `aggregatePushes` 第三個參數，不修改核心。

- [x] **Step 3: OP-001.1～OP-002.5**

覆蓋同作者 OP 標示、大小寫、標示不改其他語意，以及文章編輯片段的嵌套、最近前方目標、不占 raw floor、無目標時不生成回覆。

- [x] **Step 4: 執行 fixture suite 並記錄差異**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts`

Expected: schema 與 coverage 通過；行為比較可 PASS 或 FAIL。

### Task 5: 補齊 VOTE 細則案例

**Files:**
- Modify: `docs/fixtures/thread-events/vote.json`

- [x] **Step 1: VOTE-001.1～VOTE-002.7**

覆蓋純文章推噓辨識與隱藏、文章語意票排除回文票、PTT 原生類別獨立計分；三種回文推噓格式、邊界誤判、純票隱藏、帶文字嵌套、內容方向優先、系統中立類別。

- [x] **Step 2: VOTE-003.1～VOTE-005.5**

覆蓋一人一票、同向去重、最後方向、外部客戶端重複；相符與不相符撤回、中立控制事件與隱藏；文章推／噓反向抵銷、抵銷後第三票，以及每筆 PTT 類別仍計入原生分數。

- [x] **Step 3: 執行 fixture suite 並記錄差異**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts`

Expected: schema 與 coverage 通過；行為比較可 PASS 或 FAIL。

### Task 6: 補齊 EDIT 細則案例

**Files:**
- Modify: `docs/fixtures/thread-events/edit.json`

- [x] **Step 1: EDIT-001.1～EDIT-001.5**

覆蓋同作者限制、三種補充格式、四種替換格式、原始樓號定位，以及合併回文中被編輯片段與完整來源關係。

- [x] **Step 2: EDIT-002.1～EDIT-002.5**

以白皮書規範 expected 表達從 `0` 起算、左含右不含的插入／刪除／替換、單區段、多區段、共同基準、不透明結果與外層一般編輯指令。即使目前 parser 尚未支援，案例仍保留紅燈。

- [x] **Step 3: EDIT-003.1～EDIT-004.4**

覆蓋單樓／範圍撤回、同作者限制、不可見、樓號保留、單空格；只解析外層、各編輯結果不透明，以及不改變原 reply/vote target。

- [x] **Step 4: 執行 fixture suite 並記錄差異**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts`

Expected: schema 與 coverage 通過；未實作規則可維持 FAIL。

### Task 7: 完整性驗證與差異清單

**Files:**
- Modify: `packages/core/src/whitepaperFixtures.test.ts`
- Create: `docs/fixtures/thread-events/README.md`

- [x] **Step 1: 將 schema／coverage 與 behavior 測試分成獨立 describe**

讓 `--testNamePattern "fixture contract"` 可單獨證明 fixture 本身完整，即使 behavior conformance 仍有紅燈。

- [x] **Step 2: 寫 fixture README**

說明六份檔案、細則代號、`primaryRule`、如何執行 contract 與完整 behavior 測試，以及紅燈代表實作尚未符合白皮書而非應修改 expected。

- [x] **Step 3: 執行 contract 驗證**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts --testNamePattern "fixture contract"`

Expected: PASS，所有白皮書細則雙向覆蓋。

- [x] **Step 4: 執行完整 conformance 並整理結果**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts`

Expected: 保存完整 PASS/FAIL 案例清單；不修 production code。

- [x] **Step 5: 靜態驗證**

Run: `git diff --check`

Expected: PASS。

- [x] **Step 6: 提交 fixture 工作**

```bash
git add docs/fixtures/thread-events packages/core/src/whitepaperFixtures.test.ts dev-notes/whitepaper-fixture-coverage-implementation-plan.md
git commit -m "test: cover whitepaper rule details with fixtures"
```
