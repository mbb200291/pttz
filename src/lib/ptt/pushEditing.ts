import type { AggregatedPush } from "./pushAggregator";

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
