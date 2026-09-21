import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Composer } from "../../../apps/web/src/components/Composer";
import { createReplyDraftPlanner, ReplyDraftQueue } from "./internal/multipartReply.js";
import { aggregatePushes, parsePushBuffer } from "@pttzzz/core/internal";

afterEach(cleanup);
it("uses the real sender plan for the UI counter at different measured capacities", () => {
  const props = { mode: "reply" as const, initial: { body: "a".repeat(1000) }, multipartEnabled: true, onClose() {}, onSubmit: vi.fn() };
  const { rerender } = render(createElement(Composer, { ...props, plannerState: { status: "ready", planner: createReplyDraftPlanner({ author: "alice", capacity: 55 }) } }));
  expect(screen.getByText("剩餘 11 / 30 則")).toBeDefined();
  rerender(createElement(Composer, { ...props, plannerState: { status: "ready", planner: createReplyDraftPlanner({ author: "alice", capacity: 33 }) } }));
  expect(screen.getByText("超出 1 則")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "送出" }));
  expect(props.onSubmit).not.toHaveBeenCalled();
});

it("keeps trailing input visible but sends only the normalized 30-piece draft", async () => {
  const content = Array(30).fill("短句。").join("\n");
  const wire: string[] = [];
  let completion: Promise<unknown> | undefined;
  render(createElement(Composer, { mode: "reply", initial: { body: content }, multipartEnabled: true,
    plannerState: { status: "ready", planner: createReplyDraftPlanner({ author: "alice", capacity: 55 }) }, onClose() {},
    onSubmit: payload => {
      completion = new ReplyDraftQueue().run({ operationId: "ui", article: { board: "Test", index: 1 }, content: payload.body,
        pushType: payload.pushType, maxFragments: 30 }, async () => ({ author: "alice", capacity: 55 }), async piece => {
          wire.push(`→ alice: ${piece} 01/01 12:00`);
          return { ok: true, outcome: "sent" };
        });
    } }));
  const draft = content + " \u3000\t\n\n";
  fireEvent.change(screen.getByRole("textbox"), { target: { value: draft } });
  expect(screen.getByText("剩餘 0 / 30 則")).toBeDefined();
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(draft);
  fireEvent.click(screen.getByRole("button", { name: "送出" }));
  await completion;
  expect(wire).toHaveLength(30);
  expect(aggregatePushes(parsePushBuffer(wire.join("\n")), "op").pushes.map(p => p.content)).toEqual([content]);
});
