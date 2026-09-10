# Goal 11 實作紀錄

## 原始文章顏色讀取修正

原始排版元件能呈現 SGR，但真實讀取路徑有兩個遺失點：terminal.js 的 `getLine().str` 是純文字，顏色另存於 `attr`；核心 `separatorBody` 移除標頭後，曾回傳 stripAnsi 後的本文。

browser 現在依 ptt-client 設定的 terminal.js DBCS 欄位屬性邊界還原 16 色前景／背景、粗體與反相，每行獨立重設，保留跨行繼承的樣式。欄位計算匹配上游 dbcswidth，而不是 JavaScript 字串索引或 Unicode wcwidth，避免中文後的局部上色錯位。不是從畫面文字猜測顏色，也不使用含游標的 HTML 輸出。標頭和空白行判斷仍使用純文字副本。core 僅在辨識標頭分隔線時移除 ANSI，輸出的本文保留色碼。

新增實際 terminal.js 模擬器的跨頁文章測試，涵蓋隊伍整行上色、比分局部上色及重疊頁去重；另驗證 16 色、黑底、重設、中文索引、跨行繼承，以及 core partial/final 與 LF/CRLF。未連線真實 PTT；舊快取需重新讀取文章才能取得顏色。未擴充 256 色或編輯 round-trip 支援。

2026-09-10 `npm run verify` 通過：core 374、browser 208、Web 291 項測試，11 項輔助測試、build、lint 與 package smoke。保留 3 個既有 lint warnings、bundle 大小及 Node 棄用警告。

## 鍵盤啟用與登出

首頁／看板任一方向鍵首次啟用選取，不直接執行開文／返回；Z 開啟自訂推文門檻，原生輸入與彈窗保持優先。具體事件回歸包括 body 焦點、scope 內空白、已有選取的單次移動與卸載清理。

首頁已登入狀態旁新增登出，使用現有 public client.disconnect，不送 PTT 踢人指令。成功後清除記憶體 credentials/recentBuffer/loginError，採獨立 logged_out 狀態呈現「已登出／重新登入」；若清理失敗則清除credentials但顯示未完成提示，避免宣稱成功。fake PTT 介面實測按登出後留在登出畫面，不自動重連。未使用真實 PTT 帳密。

2026-09-10 驗證：完整 verify core 372、browser 189、Web 289 與輔助 11、build/lint/package smoke 通過；補上兩項背景 autofocus 防穿透測試後，重跑全部 Web 291、build 與 lint 通過（3 個既有 warnings）。瀏覽器 preview=board 從 body 按 ArrowLeft 只選到 #30215、未返回；Z 開啟自訂門檻。LoginModal 新增 dialog 語意，所有鍵盤入口與自動focus均阻擋跨層彈窗。參考 [MDN focus](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus)；modern-web-guidance 缺少離線快取，改查官方文件。

## 網站閱讀樣式優先

保留 parser 原始終端 style，另以 authoredStyle 表示作者明確設定；SGR reset 與未指定顏色恢復網站繼承。預設無黑底框、一般文章採網站字體，作者顏色以深色網站可讀色盤映射。原始排版手動啟用才使用 raw style、黑底、等寬與固定行寬。多行表格／ASCII 以保守啟發式辨識，整篇採等寬，不承諾精準區塊辨識。新增明確設定／reset、樣式映射、表格判定與模式切換回歸測試。

最終完整 verify：core 372、browser 189、Web 270，含新增可讀調色盤 256 種前景／背景組合對比至少 4.5 的檢查；輔助 11、build、lint 與 package smoke 通過。離線瀏覽器確認普通文使用 Inter／Noto Sans TC 網站字體、容器背景 transparent，只有作者指定紅色的中段帶 rgb(242,139,130)，前後原文不指定色彩。既有寬度量測與手動鎖定測試持續通過。

## 保留其他連線後 closed 的排查

