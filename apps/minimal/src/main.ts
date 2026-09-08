import { PttzzzClient } from "@pttzzz/core";
import { createBrowserClient } from "@pttzzz/browser";
import { Reader } from "./controller";
import { mount } from "./view";
import "./style.css";

const preview = new URLSearchParams(location.search).get("preview") === "1";
const fake = preview ? await import("@pttzzz/browser/testing") : null;
const createClient = () => fake ? new PttzzzClient(fake.createFakeBrowserGateway()) : createBrowserClient();
let render = () => {};
const reader = new Reader(createClient, () => render());
render = mount(document.querySelector<HTMLElement>("#app")!, reader, preview);
if (preview) {
  await reader.login("preview", "preview");
  await reader.hotBoards();
}
window.addEventListener("pagehide", () => { void reader.dispose(); }, { once: true });
window.addEventListener("pageshow", (event) => { if (event.persisted) location.reload(); });
