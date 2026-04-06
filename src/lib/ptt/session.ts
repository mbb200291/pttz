/**
 * PTT Session 狀態機
 *
 * 追蹤目前 terminal 所在的位置（登入畫面、主選單、看板列表、文章列表、文章內）
 * 以及自動化登入流程。
 */

export type SessionState =
  | "login_prompt"    // 等待輸入帳號
  | "password_prompt" // 等待輸入密碼
  | "terms_prompt"    // 同意條款
  | "main_menu"       // 主選單
  | "board_list"      // 看板列表
  | "article_list"    // 文章列表（在某個看板內）
  | "article"         // 閱讀文章
  | "unknown";

export interface DetectResult {
  state: SessionState;
  isAtBottom: boolean; // 是否已到文章/列表底部
}

/**
 * 從 terminal raw buffer 判斷目前狀態
 * PTT 的 terminal 輸出有特徵字串可辨識
 */
export function detectState(raw: string): DetectResult {
  // 移除 ANSI codes 再比對
  const plain = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

  let state: SessionState = "unknown";

  if (plain.includes("請輸入代號") || plain.includes("Login:")) {
    state = "login_prompt";
  } else if (plain.includes("請輸入您的密碼") || plain.includes("Password:")) {
    state = "password_prompt";
  } else if (plain.includes("您同意遵守本站的規則與使用條款")) {
    state = "terms_prompt";
  } else if (plain.includes("【主功能表】") || plain.includes("主選單")) {
    state = "main_menu";
  } else if (plain.includes("文章選讀") || plain.includes("看板列表")) {
    state = "board_list";
  } else if (
    plain.match(/\d+\s+\w+\s+\d+\/\d+/) && // 文章列表格式
    !plain.includes("文章內容")
  ) {
    state = "article_list";
  } else if (plain.includes("─────────────────")) {
    // 推文分隔線，表示在文章內
    state = "article";
  }

  const isAtBottom =
    plain.includes("(END)") || plain.includes("100%") || plain.includes("瀏覽結束");

  return { state, isAtBottom };
}

/**
 * 根據目前狀態回傳要送出的自動化指令（訪客登入）
 */
export function getLoginCommand(state: SessionState): string | null {
  switch (state) {
    case "login_prompt":
      return "guest\r";
    case "password_prompt":
      return "\r";
    case "terms_prompt":
      return "y\r";
    default:
      return null;
  }
}
