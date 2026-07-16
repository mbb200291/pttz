/**
 * ComposeScreen — full-page compose / edit-article screen
 *
 * mode="post"          → compose a new article
 * mode="edit-article"  → edit an existing article (requires editSummary)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RichContent } from "./RichContent";
import { uploadToImgur } from "../lib/imgur";
import {
  normalizeCategoryOptions,
  resolveBoardCategoryOptions,
} from "../lib/ptt/boardCategories";
import type { ArticleRevision } from "../lib/ptt/parser";

export type ComposeMode = "post" | "edit-article";

export interface ComposePayload {
  board: string;
  category: string;
  title: string;
  body: string;
  editSummary: string;
}

interface ComposeScreenProps {
  mode: ComposeMode;
  initial?: {
    board?: string;
    category?: string;
    title?: string;
    body?: string;
  };
  categoryOptions?: string[];
  currentUser?: string;
  revisions?: ArticleRevision[];
  submitting?: boolean;
  submitError?: string | null;
  onCancel: () => void;
  onSubmit: (payload: ComposePayload) => void;
}

/** Insert / wrap text in textarea at current selection */
function applyTextTransform(
  el: HTMLTextAreaElement,
  transform: (selected: string, before: string, after: string) => {
    text: string;
    selStart: number;
    selEnd: number;
  },
  setBody: (v: string) => void,
) {
  const value = el.value;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = value.slice(start, end);
  const { text, selStart, selEnd } = transform(selected, value.slice(0, start), value.slice(end));
  setBody(text);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(selStart, selEnd);
  });
}

