/**
 * Composer
 *
 * Modal dialog for replying to articles/pushes, or editing own pushes.
 */

import { useEffect, useRef, useState } from "react";
import { uploadToImgur } from "../lib/imgur";
import { approximatePttBytes, formatEditPush } from "../lib/ptt/pushEditing";

export type ComposerMode = "reply" | "reply-push" | "edit-push";
export type EditPushMode = "補充" | "更正" | "撤回";

export interface ComposerInitial {
  body?: string;
  pushType?: "push" | "neutral" | "boo";
  targetFloor?: number;
  targetEndFloor?: number;
  editMode?: EditPushMode;
}

export interface ComposerPayload {
  body: string;
  pushType: "push" | "neutral" | "boo";
  editMode: EditPushMode;
  targetFloor?: number;
  targetEndFloor?: number;
}

const MAX_BYTES = 80;

const PUSH_TYPES: { value: "push" | "neutral" | "boo"; label: string }[] = [
  { value: "push", label: "推" },
  { value: "neutral", label: "→" },
  { value: "boo", label: "噓" },
];

const EDIT_MODES: EditPushMode[] = ["補充", "更正", "撤回"];

export function Composer({
  mode,
  initial,
  submitting = false,
  submitError = null,
  onClose,
  onSubmit,
}: {
  mode: ComposerMode;
  initial: ComposerInitial;
  submitting?: boolean;
  submitError?: string | null;
  onClose: () => void;
  onSubmit: (payload: ComposerPayload) => void;
}): JSX.Element {
  const [body, setBody] = useState(initial.body ?? "");
  const [pushType, setPushType] = useState<"push" | "neutral" | "boo">(
    initial.pushType ?? "push",
  );
  const [editMode, setEditMode] = useState<EditPushMode>(
    initial.editMode ?? "補充",
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        if (submitting) return;
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting]);

  const submittedContent = mode === "edit-push"
    ? formatEditPush(
        editMode,
        initial.targetFloor ?? 0,
        initial.targetEndFloor ?? null,
        body,
      )
    : body;
  const remaining = MAX_BYTES - approximatePttBytes(submittedContent);
  const isSubmitDisabled =
    submitting ||
    remaining < 0 ||
    (body.trim() === "" && !(mode === "edit-push" && editMode === "撤回"));

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !submitting) {
      onClose();
    }
  };

  const handleSubmit = () => {
    if (isSubmitDisabled) return;
    onSubmit({
      body,
      pushType,
      editMode,
      targetFloor: initial.targetFloor,
      targetEndFloor: initial.targetEndFloor,
    });
  };

  const handleImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    // Reset input so the same file can be picked again later
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

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
        {(mode === "reply" || mode === "reply-push") && (
          <div className="flex gap-2">
            {PUSH_TYPES.map(({ value, label }) => {
              const isActive = pushType === value;
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
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
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
                  onClick={() => setEditMode(em)}
                  disabled={submitting}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    isActive
                      ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                      : "border-gray-700 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {em}
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
            disabled={submitting}
            onChange={(e) => {
              setBody(e.target.value);
              if (uploadError) setUploadError(null);
            }}
            rows={4}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-sky-500 resize-none"
            placeholder="輸入內容…"
          />
          <span
            className={`absolute bottom-3 right-3 text-xs ${
              remaining < 10 ? "text-red-400" : "text-gray-500"
            }`}
          >
            {remaining}
          </span>
        </div>

        {/* Upload error */}
        {uploadError && (
          <p className="text-red-400 text-xs">{uploadError}</p>
        )}
        {submitError && (
          <p role="alert" className="text-red-400 text-xs">
            {submitError}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3">
          {/* Image upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
              aria-label="上傳圖片"
            />
            <button
              type="button"
              onClick={() => {
                if (uploadError) setUploadError(null);
                fileInputRef.current?.click();
              }}
              disabled={uploading || submitting}
              className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="新增圖片"
            >
              {uploading ? "上傳中…" : "🖼"}
            </button>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className="px-6 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
          >
            {submitting ? "送出中…" : "送出"}
          </button>
        </div>
      </div>
    </div>
  );
}
