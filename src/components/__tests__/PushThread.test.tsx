import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PushThread } from "../PushThread";
import type { AggregatedPush } from "../../lib/ptt/pushAggregator";

function push(overrides: Partial<AggregatedPush>): AggregatedPush {
  return {
    id: "push-0",
    type: "neutral",
    author: "user",
    content: "",
    time: "",
    ipAddresses: [],
    isOP: false,
    replyTo: null,
    score: 0,
    floorNumber: 0,
    anchorOrder: 0,
    sourceFloors: [],
    ...overrides,
  };
}

describe("PushThread", () => {
  it("renders nested replies deeper than one level", () => {
    const html = renderToStaticMarkup(
      <PushThread
        score={0}
        pushes={[
          push({
            id: "push-0",
            author: "askz0",
            content: "Ok?",
            anchorOrder: 10,
            sourceFloors: [1],
          }),
          push({
            id: "push-1",
            author: "MBB200291",
            content: "OK",
            replyTo: "push-0",
            anchorOrder: 20,
            sourceFloors: [2],
          }),
          push({
            id: "push-2",
            author: "askz0",
            content: "sure?",
            replyTo: "push-1",
            anchorOrder: 30,
            sourceFloors: [4],
          }),
        ]}
      />,
    );

    expect(html).toContain("Ok?");
    expect(html).toContain("OK");
    expect(html).toContain("sure?");
  });
});
