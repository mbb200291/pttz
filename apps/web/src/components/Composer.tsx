/**
 * Composer
 *
 * Modal dialog for replying to articles/pushes, or editing own pushes.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NativeSymbolPalette } from "./NativeSymbolPalette";
import { uploadToImgur } from "../lib/imgur";
import { approximatePttBytes } from "../lib/ptt/pttBytes";
import { replyEditDifference } from "../lib/replyEditDifference";
import type { ReplyDelivery } from "@pttzzz/core";
import type { DraftPlannerState } from "../hooks/useReplyDraftPlanner";
import { MAX_REPLY_FRAGMENTS } from "../lib/replyBudget";
import { replyFailureGuidance } from "../lib/replyFailureGuidance";

export type ComposerMode = "reply" | "reply-push" | "edit-push";
export type EditPushMode = "補充" | "更正" | "區段" | "撤回";

export interface ComposerInitial {
  body?: string;
  pushType?: "push" | "neutral" | "boo";
  editMode?: EditPushMode;
}

export interface ComposerPayload {
  body: string;
  pushType: "push" | "neutral" | "boo";
  editMode: EditPushMode;
  sectionStart: number;
  sectionEnd: number;
}

const MAX_BYTES = 80;

const PUSH_TYPES: { value: "push" | "neutral" | "boo"; label: string }[] = [
  { value: "push", label: "推" },
  { value: "neutral", label: "→" },
  { value: "boo", label: "噓" },
];

const EDIT_MODES: EditPushMode[] = ["區段", "撤回"];

export function Composer({
  mode,
  initial,
  neutralOnly = false,
  submitting = false,
  submitLocked = false,
  isSubmitLocked,
  submitError = null,
  multipartEnabled = false,
  plannerState,
  onRetryPlan,
  contentLocked = false,
  delivery,
  onRefresh,
  onRecoverSubmit,
  recovering = false,
  onClose,
  onSubmit,
}: {
  mode: ComposerMode;
  initial: ComposerInitial;
  neutralOnly?: boolean;
  submitting?: boolean;
  submitLocked?: boolean;
  isSubmitLocked?: (payload: ComposerPayload) => boolean;
  submitError?: string | null;
  multipartEnabled?: boolean;
  plannerState?: DraftPlannerState;
  onRetryPlan?: () => void;
  contentLocked?: boolean;
  delivery?: ReplyDelivery;
  onRefresh?: () => void;
  onRecoverSubmit?: () => void;
  recovering?: boolean;
  onClose: () => void;
  onSubmit: (payload: ComposerPayload) => void;
}): JSX.Element {
  const [body, setBody] = useState(initial.body ?? "");
  const [pushType, setPushType] = useState<"push" | "neutral" | "boo">(
    neutralOnly ? "neutral" : initial.pushType ?? "push",
  );
  const [editMode, setEditMode] = useState<EditPushMode>(
    initial.editMode === "撤回" ? "撤回" : "區段",
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [symbolGroup, setSymbolGroup] = useState(0);
  const editingLocked = submitting || contentLocked;
  const multipart = multipartEnabled && mode !== "edit-push";
  const estimate = multipart && plannerState?.status === "ready" ? plannerState.planner.plan(body) : undefined;
  const plannedTotal = estimate?.ok ? estimate.value.total : undefined;
  const resuming = Boolean(delivery && delivery.total > 0 && delivery.status === "paused");
  const budgetBlocked = multipart && !resuming && (plannedTotal === undefined || plannedTotal > MAX_REPLY_FRAGMENTS);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !textareaRef.current) return;
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [body, symbolsOpen]);
  const insertSymbol = (symbol: string) => {
    const input = textareaRef.current;
    if (!input || editingLocked) return;
    const start = input.selectionStart, end = input.selectionEnd;
    pendingCaret.current = start + symbol.length;
    setBody(body.slice(0, start) + symbol + body.slice(end));
    setSymbolsOpen(false);
  };

  // Auto-focus textarea on mount, cursor at end
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  // Escape key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (symbolsOpen) {
          e.preventDefault();
          setSymbolsOpen(false);
          textareaRef.current?.focus();
          return;
        }
        if (submitting) return;
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting, symbolsOpen]);

  const difference = replyEditDifference(initial.body ?? "", body);
  const sectionStart = difference.start;
  const sectionEnd = difference.end;
  const isSectionEdit = mode === "edit-push" && editMode === "區段";
  const submittedContent = isSectionEdit ? difference.replacement : body;
  const effectivePushType = mode === "reply-push" || neutralOnly ? "neutral" : pushType;
  const currentPayload = { body: submittedContent, pushType: effectivePushType, editMode, sectionStart, sectionEnd };
  const remaining = MAX_BYTES - (mode === "edit-push" && editMode === "撤回" ? 0 : approximatePttBytes(submittedContent));
  const isSubmitDisabled =
    submitting ||
    budgetBlocked ||
    uploading ||
    delivery?.status === "uncertain" ||
    delivery?.status === "complete" ||
    submitLocked ||
    Boolean(isSubmitLocked?.(currentPayload)) ||
    (!multipart && remaining < 0) ||
    (isSectionEdit && body === (initial.body ?? "")) ||
    (mode === "edit-push" && editMode === "區段" && (
      !Number.isInteger(sectionStart) || !Number.isInteger(sectionEnd) ||
      sectionStart < 0 || sectionEnd < sectionStart || sectionEnd > (initial.body?.length ?? 0)
    )) ||
    (body.trim() === "" && !(mode === "edit-push" && (editMode === "撤回" || editMode === "區段")));

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !submitting) {
      onClose();
    }
  };

  const handleSubmit = () => {
    if (isSubmitDisabled) return;
    onSubmit(currentPayload);
  };

  const handleImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    // Reset input so the same file can be picked again later
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file || editingLocked) return;

    setUploading(true);
    setUploadError(null);

    try {
      const url = await uploadToImgur(file);

      // Insert URL at cursor position (or append if no focus)
      const el = textareaRef.current;
      if (el) {
        const current = el.value;  // live DOM value, not stale closure
        const start = el.selectionStart ?? current.length;
        const end   = el.selectionEnd   ?? current.length;
        const newBody = current.slice(0, start) + url + current.slice(end);
        setBody(newBody);

        // Restore focus and move cursor to after the inserted URL
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

  const title =
    mode === "reply"
      ? "回文"
      : mode === "reply-push"
        ? "回覆推文"
        : "編輯推文";

  return (
    <div
      data-testid="composer-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-5"
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
            aria-label="關閉"
          >
            ✕
          </button>
        </div>

        {/* Push type selector */}
        {mode === "reply" && (
          <div>
            <div className="flex gap-2">
              {PUSH_TYPES.map(({ value, label }) => {
                const isActive = effectivePushType === value;
                const typeDisabled = editingLocked || (neutralOnly && value !== "neutral");
                const activeClass =
                  value === "push"
                    ? "bg-green-500/15 text-green-300"
                    : value === "neutral"
                      ? "bg-gray-700 text-gray-300"
                      : "bg-red-500/15 text-red-300";
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPushType(value)}
                    disabled={typeDisabled}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      isActive
                        ? `${activeClass} border-transparent`
                        : "border-gray-700 text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {neutralOnly && (
              <p className="mt-2 text-xs text-gray-500">
                作者本人, 使用 → 加註方式
              </p>
            )}
          </div>
        )}

        {/* Edit mode selector */}
        {mode === "edit-push" && (
          <div className="flex gap-2">
            {EDIT_MODES.map((em) => {
              const isActive = editMode === em;
              return (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    setEditMode(em);
                  }}
                  disabled={submitting}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    isActive
                      ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                      : "border-gray-700 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {em === "區段" ? "編輯" : em}
                </button>
              );
            })}
          </div>
        )}

        {/* Textarea */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={body}
            disabled={editingLocked}
            onChange={(e) => {
              setBody(e.target.value);
              if (uploadError) setUploadError(null);
            }}
            rows={4}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-sky-500 resize-none"
            placeholder="輸入內容…"
          />
          {!multipart && <span
            className={`absolute bottom-3 right-3 text-xs ${
              remaining < 10 ? "text-red-400" : "text-gray-500"
            }`}
          >
            {remaining}
          </span>}
        </div>

        {/* Upload error */}
        {multipart && !delivery && <div className="min-h-6 text-xs text-gray-400" aria-live="polite">
          {plannedTotal !== undefined
            ? plannedTotal > MAX_REPLY_FRAGMENTS ? `超出 ${plannedTotal - MAX_REPLY_FRAGMENTS} 則` : `剩餘 ${MAX_REPLY_FRAGMENTS - plannedTotal} / ${MAX_REPLY_FRAGMENTS} 則`
            : plannerState?.status === "error" || estimate?.ok === false
              ? <>{plannerState?.status === "error" && plannerState.error.code === "UNSUPPORTED" ? "此連線不支援回文計數"
                : estimate?.ok === false && estimate.error.code !== "REPLY_PLAN_EXPIRED"
                ? replyFailureGuidance(estimate.error.replyIssue).message : "未能計算"}
                {onRetryPlan && (plannerState?.status !== "error" || plannerState.error.retryable) && <button type="button" onClick={onRetryPlan} className="ml-3 text-sky-400">重新計算</button>}</>
              : "計算中…"}
        </div>}
        {uploadError && (
          <p className="text-red-400 text-xs">{uploadError}</p>
        )}
        {submitError && (
          <div className="text-xs">
            <p role="alert" className="text-red-400">{submitError}</p>
            {onRecoverSubmit && <button type="button" disabled={submitting} onClick={onRecoverSubmit} className="min-h-12 text-sky-400 disabled:opacity-50">{recovering ? "載入中…" : "重新載入文章"}</button>}
          </div>
        )}

        {/* Footer */}
        {delivery && <div role="status" className="flex items-center justify-between text-xs text-gray-400">
          <span>{delivery.status === "uncertain" ? "尚未確認" : "已送出"} · {delivery.confirmed} / {delivery.total}</span>
          {delivery.status === "uncertain" && onRefresh && <button type="button" onClick={onRefresh} className="text-sky-400">重新整理</button>}
        </div>}
        {symbolsOpen && <NativeSymbolPalette groupIndex={symbolGroup} onGroupChange={setSymbolGroup} onSelect={insertSymbol} disabled={editingLocked} />}
        <div className="flex items-center justify-between gap-3">
          {/* Image upload */}
          <div className="flex items-center gap-2">
            <button type="button" aria-label="表情符號" aria-expanded={symbolsOpen} disabled={editingLocked}
              onMouseDown={(event) => event.preventDefault()} onClick={() => setSymbolsOpen((open) => !open)}
              className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 text-xl disabled:opacity-40">☺</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
              aria-label="上傳圖片"
              disabled={editingLocked}
            />
            <button
              type="button"
              onClick={() => {
                if (uploadError) setUploadError(null);
                fileInputRef.current?.click();
              }}
              disabled={uploading || editingLocked}
              className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="新增圖片"
            >
              {uploading ? "上傳中…" : <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8" cy="8" r="1.5" />
                <path d="m3 17 5-5 4 4 3-3 6 6" />
              </svg>}
            </button>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className="px-6 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
          >
            {submitting && !recovering ? "送出中…" : delivery?.status === "paused" ? "繼續送出" : "送出"}
          </button>
        </div>
      </div>
    </div>
  );
}
