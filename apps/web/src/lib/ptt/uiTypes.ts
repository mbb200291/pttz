export type PushType = "push" | "boo" | "neutral" | "edit";

export interface PushEditHistoryRecord {
  kind: "original" | "append" | "replace" | "withdraw";
  commandOrder: number;
  time: string;
  content: string;
  resultContent: string;
}

export interface UiVoteSummary {
  pushCount: number;
  booCount: number;
  score: number;
  viewerVote?: "push" | "boo";
}

export interface AggregatedPush {
  id: string;
  type: PushType;
  author: string;
  content: string;
  time: string;
  ipAddresses: string[];
  isOP: boolean;
  replyTo: string | null;
  /** Structural parent from @pttzzz/core; never rewritten for presentation. */
  structuralDepth?: number;
  /** UI-only parent used to cap visual nesting without changing action identity. */
  displayReplyTo?: string | null;
  score: number;
  floorNumber: number;
  anchorOrder: number;
  sourceFloors: number[];
  marker?: string;
  /** Authoritative totals projected by the core layer. */
  votes?: UiVoteSummary;
  pushVoters: string[];
  booVoters: string[];
  editHistory?: PushEditHistoryRecord[];
  visible?: boolean;
}

export function samePttId(left: string, right: string): boolean {
  const normalize = (value: string) => (value.trim().split(/\s+/u)[0] ?? "").toLowerCase();
  return normalize(left) === normalize(right);
}

export function projectThreadForDisplay(
  pushes: readonly AggregatedPush[],
  maximumDepth = 3,
): AggregatedPush[] {
  const byId = new Map(pushes.map((push) => [push.id, push]));
  return pushes.map((push) => {
    let displayReplyTo = push.replyTo;
    let parent = displayReplyTo ? byId.get(displayReplyTo) : undefined;
    while (
      parent &&
      (push.structuralDepth ?? 1) > maximumDepth &&
      (parent.structuralDepth ?? 1) >= maximumDepth
    ) {
      displayReplyTo = parent.replyTo;
      parent = displayReplyTo ? byId.get(displayReplyTo) : undefined;
    }
    return { ...push, displayReplyTo };
  });
}
