(() => {
  "use strict";

  const BLOCKED_EVENT = "tabfence:blocked";
  const { shouldBlockBlankAnchor } = globalThis.TabFencePolicy;
  delete globalThis.TabFencePolicy;

  function blockAttempt() {
    window.dispatchEvent(new CustomEvent(BLOCKED_EVENT));
    return null;
  }

  function findAnchor(event) {
    for (const node of event.composedPath()) {
      if (node instanceof HTMLAnchorElement) return node;
    }
    return null;
  }

  // Run before page handlers so an overlay cannot turn a plain click into a new tab.
  document.addEventListener(
    "click",
    (event) => {
      if (window.top !== window) return;
      const anchor = findAnchor(event);
      if (!shouldBlockBlankAnchor(event, anchor)) return;

      event.preventDefault();
      blockAttempt();
    },
    true
  );

  // Registration determines whether this guard exists; page events cannot disable it.
  Object.defineProperty(window, "open", {
    configurable: false,
    writable: false,
    value: function tabFenceOpen() {
      return blockAttempt();
    }
  });
})();