export function ComposeScreen({
  mode,
  initial,
  categoryOptions,
  currentUser,
  revisions = [],
  submitting = false,
  submitError = null,
  onCancel,
  onSubmit,
}: ComposeScreenProps): JSX.Element {
  const [board, setBoard] = useState(initial?.board ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [editSummary, setEditSummary] = useState("");
  const [preview, setPreview] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [titleFocused, setTitleFocused] = useState(false);
  const [bodyFocused, setBodyFocused] = useState(false);
  const [editSummaryFocused, setEditSummaryFocused] = useState(false);

  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categories = useMemo(() => {
    const resolved = resolveBoardCategoryOptions(board, categoryOptions);
    const normalizedInitial = normalizeCategoryOptions(
      category ? [category, ...resolved] : resolved,
    );
    return normalizedInitial;
  }, [board, category, categoryOptions]);

  // Draft auto-save debounce
  useEffect(() => {
    if (draftTimerRef.current !== undefined) {
      clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = setTimeout(() => {
      setLastSavedAt(
        new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    }, 600);
    return () => {
      if (draftTimerRef.current !== undefined) {
        clearTimeout(draftTimerRef.current);
      }
    };
  }, [title, body]);

  const canSubmit =
    mode === "post"
      ? title.trim() !== "" && body.trim() !== ""
      : title.trim() !== "" && body.trim() !== "" && editSummary.trim() !== "";

  const handleSubmit = useCallback(() => {
    if (!canSubmit || submitting) return;
    onSubmit({ board, category, title, body, editSummary });
  }, [canSubmit, submitting, onSubmit, board, category, title, body, editSummary]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        handleSubmit();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, handleSubmit]);

  // Image upload
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const url = await uploadToImgur(file);
      const el = bodyRef.current;
      if (el) {
        const current = el.value; // live DOM value
        const start = el.selectionStart ?? current.length;
        const end = el.selectionEnd ?? current.length;
        const newBody = current.slice(0, start) + url + current.slice(end);
        setBody(newBody);
        requestAnimationFrame(() => {
          el.focus();
          const cursor = start + url.length;
          el.setSelectionRange(cursor, cursor);
        });
      } else {
        setBody((prev) => prev + url);
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "圖片上傳失敗，請稍後再試",
      );
    } finally {
      setUploading(false);
    }
  };

  // Toolbar action helpers
  const wrapSelection = (prefix: string, suffix: string, emptyPlaceholder: string) => {
    const el = bodyRef.current;
    if (!el) return;
    applyTextTransform(
      el,
      (selected, before, after) => {
        const inner = selected || emptyPlaceholder;
        const wrapped = prefix + inner + suffix;
        return {
          text: before + wrapped + after,
          selStart: before.length + prefix.length,
          selEnd: before.length + prefix.length + inner.length,
        };
      },
      setBody,
    );
  };

  const prefixLines = (prefix: string) => {
    const el = bodyRef.current;
    if (!el) return;
    applyTextTransform(
      el,
      (selected, before, after) => {
        const lines = selected || "";
        const prefixed = lines
          .split("\n")
          .map((l) => prefix + l)
          .join("\n");
        return {
          text: before + prefixed + after,
          selStart: before.length,
          selEnd: before.length + prefixed.length,
        };
      },
      setBody,
    );
  };

  const handleLinkToolbar = () => {
    const el = bodyRef.current;
    if (!el) return;
    applyTextTransform(
      el,
      (selected, before, after) => {
        const inner = selected ? `[${selected}](url)` : "[文字](url)";
        return {
          text: before + inner + after,
          selStart: before.length,
          selEnd: before.length + inner.length,
        };
      },
      setBody,
    );
  };

  const handleCodeToolbar = () => {
    const el = bodyRef.current;
    if (!el) return;
    applyTextTransform(
      el,
      (selected, before, after) => {
        const inner = selected || "code";
        const isMultiline = inner.includes("\n");
        const wrapped = isMultiline
          ? "```\n" + inner + "\n```"
          : "`" + inner + "`";
        return {
          text: before + wrapped + after,
          selStart: before.length,
          selEnd: before.length + wrapped.length,
        };
      },
      setBody,
    );
  };

  const charCount = body.length;
  const readingTime = Math.max(1, Math.ceil(charCount / 300));
  const titlePreview = category ? `[${category}] ${title}` : title;

  const toolbarBtnStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 7,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontFamily: "var(--font)",
    flexShrink: 0,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "var(--bg)",
        overflowY: "auto",
      }}
    >
      {/* Sticky topbar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "oklch(0.165 0.006 260 / 0.94)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            minHeight: 52,
          }}
        >
          {/* Left side */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                background: "transparent",
                border: 0,
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: 13,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 0",
                fontFamily: "var(--font)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              取消
            </button>
            <span
              style={{
                display: "inline-block",
                width: 1,
                height: 18,
                background: "var(--border)",
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-muted)",
                letterSpacing: "-0.01em",
              }}
            >
              {mode === "post" ? "撰寫" : "修改"}
            </span>
            {board && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  color: "var(--text-dim)",
                }}
              >
                · {board}
              </span>
            )}
          </div>

          {/* Right side */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {lastSavedAt && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  color: "var(--text-dim)",
                }}
              >
                草稿已存 {lastSavedAt}
              </span>
            )}
            <button
              type="button"
              onClick={() => setPreview((v) => !v)}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                padding: "7px 13px",
                borderRadius: 8,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "var(--font)",
              }}
            >
              {preview ? "編輯" : "預覽"}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              style={{
                background: "var(--accent)",
                color: "var(--accent-on)",
                border: "none",
                padding: "7px 13px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
                opacity: canSubmit && !submitting ? 1 : 0.45,
                display: "inline-flex",
                alignItems: "center",
                gap: 0,
                fontFamily: "var(--font)",
              }}
            >
              {mode === "post" ? "發文" : submitting ? "更新中…" : "更新"}
              <span
                aria-hidden="true"
                style={{
                  marginLeft: 4,
                  padding: "1px 6px",
                  borderRadius: 4,
                  fontSize: 10,
                  background: "oklch(1 0 0 / 0.18)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                ⌘↵
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 280px",
          gap: 32,
          maxWidth: 1180,
          margin: "0 auto",
          padding: "32px 24px 80px",
        }}
      >
        {/* Left column — editor */}
        <div>
          {submitError && (
            <div
              role="alert"
              style={{
                marginBottom: 18,
                padding: "10px 14px",
                border: "1px solid var(--boo-border)",
                borderRadius: 10,
                color: "var(--boo-fg)",
                background: "var(--boo-bg)",
                fontSize: 13,
              }}
            >
              {submitError}
            </div>
          )}
          {/* Board + category row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            {/* Board input styled as label chip */}
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-dim)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                看板
              </span>
              <input
                value={board}
                onChange={(e) => setBoard(e.target.value)}
                placeholder="名稱"
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--text)",
                  fontFamily: "var(--font)",
                  fontSize: 13,
                  fontWeight: 700,
                  outline: "none",
                  cursor: "text",
                  width: 80,
                  minWidth: 40,
                }}
              />
            </label>

            {/* Category label */}
            <span
              style={{
                fontSize: 11,
                color: "var(--text-dim)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              分類
            </span>

            {/* Category chips */}
            {categories.length > 0 ? (
              categories.map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(active ? "" : cat)}
                    style={{
                      padding: "5px 11px",
                      borderRadius: 7,
                      border: active
                        ? "1px solid var(--accent-border)"
                        : "1px solid var(--border)",
                      background: active ? "var(--accent-soft)" : "transparent",
                      color: active ? "var(--accent-ink)" : "var(--text-muted)",
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "var(--font)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {cat}
                  </button>
                );
              })
            ) : (
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="依看板規定輸入"
                aria-label="分類"
                style={{
                  width: 140,
                  padding: "6px 10px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text)",
                  fontSize: 13,
                  fontFamily: "var(--font)",
                  outline: "none",
                }}
              />
            )}
          </div>

          {/* Title input */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="標題"
            onFocus={() => setTitleFocused(true)}
            onBlur={() => setTitleFocused(false)}
            style={{
              width: "100%",
              padding: "16px 18px",
              background: "transparent",
              border: `1px solid ${titleFocused ? "var(--accent-border)" : "var(--border)"}`,
              borderRadius: 12,
              color: "var(--text)",
              fontSize: 24,
              fontWeight: 700,
              fontFamily: "var(--font)",
              letterSpacing: "-0.025em",
              outline: "none",
              marginBottom: 8,
              boxSizing: "border-box",
            }}
          />

          {/* Title preview */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              color: "var(--text-dim)",
              paddingLeft: 4,
              marginBottom: 18,
            }}
          >
            預覽標題:{" "}
            <span
              style={{
                color: "var(--accent-ink)",
                fontWeight: 700,
              }}
            >
              {titlePreview || "—"}
            </span>
          </div>

          {/* Markdown toolbar + body */}
          {!preview ? (
            <>
              {/* Toolbar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 10px",
                  background: "var(--surface)",
                  borderTop: `1px solid ${bodyFocused ? "var(--accent-border)" : "var(--border)"}`,
                  borderRight: `1px solid ${bodyFocused ? "var(--accent-border)" : "var(--border)"}`,
                  borderLeft: `1px solid ${bodyFocused ? "var(--accent-border)" : "var(--border)"}`,
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                }}
              >
                <button
                  type="button"
                  onClick={() => wrapSelection("**", "**", "粗體")}
                  style={{ ...toolbarBtnStyle, fontWeight: 700 }}
                  title="粗體"
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection("_", "_", "斜體")}
                  style={{ ...toolbarBtnStyle, fontStyle: "italic" }}
                  title="斜體"
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection("~~", "~~", "刪除線")}
                  style={{ ...toolbarBtnStyle, textDecoration: "line-through" }}
                  title="刪除線"
                >
                  S
                </button>

                {/* Separator */}
                <span
                  style={{
                    width: 1,
                    height: 18,
                    background: "var(--border)",
                    margin: "0 2px",
                    flexShrink: 0,
                  }}
                />

                {/* Link icon */}
                <button
                  type="button"
                  onClick={handleLinkToolbar}
                  style={toolbarBtnStyle}
                  title="連結"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M6.5 9.5a4 4 0 005.657 0l2-2a4 4 0 00-5.657-5.657L7.25 3.09" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M9.5 6.5a4 4 0 00-5.657 0l-2 2a4 4 0 005.657 5.657l1.25-1.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>

                {/* Quote icon */}
                <button
                  type="button"
                  onClick={() => prefixLines("> ")}
                  style={toolbarBtnStyle}
                  title="引言"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4h10M3 8h7M3 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>

                {/* Code icon */}
                <button
                  type="button"
                  onClick={handleCodeToolbar}
                  style={{ ...toolbarBtnStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}
                  title="程式碼"
                >
                  {"</>"}
                </button>

                {/* List icon */}
                <button
                  type="button"
                  onClick={() => prefixLines("- ")}
                  style={toolbarBtnStyle}
                  title="清單"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="3" cy="5" r="1.2" fill="currentColor" />
                    <circle cx="3" cy="9" r="1.2" fill="currentColor" />
                    <circle cx="3" cy="13" r="1.2" fill="currentColor" />
                    <path d="M6 5h7M6 9h7M6 13h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>

                {/* Separator */}
                <span
                  style={{
                    width: 1,
                    height: 18,
                    background: "var(--border)",
                    margin: "0 2px",
                    flexShrink: 0,
                  }}
                />

                {/* Image upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleImageChange}
                  aria-label="上傳圖片"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (uploadError) setUploadError(null);
                    fileInputRef.current?.click();
                  }}
                  disabled={uploading}
                  style={{
                    ...toolbarBtnStyle,
                    opacity: uploading ? 0.4 : 1,
                    cursor: uploading ? "not-allowed" : "pointer",
                    fontSize: 12,
                  }}
                  title="新增圖片"
                  aria-label="新增圖片"
                >
                  {uploading ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 16" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="5.5" cy="7" r="1.5" fill="currentColor" />
                      <path d="M1 11l4-4 3 3 2-2 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {/* Right: Markdown label */}
                <div style={{ flex: 1 }} />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-dim)",
                    userSelect: "none",
                  }}
                >
                  Markdown
                </span>
              </div>

              {/* Body textarea */}
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onFocus={() => setBodyFocused(true)}
                onBlur={() => setBodyFocused(false)}
                placeholder="在這裡輸入文章內容…"
                style={{
                  display: "block",
                  width: "100%",
                  padding: "18px 20px",
                  background: "var(--surface)",
                  borderRight: `1px solid ${bodyFocused ? "var(--accent-border)" : "var(--border)"}`,
                  borderBottom: `1px solid ${bodyFocused ? "var(--accent-border)" : "var(--border)"}`,
                  borderLeft: `1px solid ${bodyFocused ? "var(--accent-border)" : "var(--border)"}`,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 12,
                  color: "var(--text)",
                  fontSize: 15,
                  lineHeight: 1.7,
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                  resize: "vertical",
                  minHeight: 360,
                  boxSizing: "border-box",
                }}
              />
            </>
          ) : (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "18px 20px",
                minHeight: 360,
                fontSize: 15,
                lineHeight: 1.7,
                color: "var(--text)",
              }}
            >
              <RichContent text={body} variant="body" />
            </div>
          )}

          {/* Upload error */}
          {uploadError && (
            <p
              style={{
                marginTop: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--boo-fg)",
              }}
            >
              {uploadError}
            </p>
          )}

          {/* Footer stats */}
          <div
            style={{
              display: "flex",
              gap: 14,
              marginTop: 10,
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              color: "var(--text-dim)",
              alignItems: "center",
            }}
          >
            <span>{charCount} 字</span>
            <span>{readingTime} 分鐘閱讀</span>
            {!canSubmit && (title.trim() || body.trim()) && (
              <span
                style={{
                  marginLeft: "auto",
                  color: "var(--boo-fg)",
                }}
              >
                {mode === "edit-article" && !editSummary.trim()
                  ? "請填寫修訂說明"
                  : "標題與內容為必填"}
              </span>
            )}
          </div>

          {/* Edit summary (edit-article only) */}
          {mode === "edit-article" && (
            <div style={{ marginTop: 24 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-dim)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                修訂說明
              </div>
              <textarea
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                placeholder="描述這次的修改內容（必填）"
                onFocus={() => setEditSummaryFocused(true)}
                onBlur={() => setEditSummaryFocused(false)}
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "var(--surface)",
                  border: `1px solid ${editSummaryFocused ? "var(--accent-border)" : "var(--border)"}`,
                  borderRadius: 10,
                  color: "var(--text)",
                  fontSize: 14,
                  fontFamily: "var(--font)",
                  outline: "none",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Author card */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-dim)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              發文資訊
            </div>
            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {[
                { label: "作者", value: currentUser ?? "—" },
                { label: "看板", value: board || "—" },
                { label: "分類", value: category || "—" },
                {
                  label: "標題預覽",
                  value: titlePreview || "—",
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "var(--text-dim)" }}>{label}</span>
                  <span
                    style={{
                      color: "var(--text)",
                      wordBreak: "break-all",
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Tips card (post mode) */}
          {mode === "post" && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-dim)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                發文須知
              </div>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {[
                  "請遵守版規，勿散播不實資訊",
                  "標題請簡短清晰，包含分類標籤",
                  "引用他人內容請標明出處",
                  "廣告或業配需標明",
                  "違規文章可能被刪除或水桶",
                ].map((tip) => (
                  <li
                    key={tip}
                    style={{
                      color: "var(--text-dim)",
                      fontSize: 12,
                      lineHeight: 1.7,
                      fontFamily: "var(--font-mono)",
                      paddingLeft: 14,
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        color: "var(--text-dim)",
                      }}
                    >
                      ·
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Revision history (edit-article mode) */}
          {mode === "edit-article" && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-dim)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                修訂歷史
              </div>
              {revisions.length > 0 ? (
                <ol
                  style={{
                    color: "var(--text-dim)",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    lineHeight: 1.7,
                    margin: 0,
                    paddingLeft: 18,
                  }}
                >
                  {revisions.map((revision, index) => (
                    <li key={`${revision.markerOffset}-${index}`}>
                      {revision.summary}
                    </li>
                  ))}
                </ol>
              ) : (
                <p
                  style={{
                    color: "var(--text-dim)",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  尚無修訂記錄。
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
