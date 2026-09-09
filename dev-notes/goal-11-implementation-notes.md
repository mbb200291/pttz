# Goal 11 實作紀錄

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
