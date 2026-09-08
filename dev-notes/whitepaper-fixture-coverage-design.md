# 白皮書 Fixture 細則覆蓋設計

## 目標

讓 `docs/whitepaper/pttzzz-core.md` 中每一條有編號的規則細則，都有至少一個會執行真實核心解析器的 fixture 案例。白皮書是規則來源；fixture 是可機器驗證的例子，兩者不得各自漂移。

## 檔案配置

沿用 `docs/fixtures/thread-events/schema.json` 與既有 runner，將案例依白皮書大項拆成六份：

```text
docs/fixtures/thread-events/
├── raw.json
├── merge.json
├── thread.json
├── vote.json
├── edit.json
├── op.json
└── schema.json
```

既有 `aggregation.json`、`nested-replies.json`、`votes-and-edits.json` 的案例移入對應檔案；不再保留重複來源。若既有案例已能驗證細則，只補上細則引用；只有缺少行為邊界時才新增案例。

## 細則代號

白皮書規則標題維持 `MERGE-001` 等 Rule ID。標題下的第一層編號細則依順序形成 `MERGE-001.1`、`MERGE-001.2` 等細則代號。

Fixture 增加：

- `primaryRule`：案例主要驗證的單一細則代號。
- `rules`：案例同時依賴或驗證的所有細則代號，必須包含 `primaryRule`。
- `expectedCommand`：需要驗證發送端時，描述應產生的 PTT 類別與內容，或應被阻止的操作。

同一案例可以支援多條細則，但案例名稱與 expected 必須讓 `primaryRule` 的行為能獨立辨識。無法讓某條細則單獨失敗的案例，不算該細則的有效覆蓋。

## 覆蓋檢查

Fixture runner 從白皮書擷取所有 Rule ID 與其第一層編號細則，並驗證：

1. 每個白皮書細則至少出現在一個 fixture 的 `rules`。
2. 每個 fixture 引用的細則都存在於白皮書。
3. `primaryRule` 必須存在且包含於 `rules`。
4. 案例 ID 在六份檔案間不得重複。
5. 六份檔案名稱與其中規則前綴相符，例如 `merge.json` 只以 `MERGE-*` 作為 `primaryRule`。
6. 所有案例仍以現有 `aggregatePushes`、`aggregateThreadSnapshot` 或 `normalizeThreadEvents` 執行並比較完整 expected；不建立第二套解析器。

解析案例由現有核心 runner 執行。`expectedCommand` 本階段只接受 schema 與完整性驗證，留給後續核心實作測試直接消費；不得為了讓 thread runner 通過而偽造解析結果。最大顯示深度等介面策略不進入核心 fixture，另由 `apps/web/docs/fixtures/` 保存介面層案例。

## 本階段交付

本階段只建立完整的規格案例，不要求目前核心實作符合案例。依白皮書逐條寫出輸入與規範期望值，不能為了讓現有測試通過而改寫 expected。

本階段完成條件：

- schema 驗證通過；
- 白皮書細則雙向覆蓋通過；
- 六份 fixture 都能被 runner 載入；
- 每個案例都具有完整、可人工審查的輸入與 expected；
- 產出一份目前實作與 fixture 的通過／失敗清單。

核心行為測試可以因新 fixture 而失敗。失敗案例保留作為後續實作工作的待辦與驗收依據，不在本階段修正 production code。

區段修改依本次產品決策採用從 `0` 起算、左含右不含的 `[start, end)` 範圍；空範圍表示插入、空替代文字表示刪除，因此不需增加另一套插入指令。

## 範圍限制

- 除了本次已確認的區段索引語意與介面顯示深度分層，不另行擴張白皮書規則。
- 不為 fixture 新增依賴或產生器。
- 不以 snapshot 取代具名 expected。
- 若 fixture 揭露實作不符合白皮書，保留能失敗的案例；核心行為留待後續工作修正，不把 expected 改成錯誤現況。
