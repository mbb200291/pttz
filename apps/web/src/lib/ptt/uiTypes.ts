export type PushType = "push" | "boo" | "neutral" | "edit";

export interface PushEditHistoryRecord {
  kind: "original" | "append" | "replace" | "withdraw";
  commandOrder: number;
  time: string;
  content: string;
  resultContent: string;
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
  score: number;
  floorNumber: number;
  anchorOrder: number;
  sourceFloors: number[];
  marker?: string;
  pushVoters: string[];
  booVoters: string[];
  editHistory?: PushEditHistoryRecord[];
  visible?: boolean;
}

export function samePttId(left: string, right: string): boolean {
  const normalize = (value: string) => (value.trim().split(/\s+/u)[0] ?? "").toLowerCase();
  return normalize(left) === normalize(right);
}
