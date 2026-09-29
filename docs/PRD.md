# TabFence Product Requirements (Draft)

**Product:** TabFence  
**Tagline:** Sites stay in their tab.  
**Platform:** Chromium extensions (Chrome, Brave, Edge)  
**Release:** MVP 1.0

## Problem and promise

A site can place a transparent new-tab link over a legitimate control, such as a video Play button. Browser popup blocking does not always prevent this. TabFence blocks ordinary new-tab link clicks and script-selected popup destinations while preserving explicit browser new-tab actions.

**Product rule:** Websites don't choose when or where new tabs open. You do.

TabFence is a navigation-control extension, not an ad blocker. It does not classify ads, filter domains, block network requests, or hide page content. Sites may still observe changed popup behavior; undetectability cannot be promised.

## Users and outcomes

- A normal left-click on a `target="_blank"` link is blocked by default.
- Any script-generated `window.open()` is blocked, even during a real click; legitimate sites can be allowlisted.
- Ctrl/Cmd-click, middle-click, the link context menu, browser New Tab, and Ctrl/Cmd+T behave normally.
- Users can disable protection or allow a site that needs popup-based flows (for example, OAuth or payments).
- Users can see blocked attempts in the current-page count and an optional brief notice.

## MVP policy

| Initiator | Default result |
|---|---|
| Browser New Tab UI or Ctrl/Cmd+T | Allow |
| Trusted Ctrl/Cmd-click, middle-click, or context-menu Open Link on a link | Allow requested new tab/window |
| Normal left-click on a direct `<a href>` link without `target="_blank"` | Browser same-tab navigation |
| Normal left-click on a link, form, or form control targeting a new/named browsing context | Block; do not navigate or create a tab/window |
| Any script-generated `window.open()`, even during a real click or after a timeout | Block; do not navigate or create a tab/window |
| Synthetic `.click()` or dispatched event requests a new tab | Block; do not navigate or create a tab/window |
| Allowed hostname or protection off | Do not interfere |

A normal left-click must never create a new tab/window unless the user explicitly performs a new-tab gesture. A click on a button does not authorize the URL that page JavaScript passes to `window.open()`. Timing and `event.isTrusted` cannot establish intent for script-selected URLs. Legitimate popup-dependent sites use the site allowlist or protection toggle.

## P0: MVP

- Block `window.open()` on eligible top-level pages, including click-triggered calls; validate iframe and pop-under coverage in browsers before claiming it.
- Preserve explicit user-initiated browser navigation.
- Block ordinary left-clicks on links, forms, and form controls that target a new/named browsing context, including transparent overlay links; never redirect their URLs or a `window.open()` destination.
- Provide a global protection toggle and an exact-hostname allowlist.
- Show a per-page blocked-attempt count on the extension icon and in a minimal popup.
- Ship one extension package for Chrome, Brave, and Edge.
- Keep all settings and counters local; collect no browsing history, analytics, or page content.
- Keep idle overhead low: no ad-filter lists, continuous scans, polling, or persistent background work; process relevant navigation events only.

Popup: product name, protection toggle, blocked count, current-site allow toggle, and block-notice toggle. Changes apply to newly loaded documents; prompt for reload when the current page already has a guard. Notices are non-modal, brief, and user-disableable.

## P1: After MVP

Allow once; Compatibility Mode for directly clicked `target="_blank"` links; temporary site permission; per-site rules; optional notifications and popup history; configuration import/export.

## P2: Later

Firefox; Safari; settings sync; community rules; advanced policies; statistics.

## Acceptance scenarios

1. A `window.open()` from a real click does not navigate or create a tab/window.
2. An automatic `window.open()` or one deferred with `setTimeout` after a click does not navigate or create a tab/window.
3. A synthetic click on a `target="_blank"` link creates no tab/window.
4. An ordinary left-click on a new-context link, form, form control, or overlay does not navigate or create a tab/window.
5. Ctrl/Cmd-click, middle-click, and right-click Open Link in New Tab/Window still work.
6. Browser New Tab and Ctrl/Cmd+T are unaffected.
7. After reload, an allowed hostname or global protection off leaves site navigation unchanged.
8. Each blocked attempt increments the current page's count. When enabled, a brief non-modal notice explains the Ctrl/Cmd-click and middle-click escape hatch; it never clicks through or requests confirmation.
9. The same package passes these scenarios in Chrome, Brave, and Edge.
10. With protection on, unrelated ads and page content remain untouched; no network-request or cosmetic filtering occurs.

## Privacy and scope

Manifest V3; local-only operation; minimum permissions needed for enforcement, local settings, and badge. Host access to eligible websites requires clear disclosure. No accounts, servers, analytics, cloud sync, or stored browsing history. Browser-controlled pages and other restricted origins may not be protectable; disclose those limits rather than claiming universal coverage. Use native Chromium extension JavaScript APIs rather than adding a runtime solely to change language; measure memory and click latency against the browser without TabFence before claiming performance benefits.

## Open decisions and validation gates

- **Controls:** The draft settings list includes Compatibility Mode, Allow Once, and several switches, but the priority list puts the first two in P1. Confirm if either must move into P0.
- **Browser validation:** Strict cleanup closes targets with a confirmed opener after Chromium creates them; opener-less targets remain untouched to protect browser New Tab actions. A brief flash remains possible. Ctrl/Cmd-click and middle-click use a short-lived source-frame gesture exemption. A right-clicked link's exact URL has a 30-second exemption; Chromium does not expose native context-menu selection, so a site opening that same URL during the interval cannot be distinguished. Add Chromium browser tests before marking each supported.
- **Limitation:** This policy does not prevent malicious `target="_self"` navigation or every possible same-tab redirect. Treat same-tab navigation control as a separate feature.
- **Operational behavior:** Confirm desired behavior when protection cannot be injected (fail open with disclosure vs some other approach).
- **Performance validation:** Benchmark idle memory, CPU wakeups, and click latency with 1, 20, and 100 tabs in each target browser; record extension-on versus extension-off results before release. Set numeric budgets from these measurements rather than claiming zero overhead or an unmeasured RAM target.