查核 [PTT 官方 mbbsd.c / multi_user_check](https://github.com/ptt/pttbbs/blob/961c62394f095762b554d394e2bce13e38b95c13/mbbsd/mbbsd.c#L379)：選 n 且 getotherlogin(3) 非空時，直接 abort_bbs；選 y 的刪除迴圈則以 getotherlogin(3) 為繼續條件，不保證清除全部其他連線。此行為可以解釋使用者描述，但沒有這次現場終端資料，不能斷言此次斷線就是達上限。未使用真站帳密、未踢除連線。

本地可重現缺陷：登入 Promise 在 wsStatus 已 closed 後完成，原 hook 仍會改為 ready 或 need_login。加入回歸測試與 guard 保留 closed 並清除記憶體 credentials。LoginModal 原本不呈現 closed，現在提供明確提示及重新整理入口；保留連線後中斷提示明示無法確認原因、可能為上限或網路問題，建議先自行關閉不用的連線，不自動重試或替使用者選擇踢除。重複登入確認畫面亦預告限制。

本次完整 verify（含同時進行的閱讀樣式）：core 372、browser 189、Web 269、輔助 11、build、lint（0 errors／3 既有 warnings）及 package smoke 通過。離線掛載 closed modal 確認提示可見，並補測修正 closed 誤顯示「連線中」的指示燈。未驗證真站斷線原因。

## 自適應 ANSI 正文

依使用者確認的規則調整：寬容器優先原文行寬，窄容器優先可讀性；兩者都解析顏色。AdaptiveArticleBody 使用絕對定位、隱藏、max-content 的同樣式正文量測，觀察其與容器的寬度並在字型就緒後重算。手動原始排版以 aria-pressed 明示，不被 resize 蓋過。CJK／全形字使用 2ch；特殊 emoji 與組合字不承諾完整終端格點還原。媒體固定另列，原文網址不移除。載入中輕量正文與重新編輯流程仍採原有純文字策略。

ANSI parser 採 SGR 白名單，OSC、游標控制等只移除、不執行；React 文字節點防止 HTML 注入。16 項 parser 測試與新增容器縮放／手動鎖定／顏色保留測試先 RED 再 GREEN。完整 verify：core 372、browser 189、Web 246、輔助 11；build、lint（0 errors／3 既有 warnings）、package smoke 通過。獨立唯讀審查未見重大安全或 resize 問題。

離線瀏覽器掛載實際 AdaptiveArticleBody 與彩色排名表：1280px 視窗容器 876px、原文約 491px，採 pre；390px 視窗容器 366px，採 pre-wrap 且頁面寬 390px。按原始排版後 pre、區塊 scrollWidth 491px，頁面仍 390px。未連線真 PTT。參考 [MDN ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) 與 [white-space](https://developer.mozilla.org/en-US/docs/Web/CSS/white-space)；modern-web-guidance CLI 缺少離線快取，改查官方文件。

## PTT 相容文字格式（0.3）

先合併本機 dev（e93e4ac），再新增發文／編輯／回應文章的獨立格式範圍。Core 與 browser 驗證 UTF-16 範圍、重疊、代理字元邊界、控制字元及大小；只接受高亮與前景色 30–37。browser 確認編輯器後以 Ctrl+U 插入受控 SGR，每段結尾重設。普通文字傳送維持原行為，無效格式不得產生終端寫入。

Compose 提供選字高亮、顏色、清除與安全 React 預覽；格式納入寫入指紋。預覽驗證失敗顯示錯誤並禁送，避免超長或含控制字元的草稿造成整頁崩潰。文字更動採最小差異調整範圍，不是完整富文字編輯模型。現有閱讀 UI 仍移除 ANSI，重新編輯由純文字開始，不承諾舊樣式 round-trip；核心正文資料本身仍可能保留 ANSI。

Core、browser、Web 升至 0.3.0；白皮書規則仍為 0.2.x，未改 spec 或 fixture。完整 verify：core 372、browser 189、Web 228，加上 11 項輔助測試，build、lint（0 errors，3 個既有 warnings）、package smoke 通過。獨立審查複驗相關 24 項測試通過，無 Important blocker。格式傳送由 fake 與終端 transcript 測試驗證，沒有真站發文／回文。手動瀏覽器只確認離線頁面可載入，未完成編輯器視覺驗收，不將其記為通過。

依 [PTT edit.c](https://github.com/ptt/pttbbs/blob/master/mbbsd/edit.c) 的 Ctrl+U 插入 ESC 行為實作；文字選取介面參考 [MDN textarea setRangeText](https://developer.mozilla.org/en-US/docs/Web/API/HTMLTextAreaElement/setRangeText)。

## 第一階段（歷史紀錄）

本階段僅修改 Web 介面：列表鍵盤導覽、返回焦點、正文空白保存與原始排版切換。PTT 格式編輯尚未實作，core/browser 契約與寫入格式不變。

## 實作取捨

共用 navigation helper 只處理帶明確資料標記的元素，↑↓ 只移焦點而不觸發網路讀取。保留原生按鈕 Enter/Space、Tab、輸入與文字選取。看板名稱改為獨立原生按鈕，不把最愛按鈕嵌入另一個按鈕。

Article 移除正文 trim；原始排版使用 pre 與局部 overflow-x，媒體另列，不引入 Markdown/table parser。React 的 text rendering 保持原文不被當成 HTML 執行。

## 驗證

`npm run verify` 通過：core 329、browser 168、Web 212 項測試，11 項輔助測試、build、lint 與 package smoke。保留既有 lint 與 bundle 大小／Node 棄用警告。

新增 helper、RichContent 與實際 ArticleList/BoardInput 整合測試，共 7 項。以本機 agent-browser 預覽驗證 ↓ 選到 30214、→ 開文、← 返回並恢復 30214 焦點；390px 視窗的原始正文使用 white-space:pre，頁面寬度維持 390px。未登入真 PTT。

參考 [W3C keyboard interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) 與 [MDN white-space](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/white-space)。modern-web-guidance CLI 因沒有離線快取無法使用，改查上述官方文件。

## 後續：統計整合、分頁與快捷鍵

文章移除重複原生統計列，既有 VotePair 與聚合後回覆數整合為同一操作列；保留權限、作者限制及原有送出流程，票數仍以核心 articleVotes 為準。

首頁採實際元素位置進行四方向導覽，Enter 沿用原生按鈕；首次聚焦僅在 body 持有焦點時進行。文章 X 開留言、R 開回應至看板，列表 Ctrl+P 開發文，全部只開啟既有編輯器。輸入、組字、dialog、文字選取與重複按鍵均排除。

本次另修改 browser 與 hook，不限於介面呈現：終端原本沿用分頁後的舊畫面，刷新沒有回到最新頁；重疊頁又可能回傳較新文章或置底，造成游標停滯。最新頁讀取須重新定位，舊頁依嚴格小於 beforeIndex 排除重疊與置底，游標取正常文章最小索引。hook 以同步 request ref 阻擋同一 tick 重複操作，generation 排除過期回應，刷新失敗／空頁保留原游標，快取等待重驗證時不誤報最舊。

瀏覽器使用本機 mockPtt，不登入真實 PTT。確認方向鍵選看板／Enter 進入、Ctrl+P 開發文、X 開留言、R 開回應，以及輸入文字不觸發快捷鍵；沒有實際送出文章或回文。文章預覽確認統計只保留一列。獨立程式碼審查指出篩選模式也需要最新頁定位，納入同一修正與回歸測試：同一搜尋條件分頁後刷新須回到最新結果，不重新疊加搜尋條件。

2026-09-09 最終 `npm run verify` 通過：core 329、browser 171、Web 222 項測試，加上 11 項輔助測試、build、lint（0 errors、3 個既有 warnings）及 package smoke。共新增 13 項測試；統計列既有測試亦改為檢查核心校正票數與單一操作列。保留既有 bundle 大小與 Node 棄用警告。審查複驗無未解決的 Critical／Important 問題。
