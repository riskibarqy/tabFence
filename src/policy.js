(() => {
  "use strict";

  function isNewContextTarget(target) {
    const name = String(target || "").trim().toLowerCase();
    return Boolean(name && !["_self", "_top", "_parent"].includes(name));
  }

  function shouldBlockNewContext(event, target) {
    if (!isNewContextTarget(target)) return false;
    if (!event?.isTrusted) return true;

    return Boolean(
      (event.button === 0 || event.type === "touchstart") &&
        !event.defaultPrevented &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey
    );
  }

  globalThis.TabFencePolicy = { isNewContextTarget, shouldBlockNewContext };
})();
