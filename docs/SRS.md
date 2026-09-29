# TabFence Software Requirements Specification (Draft)

**Product:** TabFence  
**Target:** Manifest V3, Chrome/Brave/Edge  
**Scope:** MVP 1.0  
**Source of truth:** `docs/PRD.md`; unresolved decisions are recorded there.

## Terms

- **Script-selected destination:** A URL chosen by page JavaScript, including one passed to `window.open()` during a real click.
- **Ordinary left-click:** A trusted primary-button click without Ctrl/Cmd, Shift, or Alt. It is not an explicit new-tab gesture.
- **Direct link:** An `<a href>` selected by a real user click; a synthetic `.click()` or dispatched event does not qualify.
- **Explicit user opening:** A browser New Tab command, trusted Ctrl/Cmd-click or middle-click, or native context-menu Open Link in New Tab/Window.
- **Allowed site:** The current page's exact hostname is on the local allowlist.
- **Blocked attempt:** A page-initiated opening prevented before a new tab/window is created.
- **Current page:** The top-level tab document; intercepted iframe attempts, where supported, contribute to that tab's visible count.

## Functional requirements

| ID | Priority | Requirement | Verification |
|---|---|---|---|
| NAV-01 | P0 | On eligible top-level pages where interception is active, block page-script `window.open()` calls, including synchronous calls in real click handlers and delayed calls. Never redirect their URLs into the current tab. | Call without input, during a real click, and from a timer; current URL and tab/window count stay unchanged. Validate early interception in Chromium before claiming full coverage. |
| NAV-02 | P0 | A synthetic `.click()` or dispatched event must not authorize a new tab/window or a same-tab redirect, including through a `window.open()` handler. | Trigger both without trusted input; current URL and tab/window count stay unchanged. Nested synthetic events require browser validation before claiming coverage. |
| NAV-03 | P0 | Block an ordinary left-click on a link, form, or form control targeting a new/named browsing context; do not redirect its URL into the current tab or synthesize a click-through. | Click direct and overlay links, then submit forms with `_blank` and named targets; current URL and tab/window count stay unchanged; blocked count increments. |
| NAV-04 | P0 | Preserve trusted Ctrl/Cmd-click and middle-click link navigation as browser-managed new tabs. | Test both gestures on blank and ordinary links. |
| NAV-05 | P0 | Preserve browser New Tab button, Ctrl/Cmd+T, and right-click Open Link in New Tab/Window. Match the context-menu target to the right-clicked link's URL; expire the exemption after 30 seconds. | Exercise each command; ensure unrelated or stale popup URLs still close. |
| NAV-06 | P0 | Close HTTP(S) navigation targets with a confirmed source-tab opener, or popup windows with an opener, unless they follow a trusted Ctrl/Cmd-click or middle-click. Leave browser-created ordinary tabs untouched. | Trigger hostile targets and popup windows, then browser New Tab button and Ctrl/Cmd+T; only confirmed site targets close. |
| NAV-07 | Validation target | Apply protection in eligible child frames, including initiator-related opaque frames; do not claim untested same-origin, cross-origin, nested, or sandboxed frame coverage. | Browser-test each frame type, including sandboxed `about:blank`; record unsupported cases before marking supported. |
| SITE-01 | P0 | Global protection defaults on; after reload, disabled protection does not change site navigation. | Toggle off, reload, then repeat guarded cases. |
| SITE-02 | P0 | Users can add/remove the current site's exact hostname; after reload, allowed hosts bypass navigation changes in that site's top-level tab. | Allow host, reload, repeat guarded cases; remove, reload, confirm protection returns. |
| SITE-03 | P0 | Hostname matching is exact; a rule for `example.com` does not implicitly allow `sub.example.com`. | Test parent/subdomain separately. |
| UI-01 | P0 | Popup shows protection state, current site's allowance, and current page's blocked-attempt count; controls reflect saved state. | Open, change, reopen popup. |
| UI-02 | P0 | Badge shows current page's blocked-attempt count, if nonzero; a new page starts at zero. | Block twice, navigate, inspect badge and popup. |
| UI-03 | P1 | User can toggle a brief, non-modal block notice. The notice explains Ctrl/Cmd-click and middle-click, never clicks through, requests confirmation, or uses a system notification. | Toggle on and off; block an attempt; verify only the enabled case shows the notice. |
| DATA-01 | P0 | Persist protection state and allowed hostnames locally; do not transmit settings, page content, or browsing activity. | Restart browser; inspect storage and network behavior. |

No page may forge a direct link click via `dispatchEvent()` or `.click()`. A real click never authorizes navigation to a URL chosen by `window.open()`, regardless of timing. Legitimate popup-dependent sites must use the allowlist or protection toggle.

## UI and configuration

The popup exposes global protection, the current site's allowance, and the current page's count. A small settings view may manage hostnames if popup space is insufficient. No rule editor or per-site policy engine is required for P0. Compatibility Mode and Allow Once are P1, not required to satisfy the MVP.

