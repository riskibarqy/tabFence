(() => {
  "use strict";

  const BLOCKED_EVENT = "tabfence:blocked";
  const sendMessage = globalThis.chrome?.runtime?.sendMessage?.bind(globalThis.chrome.runtime);

  if (!sendMessage) return;

  window.addEventListener(BLOCKED_EVENT, () => {
    sendMessage({ type: "blocked" }).catch(() => {});
  });

})();
