# Goal 3／7 投票與回文模型對齊 Implementation Notes

## 基準

- Primary contract: `dev-notes/goal-7-vote-model-review.html`（25 cases）
- Supporting requirements: `dev-notes/spec.md` Goal 3／7
- Baseline: 26 test files、344 tests passed

## 已確認的現行差異

1. 現行流程先依作者聚合再解析 reply，會混合不同結構目標。
2. `推x樓 body／噓x樓 body` 會計票但不會掛成巢狀回覆。
3. vote regex 沒有樓號後邊界，`推12樓主` 會誤判。
4. 聚合群組的 `anchorOrder` 被更新為最後續行，與首次出現排序不符。
5. 文章分數從已顯示卡片計算，漏掉隱藏控制事件及巢狀 PTT 推噓類別。
6. 真／fake adapter 的回文投票仍使用 PTT 推／噓類別，而規格要求中立類別。
7. 目前沒有解析回文投票撤回及 Append／Replace／Withdraw 歷史。
8. UI 阻擋第三層繼續回覆，與「超過三層提升到第三層」不符。

## 實作決策

- 所有 regex 只解析行首，樓號後採明確 delimiter。
- 原始 PTT type 與內容 intent 是獨立軌道。
- 編輯 payload 只作為文字，不重新進入 intent parser。
- 純控制事件不參與可見內容聚合。
- 同作者、同結構目標、時限內且上一段可續接時才聚合；無前綴續行繼承該群組目標。
- 回覆聚合卡任一 `sourceFloor` 都映射到同一卡片。
- 文章原生 score 直接統計所有 raw push type；文章按鈕只呈現純文章投票的應用層狀態。
- HTML 與 `spec.md` 文字衝突時採 HTML；因此 `噓x樓 body` 為扣分加可見巢狀回覆。

## 實作紀錄

### Parser／reducer

- 聚合前先解析 `plain`、`reply`、`reply-vote`、`article-vote`、投票撤回與編輯 intent。
- `推／噓x樓 body` 同時建立巢狀回覆與回文投票；body 不再遞迴解析。
- 編輯指令只改有效 body；原始結構目標、投票方向、可見性與聚合依據保持不變。
- 發言 Withdraw 會移除該原始事件的 body 與投票；回文投票 Withdrawal 只清除匹配方向的票並保留 body。
- 文章原生分數與 raw PTT 類別統計從所有原始推文計算；回文票與文章應用層票分別用 reducer 還原。
- 聚合 key 納入結構目標，保留首次 `anchorOrder` 與所有原始 `sourceFloors`；第四層以上回覆提升至第三層顯示。

### Adapter／UI

- 真實與 fake adapter 的回文投票固定以 `neutral` 送出；撤回格式為 `撤回我對x樓的推／噓`。
- 文章投票再次操作時，以相反的 PTT 推噓類別送出純 `推／噓` 來抵銷原生分數。
- Article 使用解析器回傳的文章投票者、raw 類別統計與原生分數，不再從可見卡片反推。
- PushThread 顯示 `1–2F`、`1、3F` 等原始來源樓號，並使用解析後的 server-side 編輯歷史。
- UI 不再禁止第四層回覆；仍送出被點擊卡片的原始樓號，由 parser 套用三層顯示上限。

### HTML cases 覆蓋

- CASE 01–12：一般留言、巢狀回覆、純文章投票、純回文投票、去重、最後方向及兩條分數軌道。
- CASE 13–15：opaque Replace、文章／回文投票撤回、最大巢狀深度。
- CASE 16–20：終止符與 `||`、複合投票回覆、delimiter、目標限定續行、控制事件隔離。
- CASE 21–25：改票保留 body、兩種撤回、三層聚合、交錯作者／原始樓號映射與首次出現排序。
- 另補 Append opaque payload、range Withdraw 作者限制、編輯後標點不得回溯改變聚合。

### 驗證

- TDD red phase 曾確認複合回覆、delimiter、交錯聚合及不同結構目標在舊實作中失敗。
- Fake PTT 瀏覽器流程確認：回文投票與撤回只新增 `→`，文章原生分數不變；文章投票以反向原生推噓抵銷；控制事件不顯示；desktop／390px mobile 均無水平 overflow，console 無 error。
- 未對真實 PTT 執行任何寫入。

## 保留限制

1. 五分鐘與終止符聚合仍是 heuristic；跨年時間差沿用既有近似算法。
2. 多原始樓層的聚合卡若被多次分別編輯，history 目前保留準確的原始／最終聚合版本；單一樓層則保留每次版本。
3. 正式 PTT 的 neutral 回文投票及反向文章投票尚未做真帳號 smoke test，僅有 adapter 契約、fake 流程與自動測試。