When the active tab is a restricted origin or has no usable hostname, disable the site allowance control and indicate that protection is unavailable there. Do not claim those pages are guarded.

## Architecture constraints

- Target interception before page scripts and in eligible frames. Verify page-world access, content-script isolation, frame restrictions, and event timing with Chromium browser tests before claiming coverage.
- Keep enforcement on-device. Use extension-local storage for durable settings; avoid persisting full URLs or navigation history for the badge.
- Request only permissions justified by implemented behavior. Explain broad host access in product copy; do not add `tabs` or `scripting` solely because they appear in a proposed stack.
- A blocked page-world `window.open()` must not expose an apparently usable window object; avoid creating and then closing unwanted tabs. Never navigate to its URL on the site's behalf.
- Register the guard only for protected sites; use the extension content-script registry to exclude exact allowlisted hosts. A changed global/site setting applies to newly loaded documents; the popup must prompt users to reload an already guarded page.
- Use native Manifest V3 JavaScript and an event-driven service worker; do not add WebAssembly, a long-lived background page, per-tab timers, polling, DOM scans, or large filter data solely for this policy. Keep per-page state bounded to what the badge and popup need.
- Do not use ad lists, ad classification, cosmetic filters, or network-request blocking. Interception of `window.open()` can be detected by page code; do not claim stealth or try to disguise it.

## Quality and privacy requirements

| ID | Requirement | Verification |
|---|---|---|
| Q-01 | One build runs on current Chrome, Brave, and Edge without browser-specific code forks. | Run acceptance matrix in all three browsers. |
| Q-02 | No accounts, analytics, remote servers, page-content upload, or browsing-history storage. | Review code, manifest, storage keys, and network requests. |
| Q-03 | Guarding must not break ordinary same-tab links, form submissions, or browser navigation controls. Ordinary blank-link clicks are intentionally blocked. | Smoke-test each interaction on representative sites. |
| Q-04 | Popup controls are keyboard-operable and have accessible names and visible focus. | Keyboard-only and accessibility inspection. |
| Q-05 | Failures and browser restrictions are documented honestly; unsupported origins must not display a false protected state. | Check restricted pages and interception failure cases. |
| Q-06 | TabFence changes only the specified navigation behavior; it neither blocks ads as content nor requests as traffic. | Inspect manifest and code; confirm unrelated ad requests and elements are unaffected. |
| Q-07 | Idle operation avoids polling and recurring work; extension overhead is measured before release, not assumed from the implementation language. | Profile extension-on/off idle memory, CPU wakeups, and click latency with 1, 20, and 100 tabs in Chrome, Brave, and Edge; publish measured results and set release budgets. |

## Test matrix

1. Real click handler calls `window.open(url)` synchronously: current URL and tab/window count stay unchanged; blocked count increments once.
2. No gesture or delayed script calls `window.open()`: current URL and tab/window count stay unchanged; blocked count increments once per attempt.
3. Real click handler schedules `setTimeout(() => window.open(url), 3000)`: no navigation or new tab/window; blocked count increments.
4. Synthetic `.click()` and `dispatchEvent()` targeting a blank link or invoking a `window.open()` handler: no new tab/window or same-tab redirect.
5. Ordinary left-click on blank/named-target links and submissions from blank/named-target forms: no navigation or new tab/window; blocked count increments; no click-through is synthesized.
6. Ctrl/Cmd-click and middle-click on regular and blank links: one new tab; no blocked count increment.
7. Browser plus button, Ctrl/Cmd+T, and right-click Open Link in New Tab/Window: requested tab/window opens; no blocked count increment.
8. Confirmed website-created navigation target: destination closes; source count increments. A brief Chromium-visible flash is possible. Targets without a confirmed opener remain untouched. Browser-test early page-script opening, nested synthetic events, same-origin, cross-origin, nested and sandboxed iframe openings, and pop-unders.
9. After reload, allowlisted hostname and protection off: site behavior unchanged; no blocked count increment for bypassed attempts.
10. Navigate/reload, reopen popup, restart browser: page count resets on navigation; durable settings remain.
11. Restricted browser page: controls clearly indicate no site protection; no misleading badge.
12. With ads present but no popup attempt: TabFence does not filter their requests or hide their elements; extension remains idle absent relevant events.

## Out of scope / pending

- Allow Once, Compatibility Mode, temporary permissions, optional toasts, popup history, import/export, Firefox, Safari, settings sync, and wildcard/domain-suffix allow rules.
- Strict cleanup happens after Chromium creates a target, so a brief flash is possible. Chromium does not expose native context-menu selection; a site opening the exact right-clicked link URL within 30 seconds cannot be distinguished from the browser menu action. Exact coverage of early scripts, nested synthetic events, `about:blank`/sandboxed/cross-origin frames, named-window reuse, `target` on forms, programmatic navigations, and alternate tab-creation APIs requires Chromium browser tests.
- Malicious `target="_self"` navigation and other same-tab redirects are out of scope; they require a separate navigation-control feature.
