(() => {
  "use strict";

  function isBlankAnchor(anchor) {
    return Boolean(anchor && anchor.target.toLowerCase() === "_blank" && anchor.href);
  }

  function shouldBlockBlankAnchor(event, anchor) {
    if (!event || !isBlankAnchor(anchor)) return false;
    if (!event.isTrusted) return true;

    return Boolean(
      event.button === 0 &&
        !event.defaultPrevented &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey
    );
  }

  globalThis.TabFencePolicy = { isBlankAnchor, shouldBlockBlankAnchor };
})();
