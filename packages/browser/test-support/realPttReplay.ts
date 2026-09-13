import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, vi } from "vitest";

const relative = "src/internal/__fixtures__/real-ptt";
const local = resolve(process.cwd(), relative);
const root = existsSync(local) ? local : resolve(process.cwd(), "packages/browser", relative);
export const fixture = (name: string) => readFileSync(resolve(root, name), "utf8");
export const current = (n: number) => fixture(`2026-09-13/kick-and-board/${String(n).padStart(3, "0")}.txt`);
export const nested = (n: number) => fixture(`2026-09-13/nested-replies-1gfWDlNT/${String(n).padStart(3, "0")}.txt`);
export function legacy(name: string, heading: string): string {
  const raw = fixture(`2026-08-31_2026-09-01/${name}`);
  const marker = `=== ${heading} ===`;
  const start = raw.indexOf(marker);
  if (start < 0) throw new Error(`Missing legacy section: ${heading}`);
  return raw.slice(start + marker.length).split("\n=== ")[0].trim();
}

export interface ReplayStep {
  key: string | RegExp;
  frames: readonly string[];
  delayMs?: number;
}

// Frames change with virtual time, not with the number of calls to getLine.
// Unrecorded key sequences fail rather than silently advancing to a happy path.
export function replay(initial: string, steps: readonly ReplayStep[], articleLines?: string[]) {
  let screen = initial;
  let offset = 0;
  const sent: string[] = [];
  const bot = {
    state: { login: true, connect: true },
    on() { return bot; },
    getLine(row: number) { return { str: screen.split("\n")[row] ?? "" }; },
    async getLines() { return articleLines ?? screen.split("\n").slice(0, 23); },
    async getArticles() { return []; },
    async send(key: string) {
      sent.push(key);
      const step = steps[offset++];
      expect(step, `Unexpected key ${JSON.stringify(key)}`).toBeDefined();
      if (typeof step.key === "string") expect(key).toBe(step.key);
      else expect(key).toMatch(step.key);
      step.frames.forEach((frame, index) => {
        setTimeout(() => { screen = frame; }, (index + 1) * (step.delayMs ?? 5));
      });
      return true;
    },
  };
  return {
    bot, sent,
    snapshot: () => screen,
    done() { expect(offset).toBe(steps.length); },
  };
}

export async function runClock<T>(operation: Promise<T>): Promise<T> {
  const settled = operation.then(value => ({ value }), error => ({ error }));
  await vi.runAllTimersAsync();
  const result = await settled;
  if ("error" in result) throw result.error;
  return result.value;
}
