import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — TrackWise',
  description: 'How TrackWise collects, stores, and uses your data.',
}

const EFFECTIVE_DATE = 'May 21, 2026'
const CONTACT_EMAIL = 'brandonjchong@gmail.com'

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <header className="mb-10">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Effective {EFFECTIVE_DATE}
        </p>
      </header>

      <section className="space-y-6 text-sm leading-relaxed">
        <p>
          TrackWise is a personal job application tracker operated by Brandon
          Chong as a solo project. This policy describes what data the
          service collects, where it is stored, and how you can remove it.
        </p>

        <h2 className="pt-4 text-lg font-semibold">What we collect</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Email address</strong>, received from Google when you sign
            in. Used only to identify your account.
          </li>
          <li>
            <strong>Job application data you save</strong>: company, role,
            location, salary range, source URL, source site, status, applied
            date, and any notes you add.
          </li>
          <li>
            <strong>Job description text</strong> extracted by the Chrome
            extension from the job posting at the moment you click Save.
            Stored alongside the application so the dashboard can render it
            and use it to compute a resume-fit score.
          </li>
          <li>
            <strong>Resume text</strong>, if you paste it into the dashboard
            or upload a PDF/DOCX (file text is extracted in your browser; only
            the text is sent to the server, never the original file).
          </li>
          <li>
            <strong>Status changes</strong> you make to your applications,
            logged as timestamped events so the analytics views can compute
            response rates and time-to-response.
          </li>
        </ul>

        <h2 className="pt-4 text-lg font-semibold">What we do not collect</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>Browsing activity outside the supported job board pages where you click Save.</li>
          <li>Third-party analytics, advertising identifiers, or tracking pixels.</li>
          <li>
            Page content from sites other than the LinkedIn and Indeed job
            postings you explicitly save. The Chrome extension only reads the
            DOM of pages matching its declared host permissions, and only
            when you invoke it.
          </li>
        </ul>

        <h2 className="pt-4 text-lg font-semibold">Where your data is stored</h2>
        <p>
          Application data and account credentials are stored in a Supabase
          Postgres database hosted in Canada (ca-central-1). Row-level
          security ensures every query is filtered to the authenticated
          user&apos;s rows; no user can read another user&apos;s data.
        </p>

        <h2 className="pt-4 text-lg font-semibold">Third parties</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Supabase</strong> — hosting and authentication.{' '}
            <a
              href="https://supabase.com/privacy"
              className="underline hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              Supabase privacy policy
            </a>
            .
          </li>
          <li>
            <strong>Google</strong> — sign-in provider. We receive only your
            email address and a unique account identifier.
          </li>
          <li>
            <strong>Voyage AI</strong> — used to compute vector embeddings of
            (a) each saved application&apos;s role, company, notes, and
            captured job description, and (b) sections of your resume. These
            embeddings power the &ldquo;similar applications&rdquo; view and
            the resume-fit score. We do not send your email or any other
            identifier. See the{' '}
            <a
              href="https://www.voyageai.com/privacy"
              className="underline hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              Voyage AI privacy policy
            </a>
            .
          </li>
          <li>
            <strong>Anthropic</strong> — used to generate the resume-fit
            score and one-sentence explanation shown on each application&apos;s
            detail page and in the Chrome extension overlay. When a score is
            computed, we send the role title, company, your notes, the
            captured job description, and the top-matching sections of your
            resume. We do not send your email or any other identifier. Per
            Anthropic&apos;s API terms, prompts are not used to train
            models. See the{' '}
            <a
              href="https://www.anthropic.com/legal/privacy"
              className="underline hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              Anthropic privacy policy
            </a>
            .
          </li>
        </ul>

        <h2 className="pt-4 text-lg font-semibold">How your data is used</h2>
        <p>
          Your data is used only to display it back to you in the dashboard
          and to compute analytics scoped to your own account. It is not
          sold, rented, or shared for advertising. It is not used to train
          machine learning models.
        </p>

        <h2 className="pt-4 text-lg font-semibold">Retention and deletion</h2>
        <p>
          Your data is retained until you delete your account. You can
          delete your account at any time from the{' '}
          <Link href="/settings" className="underline hover:text-foreground">
            Settings
          </Link>{' '}
          page. Account deletion is permanent and immediately removes your
          authentication record, every application row, and every event row
          associated with your account.
        </p>

        <h2 className="pt-4 text-lg font-semibold">Children</h2>
        <p>
          TrackWise is not directed at children under 13 and does not
          knowingly collect data from them.
        </p>

        <h2 className="pt-4 text-lg font-semibold">Changes to this policy</h2>
        <p>
          Material changes will be reflected on this page with an updated
          effective date.
        </p>

        <h2 className="pt-4 text-lg font-semibold">Contact</h2>
        <p>
          Questions, deletion requests, or anything else:{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </section>
    </main>
  )
}
