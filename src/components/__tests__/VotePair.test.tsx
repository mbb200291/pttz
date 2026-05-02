// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VotePair } from "../VotePair";

afterEach(() => {
  cleanup();
});

describe("VotePair", () => {
  const defaultProps = {
    value: 0 as const,
    count: { push: 5, boo: 2 },
    onPush: vi.fn(),
    onBoo: vi.fn(),
  };

  it("calls onPush when push button is clicked", async () => {
    const onPush = vi.fn();
    const { container } = render(<VotePair {...defaultProps} onPush={onPush} />);
    await userEvent.click(within(container).getByRole("button", { name: "推" }));
    expect(onPush).toHaveBeenCalledTimes(1);
  });

  it("calls onBoo when boo button is clicked", async () => {
    const onBoo = vi.fn();
    const { container } = render(<VotePair {...defaultProps} onBoo={onBoo} />);
    await userEvent.click(within(container).getByRole("button", { name: "噓" }));
    expect(onBoo).toHaveBeenCalledTimes(1);
  });

  it("displays push count in the push button", () => {
    const { container } = render(
      <VotePair {...defaultProps} count={{ push: 42, boo: 3 }} />,
    );
    const pushBtn = within(container).getByRole("button", { name: "推" });
    expect(pushBtn.textContent).toContain("42");
  });

  it("displays boo count in the boo button", () => {
    const { container } = render(
      <VotePair {...defaultProps} count={{ push: 5, boo: 17 }} />,
    );
    const booBtn = within(container).getByRole("button", { name: "噓" });
    expect(booBtn.textContent).toContain("17");
  });

  it("push button has green styling class when value=1", () => {
    const { container } = render(<VotePair {...defaultProps} value={1} />);
    const pushBtn = within(container).getByRole("button", { name: "推" });
    expect(pushBtn.className).toMatch(/green/);
  });

  it("boo button has red styling class when value=-1", () => {
    const { container } = render(<VotePair {...defaultProps} value={-1} />);
    const booBtn = within(container).getByRole("button", { name: "噓" });
    expect(booBtn.className).toMatch(/red/);
  });

  it("push button is disabled when myVote=1", () => {
    const { container } = render(<VotePair {...defaultProps} myVote={1} />);
    const pushBtn = within(container).getByRole("button", { name: "推" });
    expect((pushBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("boo button is disabled when myVote=-1", () => {
    const { container } = render(<VotePair {...defaultProps} myVote={-1} />);
    const booBtn = within(container).getByRole("button", { name: "噓" });
    expect((booBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
