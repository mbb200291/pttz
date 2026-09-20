import { useEffect, useRef, useState } from "react";
import { canUseShortcut } from "../lib/keyboardNavigation";

const shortcuts: Record<string, { title: string; keys: [string, string][] }> = {
  home: { title: "首頁", keys: [["S", "輸入看板名稱"], ["Enter", "進入輸入的看板"], ["Esc", "離開輸入框"]] },
  board: { title: "看板", keys: [["↑ / ↓", "選擇文章"], ["→", "閱讀選中的文章"], ["S / /", "搜尋標題或 #AID"], ["Enter", "套用搜尋"], ["Esc", "離開搜尋框"], ["Z", "設定推文數門檻"], ["Ctrl+P", "發表文章"], ["←", "返回首頁"]] },
  article: { title: "文章", keys: [["X", "推文／留言"], ["Y / R", "回應文章"], ["←", "返回看板"]] },
};

export function ShortcutHelp({ page }: { page: string }) {
  const context = shortcuts[page === "article-by-aid" ? "article" : page];
  const [openPage, setOpenPage] = useState<string | null>(null);
  const open = openPage === page && Boolean(context);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (open) {
        if (event.key === "Escape" && !event.isComposing && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          setOpenPage(null);
        }
      } else if (context && event.key.toLowerCase() === "h" && canUseShortcut(event, false, document.body)) {
        event.preventDefault();
        setOpenPage(page);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, context, page]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || !context) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-5" onClick={(event) => {
    if (event.target === event.currentTarget) setOpenPage(null);
  }}>
    <section role="dialog" aria-modal="true" aria-label="快捷鍵" className="w-full max-w-md rounded-2xl border p-6 shadow-2xl" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)", maxHeight: "85vh", overflowY: "auto" }}>
      <header className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">快捷鍵 <span className="ml-2 text-sm font-normal" style={{ color: "var(--text-muted)" }}>{context.title}</span></h2>
        <button ref={closeButton} type="button" aria-label="關閉快捷鍵" onClick={() => setOpenPage(null)} className="rounded px-2 py-1 text-sm" style={{ color: "var(--text-muted)" }}>Esc ×</button>
      </header>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
        {context.keys.concat([["H", "查看快捷鍵"]]).map(([key, action]) => <div key={key} className="contents">
          <dt><kbd className="rounded border px-2 py-1 font-mono text-xs" style={{ borderColor: "var(--border)" }}>{key}</kbd></dt><dd>{action}</dd>
        </div>)}
      </dl>
    </section>
  </div>;
}
