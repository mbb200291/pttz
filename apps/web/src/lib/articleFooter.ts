/** A presentation-only projection. Never remove ambiguous body text or signatures. */
export function parseArticleFooter(text: string): { start: number; station: string; source: string; url: string } | null {
  const match = /(?:^|\n)(--[ \t]*\n※[ \t]*發信站:[ \t]*([^\n]+?),[ \t]*來自:[ \t]*([^\n]+)\n※[ \t]*文章網址:[ \t]*([^\n]+))[ \t\n]*$/u.exec(text);
  if (!match) return null;
  const raw = match[4].trim();
  const markdown = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(raw);
  if (markdown && markdown[1] !== markdown[2]) return null;
  const url = markdown ? markdown[2] : raw;
  if (!/^https:\/\/www\.ptt\.cc\/bbs\/[A-Za-z0-9_-]+\/M\.\d+\.A\.[A-Fa-f0-9]+\.html$/u.test(url)) return null;
  return { start: match.index + (match[0].startsWith("\n") ? 1 : 0), station: match[2].trim(), source: match[3].trim(), url };
}
