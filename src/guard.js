(() => {
  "use strict";

  const BLOCKED_EVENT = "tabfence:blocked";
  const DEBUG = "[TabFence debug-202603]";
  const { isNewContextTarget, shouldBlockNewContext } = globalThis.TabFencePolicy;
  delete globalThis.TabFencePolicy;

  function blockAttempt(reason) {
    console.log(DEBUG, "blocked", reason);
    window.dispatchEvent(new CustomEvent(BLOCKED_EVENT));
    return null;
  }

  function defaultTarget() {
    return document.querySelector("base")?.target || "";
  }

  function linkTarget(anchor) {
    return anchor.getAttribute("target") || defaultTarget();
  }

  function formTarget(form, submitter) {
    return submitter?.formTarget || form.target || defaultTarget();
  }

  function clickTarget(event) {
    for (const node of event.composedPath()) {
      if (node instanceof HTMLAnchorElement) return linkTarget(node);
      if (node instanceof HTMLButtonElement || node instanceof HTMLInputElement) {
        if (node.formTarget) return node.formTarget;
        if (node.form) return formTarget(node.form, node);
      }
      if (node instanceof HTMLFormElement) return formTarget(node);
    }
    return "";
  }

  function blockPointerNavigation(event) {
    if (!shouldBlockNewContext(event, clickTarget(event))) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    blockAttempt(`new-context ${event.type}`);
  }

  // Stop page pointer handlers before they can create a browsing context.
  for (const type of ["pointerdown", "mousedown", "touchstart", "click"]) {
    window.addEventListener(type, blockPointerNavigation, true);
  }

  document.addEventListener(
    "submit",
    (event) => {
      if (!isNewContextTarget(formTarget(event.target, event.submitter))) return;

      event.preventDefault();
      blockAttempt("new-context form submit");
    },
    true
  );

  function tabFenceOpen() {
    return blockAttempt("window.open");
  }

  function tabFenceSubmit() {
    if (isNewContextTarget(formTarget(this))) return blockAttempt("form.submit");
    return nativeSubmit.call(this);
  }

  const nativeSubmit = HTMLFormElement.prototype.submit;

  // Registration determines whether this guard exists; page events cannot disable it.
  Object.defineProperty(window, "open", {
    configurable: false,
    writable: false,
    value: tabFenceOpen
  });

  Object.defineProperty(HTMLFormElement.prototype, "submit", {
    configurable: false,
    writable: false,
    value: tabFenceSubmit
  });

  // Some scripts bypass the instance method with Window.prototype.open.call(...).
  try {
    Object.defineProperty(Window.prototype, "open", {
      configurable: false,
      writable: false,
      value: tabFenceOpen
    });
  } catch (error) {
    console.warn(DEBUG, "prototype guard unavailable", error);
  }
})();
