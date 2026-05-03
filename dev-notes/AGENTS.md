# Iteration

- 每次我會從spec.md推進一個目標，我會告知推進哪個目標
- 請不要修改spec.md，這個檔案僅限我能修改
- 請你開始推進哪個目標時，請你載dev-nodes下新增該目標的implement-plan，我和你會基於這個implementation node進行深入討論，來釐清spec實作細節和選擇。注意md書寫風格避免像是在和我對話，應該是中立語氣紀錄，並high-level陳述關鍵實作，
  並將規則近一步具體化
- 實作單一個目標的時候，請你把實作的一些坑和一些實作時才會遇到的細節記錄在implementation-notes
- 完成一次目標的時候，也請更新implementation.md，這個會用更高level去紀錄目前spec.MD中的列像的實作方法
- 請勿控制git修改行為，例如staging, commit或是rebase、cherry-pick等，你僅允許操作git讀取相關指令

## 開發意見

- 實際測試開發時，你可自行需測試的情境自行判斷該使用agent-browser或是hrome-devtools-mcp，但若情境兩個方法都可行，我希望你能優先使用agent-browser
- 實際使用瀏覽器測試時，請勾選踢除其他使用者
- 我會提供給你帳密用於測試，請注意除非我明確要求你，否則請勿做任何發文或回文的動作，和任何可能有風險的行為，尤其是切勿洩漏密碼
