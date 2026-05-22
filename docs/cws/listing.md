# Chrome Web Store Listing — TrackWise

All copy ready to paste into the Developer Dashboard. Edit before submitting if any framing reads off.

## Store icon
`apps/extension/public/icons/icon-128.png` (declared in manifest as `icons.128`)

## Screenshots to upload
Five 1280×800 captures from the live production deployment, in this carousel order:

1. `docs/cws/01-overlay-check-fit.png` — Check fit overlay open on a LinkedIn job page (lead/banner)
2. `docs/cws/02-kanban.png` — Kanban with multiple applications
3. `docs/cws/03-detail-resume-fit.png` — Application detail with resume fit card + reasoning + similar applications
4. `docs/cws/04-analytics.png` — Analytics page with response rate, funnel, time-to-response, source breakdown
5. `docs/cws/05-resume.png` — Resume page with paste/upload UX

The popup screenshot used in earlier drafts is omitted — the popup is a thin auth dialog and reads as visually empty at 1280×800. Keep the carousel focused on the in-context features users actually interact with.

---

## Name
TrackWise

## Summary (short description) — 132 char max
Save jobs from LinkedIn and Indeed in one click. AI-powered resume-fit scores and analytics that show what's working.

(115 chars — leaves room to edit.)

## Detailed description

TrackWise turns your job search into something you can learn from.

CAPTURE
• One-click save from LinkedIn and Indeed job pages.
• The extension parses the role, company, location, and full job description and stores them in your TrackWise account.

CHECK BEFORE YOU APPLY
• A Check fit button on every supported job page shows how well the role matches your resume — with a one-sentence reason citing which section of your resume best supports the score.
• Also shows how similar this job is to ones you've already applied to.

TRACK
• A clean five-column Kanban: Applied → Screening → Interview → Offer → Rejected. Drag to update.
• Per-application detail page with editable notes, status history, job description, and similar applications.
• CSV export of all your data.

LEARN
• Analytics page: response rate, funnel by stage, time-to-first-response histogram, response rate by source.
• Cluster analytics: K-means over Voyage AI embeddings groups your applications by theme, so you can see which kinds of roles actually convert.

PRIVACY
• Your data lives in a Supabase Postgres database in Canada (ca-central-1), row-level-security-scoped to your account.
• Resume PDF/DOCX files are parsed in your browser; only the extracted text is uploaded.
• No tracking, no ads, no upsells. Account deletion is one click and cascades to every saved row.

Privacy policy: https://trackwise-lac-nu.vercel.app/privacy
Source: github.com/BandonC/TrackWise

## Single purpose
TrackWise captures job postings from LinkedIn and Indeed into the user's TrackWise account so the dashboard can score them against the user's resume and surface analytics across their applications. The extension's only role is the capture-and-score step on supported job boards.

## Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Required to persist the user's Supabase authentication session (so they don't sign in every time the browser opens) and a per-user, per-URL cache of fit scores so re-checking the same job within 24 hours doesn't waste API calls. All values live in `chrome.storage.local` on the user's device only. |
| `activeTab` | Required to read the role title, company name, location, and job description text from the LinkedIn or Indeed job listing the user is currently viewing — only at the moment they click the extension's Save or Check fit button. The extension does not read tabs the user has not interacted with. |
| `identity` | Required for Google OAuth sign-in via `chrome.identity.launchWebAuthFlow`. This is the only way to authenticate the user to the TrackWise backend (Supabase) so saved jobs are scoped to their account. The default Supabase JS sign-in flow does not work inside an extension context. |
| Host: `https://www.linkedin.com/jobs/*` | Required to inject the Save and Check fit buttons on LinkedIn job listing pages and to extract the role, company, location, and job description text from those pages. The extension's content script only runs on this URL pattern — never on any other LinkedIn page or any other site the user visits. |
| Host: `https://*.indeed.com/viewjob*` | Same purpose, on Indeed's job detail pages. |
| Host: `https://*.indeed.com/jobs*` | Same purpose, on Indeed's job search pages where a job is selected (`?vjk=...`). |

The extension does not request `<all_urls>`, `tabs`, `cookies`, or `webRequest`.

## Privacy practices form

**Data collected and used:**
- **Personally identifiable information** — email address received from Google during OAuth sign-in. Used only to identify the user's account.
- **Authentication information** — Supabase JWT access and refresh tokens, stored in `chrome.storage.local` on the user's device. Never transmitted off-device except in the `Authorization` header of requests to the user's own Supabase project.
- **Website content** — when the user explicitly clicks the extension's Save or Check fit button on a LinkedIn or Indeed job page, the extension reads the job's role, company, location, and description text from the page DOM. This data is transmitted only to the user's own Supabase project and (for fit scoring) to Voyage AI for embedding and Anthropic for resume-fit scoring. Both third parties receive only the job's text content and the relevant sections of the user's resume — never the user's email or any other identifier.

**Not collected:** health information, financial information, payment information, location, web browsing history, user activity outside of the supported job board pages where the user explicitly invokes the extension.

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

## Language
English (US)
