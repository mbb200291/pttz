/** Stateful terminal boundary: editing mutates a file, saving publishes it. */
export function editableTerminal(initial: string[], savePrompt: string, saveKey: string) {
  let stored = [...initial];
  let buffer = [...initial];
  let editing = false;
  let row = 0;
  let info = false;
  const board = ["看板《Test》", "[←]離開 [→]閱讀", "    123     9/20 alice        □ test"];
  let screen = board;
  const sent: string[] = [];
  return {
    sent,
    file: () => [...stored],
    getCursor: () => ({ x: 0, y: Math.min(row, 22) }),
    getLines: async () => [...stored],
    getLine: (i: number) => ({ str: editing
      ? i === 23 ? `編輯文章 (^X/^Q)離開 ║插入│ ${row + 1}: 1` : buffer[Math.max(0, row - 22) + i] ?? ""
      : screen[i] ?? "" }),
    enterBoardByName: async () => { screen = board; return true; },
    send: async (key: string) => {
      sent.push(key);
      if (key === "E") { editing = true; buffer = [...stored]; row = 0; }
      else if (key === "\x18") { editing = false; screen = [savePrompt]; }
      else if (key === saveKey) { stored = [...buffer]; screen = [...stored, "瀏覽 第 1/1 頁 (100%)"]; }
      else if (editing) {
        if (key === "\x1b,") row = 0;
        else if (key === "\x1b[B") row = Math.min(buffer.length - 1, row + 1);
        else if (key.startsWith("\x19")) buffer.splice(row, key.length);
        else if (key.endsWith("\r")) { buffer.splice(row, 0, key.slice(0, -1).replace(/\x15\[/gu, "\x1b[")); row++; }
      } else if (key === "Q") { info = true; screen = ["文章代碼(AID): #1AbCd (Test)"]; }
      else if (key === "q") { screen = info ? [...stored, "瀏覽 第 1/1 頁 (100%)"] : board; info = false; }
      else if (key === "a\r" || key === "n\r") screen = board;
      else if (key === "123\r\r" || key === "#1AbCd\r") screen = [...stored, "瀏覽 第 1/1 頁 (100%)"];
      return true;
    },
  };
}
