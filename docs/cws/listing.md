# Chrome Web Store Listing — TrackWise

All copy ready to paste into the Developer Dashboard. Edit before submitting if any framing reads off.

## Store icon
`docs/cws/../../apps/extension/public/icons/icon-128.png` (declared in manifest as `icons.128`)

## Screenshots to upload
Only the three dashboard shots are well-framed at 1280×800. Recommend uploading those; skip the popup and injected-button (originals were too small, the padded versions read as tiny).

- `docs/cws/01-kanban.png`
- `docs/cws/02-analytics.png`
- `docs/cws/03-detail.png`

---

## Name
TrackWise

## Summary (short description) — 132 char max
Analytics-first job application tracker. Save listings from LinkedIn and Indeed; learn from your search.

## Detailed description

TrackWise is a job application tracker built around analytics, not logging. The premise: the value of tracking applications isn't the list — it's what the list teaches you about your search. Response rates, time-to-response, source effectiveness, and semantic similarity all reveal patterns that are invisible in a plain list.

Save jobs from LinkedIn and Indeed with one click. View them on a five-column Kanban board: Applied, Screening, Interview, Offer, Rejected. Drag cards between columns as your applications progress.

The companion dashboard at trackwise-lac-nu.vercel.app gives you:

• Response rate, funnel by status, time-to-first-response, and breakdown by source
• Semantic similarity — applications are embedded via Voyage AI's voyage-3 model, then matched against your other applications using pgvector cosine search. Spot patterns in the kinds of roles you pursue without manual tagging.
• A clean, ad-free, no-upsell UI

Your data is yours. Sign-in is Google OAuth via Supabase. All data is row-level-security-isolated to your account — no other user can read or write your applications. You can delete your account and every saved row from the dashboard's Settings page at any time.

Free. Open source. Built as a solo project.

## Single purpose
Save job postings from LinkedIn and Indeed to a personal job application tracker, and provide quick access to the user's saved applications.

## Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Persist the user's authenticated session (Supabase access + refresh tokens) and minimal UI state in `chrome.storage.local`, so the user stays signed in across browser restarts and the service worker can resume after termination. |
| `activeTab` | Read the DOM of the job listing the user invoked the extension on, to extract title, company, location, and salary fields. Only triggered when the user clicks the injected Save button. |
| `identity` | Run the OAuth sign-in flow via `chrome.identity.launchWebAuthFlow`. Google is the identity provider via Supabase Auth. No access to other Google account data. |
| Host: `https://www.linkedin.com/jobs/*` | Inject the Save button onto LinkedIn job listing pages and read job metadata from the page DOM when the user clicks Save. |
| Host: `https://*.indeed.com/viewjob*` | Same purpose, on Indeed's job detail pages. |
| Host: `https://*.indeed.com/jobs*` | Same purpose, on Indeed's job search pages where a job is selected (`?vjk=...`). |

The extension does not request `<all_urls>`, `tabs`, `cookies`, or `webRequest`.

## Privacy practices form

**Data collected and used:**
- Authentication information (email address) — collected during Google OAuth sign-in, used only to identify the user's account.
- Personally identifiable information — none beyond the email above. No name, phone, address, etc.
- Health, financial, location info — none.
- User activity — yes, in the limited sense that the rows the user explicitly saves (job postings + their notes + their status transitions) are stored. Used only to display back to the user and compute analytics for their own account.
- Website content — read on user invocation only (the job listing the user clicks Save on). Not transmitted off-device except to the user's own Supabase database as structured fields.

**Certifications:**
- ☑ I do not sell or transfer user data to third parties outside of the approved use cases.
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://trackwise-lac-nu.vercel.app/privacy`

## Distribution
- Visibility: Public
- Regions: All

## Category
Productivity
