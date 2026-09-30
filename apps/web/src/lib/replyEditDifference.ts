/** One contiguous replacement, with UTF-16 offsets on code-point boundaries. */
export function replyEditDifference(original: string, edited: string) {
  const before = Array.from(original);
  const after = Array.from(edited);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  return {
    start: before.slice(0, prefix).join("").length,
    end: before.slice(0, before.length - suffix).join("").length,
    replacement: after.slice(prefix, after.length - suffix).join(""),
  };
}
