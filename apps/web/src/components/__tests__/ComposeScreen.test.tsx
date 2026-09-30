// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComposeScreen } from "../ComposeScreen";
// The transport dependency has no TypeScript declarations.
// @ts-expect-error untyped codec
import uao from "uao-js";

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

const defaultReplyProps = {
  mode: "reply-article" as const,
  initial: { board: "Test", title: "Re: 原文", body: "" },
  onCancel: vi.fn(),
  onSubmit: vi.fn(),
};

describe("ComposeScreen", () => {
  it("inserts a native symbol at the selection, restores the caret, and submits literal text", async () => {
    const onSubmit = vi.fn();
    render(<ComposeScreen {...defaultPostProps} initial={{ board: "Test", title: "test", body: "前文字後" }} onSubmit={onSubmit} />);
    const input = screen.getByPlaceholderText("在這裡輸入文章內容…") as HTMLTextAreaElement;
    input.focus(); input.setSelectionRange(1, 3);
    await userEvent.click(screen.getByRole("button", { name: "表情符號" }));
    await userEvent.click(screen.getByRole("button", { name: "插入 ♥" }));
    expect(input.value).toBe("前♥後");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2]);
    expect(screen.queryByRole("group", { name: "內建表情符號" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "表情符號" }));
    await userEvent.click(screen.getByRole("button", { name: "插入 ☺" }));
    expect(input.value).toBe("前♥☺後");
    await userEvent.click(screen.getByRole("button", { name: "預覽" }));
    expect(screen.getAllByText("前♥☺後").some((node) => !node.closest('[aria-hidden="true"]'))).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "發文" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ body: "前♥☺後" }));
  });
  it("offers only symbols that survive the actual PTT UAO codec", async () => {
    render(<ComposeScreen {...defaultPostProps} />);
    await userEvent.click(screen.getByRole("button", { name: "表情符號" }));
    const symbols = new Set<string>();
    for (const name of ["常用圖案", "箭頭", "數學", "幾何圖形", "框線", "色塊", "數字", "圈字母", "標點與單位"]) {
      await userEvent.click(screen.getByRole("button", { name }));
      for (const button of screen.getAllByRole("button", { name: /^插入 / })) {
        const symbol = button.textContent!;
        expect(uao.decodeSync(uao.encodeSync(symbol))).toBe(symbol);
        expect(symbols.has(symbol)).toBe(false);
        symbols.add(symbol);
      }
    }
    expect(symbols.size).toBeGreaterThan(380);
    for (const symbol of ["✈", "✂", "☎", "✉", "☹", "♬"]) expect(symbols.has(symbol)).toBe(true);
  });
  it("keeps the insertion position when switching symbol categories", async () => {
    render(<ComposeScreen {...defaultPostProps} initial={{ body: "前後" }} />);
    const input = screen.getByPlaceholderText("在這裡輸入文章內容…") as HTMLTextAreaElement;
    input.focus(); input.setSelectionRange(1, 1);
    await userEvent.click(screen.getByRole("button", { name: "表情符號" }));
    await userEvent.click(screen.getByRole("button", { name: "箭頭" }));
    await userEvent.click(screen.getByRole("button", { name: "常用圖案" }));
    await userEvent.click(screen.getByRole("button", { name: "插入 ✈" }));
    expect(input.value).toBe("前✈後");
    expect(input.selectionStart).toBe(2);
    expect(document.activeElement).toBe(input);
  });
  it("dismisses the symbol palette with Escape without cancelling the draft", async () => {
    const onCancel = vi.fn();
    render(<ComposeScreen {...defaultPostProps} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "表情符號" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "內建表情符號" })).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
  });
  it("shows selected colors while editing and keeps the native input and selection", () => {
    render(<ComposeScreen {...defaultPostProps} initial={{ body: "前紅字後" }} />);
    const input = screen.getByPlaceholderText("在這裡輸入文章內容…") as HTMLTextAreaElement;
    input.focus();
    input.setSelectionRange(1, 3);
    fireEvent.click(screen.getByRole("button", { name: "文字色：紅" }));
    const painted = screen.getByText("紅字");
    expect(painted.style.color).not.toBe("");
    fireEvent.click(screen.getByRole("button", { name: "底色：藍" }));
    expect(screen.getByText("紅字").style.backgroundColor).toBe("rgb(0, 0, 170)");
    expect(screen.getByText("紅字").style.color).toBe("rgb(170, 0, 0)");
    expect(painted.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(input.value).toBe("前紅字後");
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    fireEvent.scroll(input, { target: { scrollTop: 40 } });
    expect(painted.parentElement?.style.transform).toBe("translate(0px, -40px)");
    fireEvent.click(screen.getByRole("button", { name: "清除格式" }));
    expect(screen.queryByText("紅字")).toBeNull();
    expect(input.value).toBe("前紅字後");
  });
  it("offers native formatting without Markdown tools or implementation copy", () => {
    render(<ComposeScreen {...defaultPostProps} />);
    for (const title of ["連結", "引言", "程式碼", "清單"]) expect(screen.queryByTitle(title)).toBeNull();
    expect(screen.queryByText("Markdown")).toBeNull();
    expect(screen.queryByText(/既有文章目前以純文字載入/)).toBeNull();
    expect(screen.getByRole("button", { name: "新增圖片" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "底色：紅" }).style.backgroundColor).toBe("rgb(170, 0, 0)");
  });
  it("loads existing ANSI body as plain editable text without leaking color code text", () => {
    render(<ComposeScreen {...defaultEditProps} initial={{ body: "\x1b[1;31m原文\x1b[0m" }} />);
    expect((screen.getByPlaceholderText("在這裡輸入文章內容…") as HTMLTextAreaElement).value).toBe("原文");
  });
  it("shows a validation error instead of crashing preview on unsafe formatted text", async () => {
    render(<ComposeScreen {...defaultPostProps} initial={{ board: "Test", title: "title", body: "abc" }} />);
    const input = screen.getByPlaceholderText("在這裡輸入文章內容…") as HTMLTextAreaElement;
    input.focus(); input.setSelectionRange(0, 1);
    await userEvent.click(screen.getByRole("button", { name: "高亮／粗體" }));
    fireEvent.change(input, { target: { value: "abc\x1b" } });
    expect((screen.getByRole("button", { name: "發文" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "預覽" }));
    expect(screen.getByRole("alert").textContent).toContain("控制字元");
  });
  it("previews and submits selected PTT formatting without adding Markdown", async () => {
    const onSubmit = vi.fn();
    render(<ComposeScreen {...defaultPostProps} initial={{ board: "Test", title: "title", body: "前紅字後" }} onSubmit={onSubmit} />);
    const input = screen.getByPlaceholderText("在這裡輸入文章內容…") as HTMLTextAreaElement;
    input.focus(); input.setSelectionRange(1, 3);
    await userEvent.click(screen.getByRole("button", { name: "高亮／粗體" }));
    expect(input.value).toBe("前紅字後");
    await userEvent.click(screen.getByRole("button", { name: "文字色：紅" }));
    await userEvent.click(screen.getByRole("button", { name: "底色：藍" }));
    await userEvent.click(screen.getByRole("button", { name: "預覽" }));
    expect(screen.getByText("紅字").style.fontWeight).toBe("700");
    expect(screen.getByText("紅字").style.color).toBe("rgb(255, 85, 85)");
    expect(screen.getByText("紅字").style.backgroundColor).toBe("rgb(0, 0, 170)");
    await userEvent.click(screen.getByRole("button", { name: "發文" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ body: "前紅字後", formatting: [{ start: 1, end: 3, bold: true, color: 31, backgroundColor: 44 }] }));
  });
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

  it("submits an article edit without requiring a custom summary", async () => {
    const onSubmit = vi.fn();
    render(
      <ComposeScreen
        {...defaultEditProps}
        initial={{ title: "some title", body: "some body" }}
        onSubmit={onSubmit}
      />,
    );
    const btn = screen.getByRole("button", {
      name: "更新",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(screen.queryByText("修訂說明")).toBeNull();
    await userEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledWith(expect.not.objectContaining({ editSummary: expect.anything() }));
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

  it("locks article identity and hides categories in board reply mode", () => {
    render(<ComposeScreen {...defaultReplyProps} />);

    expect(screen.getAllByText("回應")).toHaveLength(2);
    expect((screen.getByDisplayValue("Test") as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByDisplayValue("Re: 原文") as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByText("分類")).toBeNull();
    expect((screen.getByRole("button", { name: "回應" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits the visible body from board reply mode", async () => {
    const onSubmit = vi.fn();
    render(<ComposeScreen {...defaultReplyProps} onSubmit={onSubmit} />);

    await userEvent.type(
      screen.getByPlaceholderText("在這裡輸入文章內容…"),
      "回應正文",
    );
    await userEvent.click(screen.getByRole("button", { name: "回應" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      board: "Test",
      title: "Re: 原文",
      body: "回應正文",
      category: "",
    }));
  });

  it("disables board reply submission while it is in flight", () => {
    render(
      <ComposeScreen
        {...defaultReplyProps}
        initial={{ ...defaultReplyProps.initial, body: "回應正文" }}
        submitting
      />,
    );

    expect(
      (screen.getByRole("button", { name: /回應中/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
