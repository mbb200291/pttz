// UI-only draft counter. Final command validation and wire formatting live in
// @pttzzz/core and @pttzzz/browser.
export function approximatePttBytes(value: string): number {
  let bytes = 0;
  for (const character of value) bytes += character.codePointAt(0)! > 127 ? 2 : 1;
  return bytes;
}
