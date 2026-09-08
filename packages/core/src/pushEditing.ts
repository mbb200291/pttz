import type { AggregatedPush } from "./pushAggregator.js";

export { approximatePttBytes } from "./pushWire.js";
import { formatEditPushCommand } from "./pushWire.js";

export function formatEditPush(
  mode: "補充" | "更正" | "撤回",
  startFloor: number,
  endFloor: number | null,
  content: string,
): string {
  if (mode === "撤回") {
    return endFloor === null
      ? `撤回我在${startFloor}樓的發言`
      : `撤回我在${startFloor}~${endFloor}樓的發言`;
  }
  return formatEditPushCommand(startFloor, mode === "補充" ? "append" : "replace", content);
}

export function getPushEditFloorRange(push: AggregatedPush): {
  startFloor: number;
  endFloor: number | null;
} {
  const floors = push.sourceFloors.length > 0
    ? [...new Set(push.sourceFloors)].sort((a, b) => a - b)
    : [push.floorNumber];
  return {
    startFloor: floors[0],
    endFloor: floors.length > 1 ? floors[floors.length - 1] : null,
  };
}
