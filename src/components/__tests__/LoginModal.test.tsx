import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

describe("LoginModal", () => {
  it("shows duplicate-session opt-in on the login form", async () => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {
        protocol: "http:",
        host: "127.0.0.1:4173",
      },
    });

    const { LoginModal } = await import("../LoginModal");
    const html = renderToStaticMarkup(
      <LoginModal pttState={"need_login" as never} wsStatus="connected" />,
    );

    expect(html).toContain("中斷其他連線");
    expect(html).toContain("預設保留其他已登入的 PTT 連線");
  });

  it("uses the tokenized login dialog surface from the design", async () => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {
        protocol: "http:",
        host: "127.0.0.1:4173",
      },
    });

    const { LoginModal } = await import("../LoginModal");
    const html = renderToStaticMarkup(
      <LoginModal pttState={"need_login" as never} wsStatus="connected" />,
    );

    expect(html).toContain("var(--surface)");
    expect(html).toContain("var(--border-strong)");
    expect(html).toContain("var(--accent)");
  });

  it("shows a syncing message when PTT is updating online users and friends", async () => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {
        protocol: "http:",
        host: "127.0.0.1:4173",
      },
    });

    const { LoginModal } = await import("../LoginModal");
    const html = renderToStaticMarkup(
      <LoginModal pttState={"syncing_users" as never} wsStatus="connected" />,
    );

    expect(html).toContain("正在更新與同步線上使用者及好友名單");
    expect(html).not.toContain("驗證中，請稍候");
  });

  it("shows a retry message when login is rate-limited", async () => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {
        protocol: "http:",
        host: "127.0.0.1:4173",
      },
    });

    const { LoginModal } = await import("../LoginModal");
    const html = renderToStaticMarkup(
      <LoginModal pttState={"login_rate_limited" as never} wsStatus="connected" />,
    );

    expect(html).toContain("登入太頻繁");
    expect(html).toContain("請稍後再試");
  });
});
