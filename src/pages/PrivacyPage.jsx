// Workflow 8.2 — the privacy policy.
//
// NOT YET APPROVED. Every statement below was checked against the live
// database and the code on 2026-09-16 (what is stored, what a deletion
// removes, what the browser keeps, which services are involved). What it
// cannot settle is the legal framing — the lawful basis, the charity's postal
// address, whether to name an ICO registration — and the charity has to sign
// the whole text off before launch. See PENDING-DECISIONS.md, WF8-5.
//
// If you change what the system does with personal data, change this page in
// the same commit. A privacy policy that describes last month's database is
// worse than none: people rely on it.
import { Link } from 'react-router-dom';

const UPDATED = '16 September 2026';

function Section({ id, title, children }) {
  return (
    <section id={id} className="space-y-3" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="section-title" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </h2>
      <div className="space-y-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {children}
      </div>
    </section>
  );
}

function List({ children }) {
  return <ul className="list-disc pl-6 space-y-1">{children}</ul>;
}

export default function PrivacyPage() {
  return (
    <div className="container-app max-w-3xl mx-auto px-4 py-10" id="main-content">
      <div className="card space-y-8">
        <header className="space-y-2">
          <h1 className="title" style={{ color: 'var(--color-text-primary)' }}>Privacy policy</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Last updated {UPDATED}</p>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            This explains what the Well Windsor volunteering site keeps about you, who can see it,
            and how to have it deleted. It is written to say what the site actually does.
          </p>
        </header>

        <Section id="who" title="Who we are">
          <p>
            The site is run by Well Windsor, a registered charity in England and Wales (number
            1207021). Well Windsor decides how your information is used, which makes it the data
            controller. You can reach us at{' '}
            <a href="mailto:hello@wellwindsor.org.uk" style={{ color: 'var(--color-brand-ink)' }} className="underline">
              hello@wellwindsor.org.uk
            </a>.
          </p>
        </Section>

        <Section id="what" title="What we keep">
          <p><strong>Everyone with an account:</strong> your email address, a password (stored only as a
            one-way hash we cannot read), and whether you are a volunteer or an organisation.</p>
          <p><strong>Volunteers:</strong></p>
          <List>
            <li>your name and home town;</li>
            <li>your date of birth, because volunteers must be 18 or over;</li>
            <li>if you give them: a phone number, a short bio and your skills;</li>
            <li>whether you are <em>discoverable</em>, meaning approved organisations may find you and contact you;</li>
            <li>the roles you register interest in, and any note you add.</li>
          </List>
          <p><strong>Organisations:</strong> your organisation&rsquo;s name, town and bio, an optional phone number,
            and the roles you post.</p>
          <p><strong>Messages:</strong> when an organisation writes to a volunteer through the site, we keep the
            message. The notices you see under the bell icon are kept too.</p>
          <p><strong>Problem reports:</strong> if you use &ldquo;Report a problem&rdquo;, we keep your message,
            the page you were on, the reply address if you give one, and which account sent it if you
            were signed in.</p>
          <p><strong>A record of administrative actions:</strong> for example, approving an organisation,
            changing someone&rsquo;s login email or taking down a role, with who did it and when.</p>
        </Section>

        <Section id="who-sees" title="Who can see it">
          <List>
            <li>
              <strong>Organisations never see a volunteer&rsquo;s email address, phone number or date of
              birth.</strong> When an organisation writes to you, the site sends the email; your reply
              goes straight to the organisation and continues outside the site.
            </li>
            <li>
              An organisation sees your name, home town, bio and skills if you register
              interest in one of its roles, or if you are discoverable and it has been approved by Well
              Windsor.
            </li>
            <li>
              An organisation&rsquo;s name, town and bio are public. Its login email and phone number, if
              given, can be seen by people signed in to the site.
            </li>
            <li>
              <strong>Well Windsor administrators can see messages sent through the
              site</strong>, including the text of a message an organisation sent you
              and the address it was sent to. This is so a complaint about a message
              can be looked into. Administrators are a small number of named people
              at the charity, and every administrator action is recorded.
            </li>
            <li>Well Windsor&rsquo;s administrators can see all accounts, to run and protect the service.</li>
          </List>
          <p>We do not sell your information or use it for advertising.</p>
        </Section>

        <Section id="why" title="Why we use it">
          <p>
            To run the service you signed up for: matching volunteers with local roles, letting
            organisations contact the people who are interested, and sending the emails and
            notices that go with that. We also use it to keep the site safe: checking organisations
            before they can post, confirming volunteers are adults, and investigating problems.
          </p>
        </Section>

        <Section id="services" title="Services we use">
          <List>
            <li><strong>Supabase</strong> stores the database and handles signing in. Our data is held in
              London. The sign-in service records sign-in events, including IP address, for security.</li>
            <li><strong>Brevo</strong> sends the site&rsquo;s emails. It receives the recipient&rsquo;s address and the
              email&rsquo;s content, and keeps its own delivery records.</li>
            <li><strong>Cloudflare</strong> serves the website itself.</li>
          </List>
          <p>
            The site uses no analytics and no advertising cookies. Your browser keeps your sign-in
            session and your light or dark theme choice in its own local storage, on your device.
          </p>
        </Section>

        <Section id="how-long" title="How long we keep it">
          <List>
            <li>Your account information, until you delete your account.</li>
            <li>The content of emails the site sends (address, name and text), for 30 days after
              sending. After that only the date and whether it was delivered are kept.</li>
            <li>Problem reports, until they are no longer needed to fix the problem.</li>
            <li>The record of administrative actions is kept permanently, but names, email addresses
              and message text are removed from it when the account concerned is deleted.</li>
          </List>
        </Section>

        <Section id="delete" title="Deleting your account">
          <p>
            You can delete your account yourself. See{' '}
            <Link to="/delete-my-data" style={{ color: 'var(--color-brand-ink)' }} className="underline">
              delete my data
            </Link>. It happens immediately and cannot be undone.
          </p>
          <List>
            <li>Your profile, registrations and notifications are deleted.</li>
            <li>An organisation&rsquo;s roles are deleted, and so are the registrations on them.</li>
            <li>Messages between you and organisations are deleted. We keep a dated note that a message
              was sent, without its text or anyone&rsquo;s name, so we can answer questions about how the
              site was used.</li>
            <li>The content of emails the site sent to you is removed straight away.</li>
            <li>A problem report you sent stays, but is no longer linked to your account.</li>
          </List>
        </Section>

        <Section id="rights" title="Your rights">
          <p>
            You can ask to see the information we hold about you, have it corrected, have it deleted,
            or object to how we use it. Most of it you can correct yourself from your profile page. For
            anything else, email{' '}
            <a href="mailto:hello@wellwindsor.org.uk" style={{ color: 'var(--color-brand-ink)' }} className="underline">
              hello@wellwindsor.org.uk
            </a>.
          </p>
          <p>
            If you are unhappy with how we have handled your information, you can complain to the
            Information Commissioner&rsquo;s Office at{' '}
            <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer"
               style={{ color: 'var(--color-brand-ink)' }} className="underline">
              ico.org.uk
            </a>.
          </p>
        </Section>

        <Section id="changes" title="Changes">
          <p>If we change what we do with your information, we will update this page and the date at the top.</p>
        </Section>
      </div>
    </div>
  );
}
