# TrackWise Chrome Extension

Manifest V3 Chrome extension that detects job postings on supported sites and saves them to Supabase. Read [the root CLAUDE.md](../../CLAUDE.md) first — this file only adds extension-specific rules.

## Stack (locked)

- TypeScript (strict mode), vanilla — **no React in the extension**.
- Vite + @crxjs/vite-plugin for the build.
- @supabase/supabase-js for database access.
- Manifest V3. There is no V2 fallback. New submissions to the Web Store must be V3.

## Things I need to fill in for this app

- `apps/extension/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- The extension ID, which only exists after the first `Load unpacked` in `chrome://extensions`. Once I have it, it goes into:
  - Supabase auth redirect URL allowlist (`chrome-extension://<id>/...`)
  - Any OAuth client ID configuration that needs the extension origin
- For publishing: screenshots, icons (16, 32, 48, 128 px), and a privacy policy URL

If you need any of these and they aren't set, ask. Don't fabricate an extension ID.

## Component layout

```
src/
  content/
    detector.ts              # URL + DOM check; picks a parser; injects the save button.
    linkedin-parser.ts       # LinkedIn-specific selectors + extraction.
    indeed-parser.ts         # Indeed-specific selectors + extraction.
    parser-types.ts          # Shared parser interface.
  background/
    service-worker.ts        # Holds session, receives messages, writes to Supabase.
    auth.ts                  # OAuth flow via chrome.identity.launchWebAuthFlow.
  popup/
    index.html
    popup.ts                 # Recent saves list, manual add form, sign-in button.
  lib/
    supabase.ts              # Client setup. Reads from chrome.storage.
    storage.ts               # Thin wrapper over chrome.storage.local.
    types.ts
manifest.json                # Or manifest.config.ts if using crxjs's TS config.
```

## Manifest V3 service worker — the gotchas

This is the single most error-prone part of the extension. Read carefully.

- **Service workers terminate.** They go to sleep after ~30 seconds of inactivity. Anything in worker memory is lost.
- **Never store state in module-level variables.** Use `chrome.storage.local`. Re-hydrate on every invocation.
- **Don't use `setInterval` or `setTimeout` for long durations.** They don't survive worker termination. Use `chrome.alarms` for anything beyond a few seconds.
- **Top-level `await` is fine** in the service worker (Manifest V3 supports module workers), but heavy work at top-level delays event handlers. Keep top-level work minimal.
- **Don't use `XMLHttpRequest`.** Use `fetch`. Most older Chrome extension snippets on the web are V2 and use APIs that don't exist in V3.

## Content script rules

- Content scripts run in an **isolated world** — they share the page's DOM but not its JavaScript context. You cannot read `window.someVar` from the page's scripts.
- **The injected save button must not break the page.** Wrap any DOM mutation in try/catch. If injection fails, log and move on — don't let the extension crash the user's LinkedIn.
- **Never trust the parsed data.** LinkedIn and Indeed change their DOM regularly. Each parser must:
  - Use multiple fallback selectors per field.
  - Return a partial object with `null` for fields that couldn't be parsed.
  - Never throw on missing fields.
- **Treat all parsed DOM content as untrusted HTML.** Job listings can contain injected scripts or markup. Always extract text via `.textContent` or `.innerText` — never via `.innerHTML`. Sending raw HTML to Supabase creates an XSS risk when the dashboard renders it.
- **The save flow must always offer manual entry as a fallback.** If parsing returns mostly `null`, the popup form should pre-fill what we got and let the user fill the rest.
- The content script does **not** talk to Supabase directly. It posts a message to the background worker. The worker holds the session.

## Messaging between content script, popup, and background

Use `chrome.runtime.sendMessage` and `chrome.runtime.onMessage`. Define a discriminated union of message types in `src/lib/types.ts`:

```ts
type Message =
  | { type: "save_application"; payload: ParsedJob }
  | { type: "get_recent"; limit: number }
  | { type: "sign_in" }
  | { type: "sign_out" }
  | { type: "get_session" };
```

The background worker has a single `onMessage` listener that switches on `message.type`. Don't sprinkle multiple listeners.

## Authentication flow

