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
      host.attachShadow({ mode: "closed" }).innerHTML = `
        <style>
          :host { all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; }
          div { box-sizing: border-box; max-width: min(360px, calc(100vw - 32px)); padding: 12px 16px; border: 1px solid #684f1d; border-radius: 8px; background: #fff8e7; color: #211a0d; box-shadow: 0 8px 24px #0004; font: 14px/1.4 system-ui, sans-serif; }
          strong, span { display: block; } span { margin-top: 2px; color: #594721; font-size: 12px; }
          @media (prefers-reduced-motion: no-preference) { :host { animation: tabfence-in 160ms ease-out; } @keyframes tabfence-in { from { opacity: 0; transform: translateY(8px); } } }
        </style>
        <div role="status"><strong>New tab blocked.</strong><span>Use Ctrl/Cmd-click, middle-click, or the link menu for intended links.</span></div>`;
      (document.body || document.documentElement).append(host);
    }

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => host.remove(), 4500);
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

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "show-blocked-notice") showBlockedNotice();
  });
})();
