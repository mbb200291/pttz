import type { AggregatedPush } from "./pushAggregator.js";

export function approximatePttBytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    bytes += character.codePointAt(0)! > 127 ? 2 : 1;
  }
  return bytes;
}

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
  return `${mode}我在${startFloor}樓發言：${content.trim()}`;
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
