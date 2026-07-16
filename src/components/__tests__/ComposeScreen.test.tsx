// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComposeScreen } from "../ComposeScreen";

afterEach(() => {
  cleanup();
});

const defaultPostProps = {
  mode: "post" as const,
  onCancel: vi.fn(),
  onSubmit: vi.fn(),
};

const defaultEditProps = {
  mode: "edit-article" as const,
  onCancel: vi.fn(),
  onSubmit: vi.fn(),
};

describe("ComposeScreen", () => {
  it("renders 發文 submit button in post mode", () => {
    render(<ComposeScreen {...defaultPostProps} />);
    expect(screen.getByRole("button", { name: "發文" })).toBeTruthy();
  });

  it("renders categories from board-specific options instead of the global fallback", () => {
    render(
      <ComposeScreen
        {...defaultPostProps}
        categoryOptions={["標的", "請益"]}
      />,
    );

    expect(screen.getByRole("button", { name: "標的" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "請益" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "問卦" })).toBeNull();
  });

  it("renders 更新 submit button in edit-article mode", () => {
    render(<ComposeScreen {...defaultEditProps} />);
    expect(screen.getByRole("button", { name: "更新" })).toBeTruthy();
  });

  it("submit button disabled when title is empty (post mode)", () => {
    render(
      <ComposeScreen
        {...defaultPostProps}
        initial={{ title: "", body: "some body" }}
      />,
    );
    const btn = screen.getByRole("button", { name: "發文" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("submit button disabled when body is empty (post mode)", () => {
    render(
      <ComposeScreen
        {...defaultPostProps}
        initial={{ title: "some title", body: "" }}
      />,
    );
    const btn = screen.getByRole("button", { name: "發文" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("submit button disabled when editSummary is empty (edit-article mode with title+body filled)", () => {
    render(
      <ComposeScreen
        {...defaultEditProps}
        initial={{ title: "some title", body: "some body" }}
      />,
    );
    const btn = screen.getByRole("button", {
      name: "更新",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("submit button enabled when all required fields filled (post mode)", () => {
    render(
      <ComposeScreen
        {...defaultPostProps}
        initial={{ title: "some title", body: "some body" }}
      />,
    );
    const btn = screen.getByRole("button", { name: "發文" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("onCancel called when 取消 is clicked", async () => {
    const onCancel = vi.fn();
    render(<ComposeScreen {...defaultPostProps} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("onSubmit called with correct board/title/body when submit clicked (post mode, all filled)", async () => {
    const onSubmit = vi.fn();
    render(
      <ComposeScreen
        {...defaultPostProps}
        initial={{ board: "Gossiping", title: "Test Title", body: "Test body" }}
        onSubmit={onSubmit}
      />,
    );
    const btn = screen.getByRole("button", { name: "發文" });
    await userEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        board: "Gossiping",
        title: "Test Title",
        body: "Test body",
      }),
    );
  });

  it("preview toggle: clicking 預覽 shows RichContent instead of textarea", async () => {
    render(
      <ComposeScreen
        {...defaultPostProps}
        initial={{ title: "t", body: "hello world" }}
      />,
    );
    // textarea should be present initially
    expect(screen.getByPlaceholderText("在這裡輸入文章內容…")).toBeTruthy();

    // click preview toggle
    await userEvent.click(screen.getByRole("button", { name: "預覽" }));

    // textarea should no longer be present
    expect(
      screen.queryByPlaceholderText("在這裡輸入文章內容…"),
    ).toBeNull();

    // toggle back button now says 編輯
    expect(screen.getByRole("button", { name: "編輯" })).toBeTruthy();
  });

  it("Escape key calls onCancel", async () => {
    const onCancel = vi.fn();
    render(<ComposeScreen {...defaultPostProps} onCancel={onCancel} />);
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables article update while the edit is being submitted", () => {
    render(
      <ComposeScreen
        {...defaultEditProps}
        initial={{ title: "原標題", body: "更新正文" }}
        submitting
      />,
    );

    expect((screen.getByRole("button", { name: /更新中/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows an article edit error without clearing the draft", () => {
    render(
      <ComposeScreen
        {...defaultEditProps}
        initial={{ title: "原標題", body: "仍要保留的正文" }}
        submitError="文章身分已變更，請重新載入"
      />,
    );

    expect(screen.getByText("文章身分已變更，請重新載入")).toBeTruthy();
    expect(
      (screen.getByPlaceholderText("在這裡輸入文章內容…") as HTMLTextAreaElement)
        .value,
    ).toBe("仍要保留的正文");
  });

  it("keeps article identity fields read-only while editing", () => {
    render(
      <ComposeScreen
        {...defaultEditProps}
        initial={{ board: "Test", title: "原標題", body: "正文" }}
      />,
    );

    expect((screen.getByDisplayValue("Test") as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByDisplayValue("原標題") as HTMLInputElement).readOnly).toBe(true);
  });

  it("ignores Escape while an article update is in flight", async () => {
    const onCancel = vi.fn();
    render(
      <ComposeScreen
        {...defaultEditProps}
        initial={{ title: "原標題", body: "正文" }}
        submitting
        onCancel={onCancel}
      />,
    );

    await userEvent.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