- The extension uses **`chrome.identity.launchWebAuthFlow`** with Supabase's OAuth endpoint, not the Supabase JS SDK's default browser flow (which won't work in an extension context).
- The redirect URL is `https://<extension-id>.chromiumapp.org/`. Add this to Supabase Auth's "Redirect URLs" allowlist.
- After the OAuth flow, parse the access token from the redirect URL fragment, then call `supabase.auth.setSession({ access_token, refresh_token })`.
- Store the session in `chrome.storage.local`. The Supabase client is constructed with a custom storage adapter that reads/writes there.
- Refresh tokens are handled by the Supabase client automatically as long as the storage adapter persists.

If any of this isn't working, ask before changing strategy. The number of plausible-but-wrong OAuth-in-extension solutions is high.

## Bundle size and performance

The popup must feel instant and the content script must not slow down LinkedIn.

- **No React.** No component framework. Vanilla TS only.
- **No Recharts, no chart libraries** — the dashboard is for that.
- Lazy-load anything heavy in the popup (`import()` for example) rather than eager-loading.
- The content script should add **less than 50KB** to the page. If you're about to import something that crosses that, flag it.
- `@supabase/supabase-js` is the heaviest necessary dep. Don't add more.

## Permissions discipline

- Request only what's used. Currently: `storage`, `activeTab`. Host permissions limited to LinkedIn job pages and Indeed view-job pages.
- **Never request `<all_urls>`, `tabs`, `cookies`, or `webRequest`.** These trigger heavy review scrutiny and the user-facing install warning becomes much scarier.
- If a feature would need a new permission, **ask first.** I'd rather drop the feature than expand permissions.

## Adding a new job site parser

When I ask for a new parser (e.g., Wellfound), the steps are:

1. Add the host pattern to `manifest.json` `host_permissions` and `content_scripts.matches`.
2. Create `src/content/<site>-parser.ts` implementing the shared parser interface.
3. Update `src/content/detector.ts` to route to it.
4. Test on at least three different real listings on that site.
5. Update the README's "supported sites" list.

Don't shortcut step 4. Parsers that work on one listing fail on others routinely.

## Build and dev workflow

- `pnpm dev` runs Vite in watch mode, output to `dist/`.
- Load `dist/` via `chrome://extensions → Load unpacked` once. After that, just hit the refresh icon on the extension card after each rebuild.
- **The popup hot-reloads. Content scripts and the service worker do not.** After changing those, refresh the extension card and refresh the test page.
- Don't add a custom dev server proxy or hot-reload setup. Vite + manual refresh is the boring, reliable path.

## Common AI mistakes — don't do these

Extension development is the most error-prone part of this project because most online examples are still Manifest V2. Be paranoid here.

### Manifest V2 patterns that don't work in V3

- **Don't use `chrome.extension.*`** — most of it is removed in V3. Use `chrome.runtime.*` or `chrome.action.*`.
- **Don't use `chrome.browserAction` or `chrome.pageAction`** — both are gone. There's only `chrome.action`.
- **Don't write a persistent background page** (`"persistent": true` is V2-only). V3 uses service workers, which terminate.
- **Don't use `XMLHttpRequest`** anywhere in the extension. Service workers don't support it.
- **Don't use remote script tags** (`<script src="https://...">`) — V3 forbids remote code. Bundle everything.
- **Don't use `eval`, `new Function()`, or any string-evaluated code.** V3's CSP blocks them.

### Storage and state

- **Don't use `localStorage` or `sessionStorage`.** They're scoped per-context (popup, content script, service worker) and don't sync. Use `chrome.storage.local` for everything.
- **Don't store state in module-level variables in the service worker.** It will be lost when the worker terminates.
- **Don't store secrets or tokens in `chrome.storage.sync`** — it's mirrored to the user's Google account. Use `chrome.storage.local`.
- **Don't store the Supabase session in `localStorage`** — even if it would work in the popup, it doesn't sync with the service worker, and the worker is what writes to the DB.

### Content script gotchas

- **Don't try to access the page's JavaScript variables** from the content script. Different worlds. If you absolutely need to, inject a `<script>` tag — but ask me first.
- **Don't use `chrome.tabs`, `chrome.windows`, or most `chrome.*` APIs from the content script.** Most of them are background/popup-only. Send a message to the service worker.
- **Don't assume the DOM is ready when the content script runs.** Job pages often render asynchronously. Use a `MutationObserver` or wait for a known selector.
- **Don't write parsers that throw on missing fields.** Return partial data with nulls.
- **Don't inject styles or DOM that fight with the host page's CSS.** Use a shadow DOM or scoped class names.

### Auth in extensions

- **Don't use `supabase.auth.signInWithOAuth({ provider: "google" })` directly** in the popup — it tries to redirect the popup window, which doesn't work cleanly in an extension. Use `chrome.identity.launchWebAuthFlow`.
- **Don't hardcode the redirect URL** with a placeholder extension ID. The ID changes between dev and published builds. Read it from `chrome.runtime.id` at runtime.
- **Don't store the access token without the refresh token.** Without the refresh token, the user gets logged out every hour.
- **Don't try to share auth cookies with the dashboard.** Extensions and websites have separate cookie jars. Each authenticates independently.

### Permissions

- **Don't request `<all_urls>`** "to make development easier." Add specific host patterns.
- **Don't request `tabs`** unless you actually need tab metadata (URL, title) from tabs the user hasn't interacted with. `activeTab` is almost always sufficient.
- **Don't request `cookies`** — we don't read or write cookies directly.
- **Don't request `webRequest` or `webRequestBlocking`** — these are for ad blockers and trigger the heaviest review scrutiny.

### Build and packaging

- **Don't commit `dist/`.** It's a build artifact. Add to `.gitignore`.
- **Don't commit the zipped extension.** It's regenerated for each Web Store submission.
- **Don't ship sourcemaps in the production build.** They expose your source. Configure Vite to strip them for production.
- **Don't include `node_modules` paths in the bundled output.** Vite handles this, but verify by inspecting `dist/` before zipping.

### Knowledge cutoff awareness

- Manifest V3 has changed since its initial rollout — `chrome.runtime.onInstalled`, action API, declarativeNetRequest, and host permission UX have all evolved. If you're applying a pattern from a 2022 tutorial, flag the uncertainty.
- @crxjs/vite-plugin has had several major versions. Check the actual installed version before generating config.

## What "done" looks like for an extension task

Before saying a feature is done:

1. Tested on a real LinkedIn job listing and a real Indeed listing.
2. The save button appears in a stable place — doesn't move on scroll, doesn't get covered by sticky headers.
3. The injected button doesn't crash the page if parsing fails.
4. The popup re-hydrates correctly after closing and reopening.
5. The service worker survives termination — close the popup, wait 60 seconds, reopen, and verify state is intact.
6. No new permissions added without explicit approval.
7. The extension still loads cleanly with no console errors in `chrome://extensions → Errors`.
8. No leftover `console.log` statements.

If you can't tick all eight, say what's missing.
