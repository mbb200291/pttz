import { PttzzzClient } from "@pttzzz/core";
import { createBrowserClient } from "@pttzzz/browser";
import { mountApp } from "./app";
import "./style.css";

async function start(): Promise<void> {
  const preview=new URLSearchParams(location.search).has("preview");
  const client=preview
    ? new PttzzzClient((await import("@pttzzz/browser/testing")).createFakeBrowserGateway())
    : createBrowserClient();
  const dispose=mountApp(document.querySelector<HTMLElement>("#app")!,client,preview);
  window.addEventListener("pagehide",()=>{dispose();void client.disconnect();},{once:true});
  window.addEventListener("pageshow",event=>{if(event.persisted) location.reload();});
}
void start().catch(()=>{document.querySelector("#app")!.textContent="無法啟動介面，請重新整理。";});
