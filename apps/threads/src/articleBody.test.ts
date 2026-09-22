/* @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { plainArticleText, renderArticleBody } from "./articleBody";

describe("article body ANSI presentation", () => {
  it("renders real SGR foreground, background and bold while preserving whitespace", () => {
    const element = document.createElement("div");

    renderArticleBody(element, "  before\n\x1b[31;44;1m紅底亮字\x1b[0m  after\n");

    expect(element.textContent).toBe("  before\n紅底亮字  after\n");
    const colored = element.querySelector("span");
    expect(colored?.textContent).toBe("紅底亮字");
    expect(colored?.style.color).toBe("rgb(255, 85, 85)");
    expect(colored?.style.backgroundColor).toBe("rgb(0, 0, 170)");
    expect(colored?.style.fontWeight).toBe("700");
  });

  it("resets author styles back to the site defaults without adding styles", () => {
    const element = document.createElement("div");

    renderArticleBody(element, "plain \x1b[32mgreen\x1b[39m inherited \x1b[1mbold\x1b[22m normal");

    expect(Array.from(element.childNodes).map(node => node.textContent)).toEqual(["plain ", "green", " inherited ", "bold", " normal"]);
    const [green, bold] = Array.from(element.querySelectorAll("span"));
    expect(green.style.color).toBe("rgb(0, 170, 0)");
    expect(green.style.fontWeight).toBe("");
    expect(bold.style.color).toBe("");
    expect(bold.style.fontWeight).toBe("700");
  });

  it("keeps HTML literal and suppresses unknown terminal controls in the DOM and plain projection", () => {
    const element = document.createElement("div");
    const text = "<img src=x onerror=alert(1)>A\x1b[2J\x1b]52;c;secret\x07B\x00C";

    renderArticleBody(element, text);

    expect(element.textContent).toBe("<img src=x onerror=alert(1)>ABC");
    expect(element.querySelector("img")).toBeNull();
    expect(plainArticleText(text)).toBe("<img src=x onerror=alert(1)>ABC");
  });

  it("replaces, rather than appends to, the prior rendered body", () => {
    const element = document.createElement("div");

    renderArticleBody(element, "\x1b[31mold");
    renderArticleBody(element, "new");

    expect(element.textContent).toBe("new");
    expect(element.querySelector("span")).toBeNull();
  });
});
