(() => {
  "use strict";

  const BLOCKED_EVENT = "tabfence:blocked";
  const DEBUG = "[TabFence debug-202603]";
  const TOAST_ID = "tabfence-blocked-notice";
  const sendMessage = globalThis.chrome?.runtime?.sendMessage?.bind(globalThis.chrome.runtime);
  let toastTimer;

  if (!sendMessage) {
    console.warn(DEBUG, "bridge has no extension runtime");
    return;
  }

  function showBlockedNotice() {
    let host = document.getElementById(TOAST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = TOAST_ID;
      const shadow = host.attachShadow({ mode: "closed" });
      shadow.innerHTML = `
        <style>
          :host { all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; }
          div { box-sizing: border-box; max-width: min(360px, calc(100vw - 32px)); padding: 12px 16px; border: 1px solid #684f1d; border-radius: 8px; background: #fff8e7; color: #211a0d; box-shadow: 0 8px 24px #0004; font: 14px/1.4 system-ui, sans-serif; }
          strong, span { display: block; } span { margin-top: 2px; color: #594721; font-size: 12px; }
          button { margin-top: 8px; min-height: 32px; padding: 4px 10px; border: 1px solid #684f1d; border-radius: 4px; background: transparent; color: #211a0d; font: inherit; cursor: pointer; }
          button:focus-visible { outline: 2px solid #211a0d; outline-offset: 2px; }
          @media (prefers-reduced-motion: no-preference) { :host { animation: tabfence-in 160ms ease-out; } @keyframes tabfence-in { from { opacity: 0; transform: translateY(8px); } } }
        </style>
        <div role="status"><strong>Website-opened tab blocked.</strong><span>To open a link, use Ctrl/Cmd-click, middle-click, or the link menu.</span><span>Need to allow this site? Open TabFence in your browser toolbar and choose "Pause on this site".</span><button type="button">Dismiss</button></div>`;
      shadow.querySelector("button").addEventListener("click", () => {
        clearTimeout(toastTimer);
        host.remove();
      });
      (document.body || document.documentElement).append(host);
    }

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => host.remove(), 10000);
  }

  window.addEventListener(BLOCKED_EVENT, () => {
    console.log(DEBUG, "relaying blocked attempt");
    sendMessage({ type: "blocked" }).catch((error) => console.warn(DEBUG, "relay failed", error));
  });

  window.addEventListener("pointerdown", (event) => {
    if (!event.isTrusted || (event.button !== 1 && !(event.button === 0 && (event.ctrlKey || event.metaKey)))) return;
    if (!event.composedPath().some((node) => node instanceof HTMLAnchorElement && node.href)) return;
    sendMessage({ type: "explicit-new-tab-gesture" }).catch(() => {});
  }, true);

  window.addEventListener("contextmenu", (event) => {
    if (!event.isTrusted) return;
    const link = event.composedPath().find((node) => node instanceof HTMLAnchorElement && node.href);
    if (link) sendMessage({ type: "context-link", url: link.href }).catch(() => {});
  }, true);

  let guardResponded = false;
  window.addEventListener("tabfence:guard-active", () => { guardResponded = true; });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "show-blocked-notice") showBlockedNotice();
    if (message.type === "get-page-state") {
      guardResponded = false;
      window.dispatchEvent(new Event("tabfence:status-request"));
      sendResponse({ guarded: guardResponded });
    }
  });
})();
