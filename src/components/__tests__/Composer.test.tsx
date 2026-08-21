// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "../Composer";

afterEach(() => {
  cleanup();
});

const defaultProps = {
  mode: "reply" as const,
  initial: {},
  onClose: vi.fn(),
  onSubmit: vi.fn(),
};

describe("Composer", () => {
  it("renders 回文 title when mode=reply", () => {
    render(<Composer {...defaultProps} mode="reply" />);
    // getByText throws if not found — sufficient to prove it renders
    expect(screen.getByText("回文")).toBeTruthy();
  });

  it("submit button is disabled when body is empty", () => {
    render(<Composer {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /送出/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("submit button is enabled after typing in textarea", async () => {
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "hello");
    const btn = screen.getByRole("button", { name: /送出/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("clicking backdrop calls onClose", async () => {
    const onClose = vi.fn();
    render(<Composer {...defaultProps} onClose={onClose} />);
    const backdrop = screen.getByTestId("composer-backdrop");
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("onSubmit is called with correct body when submitted", async () => {
    const onSubmit = vi.fn();
    render(<Composer {...defaultProps} onSubmit={onSubmit} />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "test message");
    await userEvent.click(screen.getByRole("button", { name: /送出/ }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ body: "test message" }),
    );
  });

  it("push type selector is shown for mode=reply", () => {
    render(<Composer {...defaultProps} mode="reply" />);
    expect((screen.getByRole("button", { name: "推" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "→" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "噓" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(["reply", "reply-push"] as const)(
    "limits article authors to neutral in %s mode",
    async (mode) => {
      const onSubmit = vi.fn();
      render(
        <Composer
          {...defaultProps}
          mode={mode}
          initial={{ pushType: "push", targetFloor: mode === "reply-push" ? 9 : undefined }}
          neutralOnly
          onSubmit={onSubmit}
        />,
      );

      expect((screen.getByRole("button", { name: "推" }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "→" }) as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByRole("button", { name: "噓" }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText("作者本人, 使用 → 加註方式")).toBeTruthy();

      await userEvent.type(screen.getByRole("textbox"), "作者補充");
      await userEvent.click(screen.getByRole("button", { name: "送出" }));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ pushType: "neutral" }),
      );
    },
  );

  it("does not show the hidden target floor prefix for reply-push mode", async () => {
    const onSubmit = vi.fn();
    render(
      <Composer
        {...defaultProps}
        mode="reply-push"
        initial={{ targetFloor: 9 }}
        onSubmit={onSubmit}
      />,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    expect(textarea.value).not.toContain("回9樓");

    await userEvent.type(textarea, "測試回覆");
    await userEvent.click(screen.getByRole("button", { name: /送出/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ body: "測試回覆", targetFloor: 9 }),
    );
  });

  it("edit mode selector is shown for mode=edit-push", () => {
    render(
      <Composer
        {...defaultProps}
        mode="edit-push"
        initial={{ body: "original", editMode: "補充" }}
      />,
    );
    expect(screen.getByRole("button", { name: "補充" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "更正" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "撤回" })).toBeTruthy();
  });

  it("allows an empty body when retracting a push", async () => {
    const onSubmit = vi.fn();
    render(
      <Composer
        {...defaultProps}
        mode="edit-push"
        initial={{ editMode: "撤回", targetFloor: 12, targetEndFloor: 14 }}
        onSubmit={onSubmit}
      />,
    );

    const submit = screen.getByRole("button", { name: /送出/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    await userEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "",
        editMode: "撤回",
        targetFloor: 12,
        targetEndFloor: 14,
      }),
    );
  });

  it("keeps the edit draft visible while submitting and after an error", () => {
    render(
      <Composer
        {...defaultProps}
        mode="edit-push"
        initial={{ body: "要保留的修正", targetFloor: 8 }}
        submitting
        submitError="推文編輯失敗"
      />,
    );

    expect((screen.getByRole("button", { name: /送出中/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("推文編輯失敗");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("要保留的修正");
  });

  it("disables push edits when the formatted Big5-sized content exceeds the limit", async () => {
    render(
      <Composer
        {...defaultProps}
        mode="edit-push"
        initial={{ targetFloor: 123 }}
      />,
    );

    await userEvent.type(screen.getByRole("textbox"), "中".repeat(40));
    expect((screen.getByRole("button", { name: "送出" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText((content) => content.startsWith("-"))).toBeTruthy();
  });

  it("pressing Escape calls onClose", async () => {
    const onClose = vi.fn();
    render(<Composer {...defaultProps} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
