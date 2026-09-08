// The footer was a pure-black slab with cyan links, hardcoded, responding
// to neither theme -- the one element on every page that ignored the token
// system entirely, so it read as a different website stapled to the bottom.
//
// It sits on the secondary surface now, with a hairline above it, and the
// links use brand-ink rather than the cyan fill (#15ddef is 1.66:1 on a
// light ground and could never have carried them).
import { Link } from 'react-router-dom';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="mt-16"
      style={{
        backgroundColor: 'var(--color-background-secondary)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <img
              src="/WellWindsorLogo.png"
              alt="Well Windsor"
              width="890"
              height="788"
              className="h-11 w-auto"
            />
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Connecting volunteers with schools and organisations across
              Windsor. Well Windsor funds mental health provision in Windsor
              schools.
            </p>
          </div>

          <nav className="flex flex-col gap-2 text-sm" aria-label="Footer">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={{
                color: 'var(--color-text-muted)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              }}
            >
              Volunteering
            </span>
            <Link to="/opportunities" style={{ color: 'var(--color-brand-ink)' }} className="hover:underline">
              Browse roles
            </Link>
            <Link to="/auth" style={{ color: 'var(--color-brand-ink)' }} className="hover:underline">
              Sign in or sign up
            </Link>
          </nav>

          <nav className="flex flex-col gap-2 text-sm" aria-label="Well Windsor">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={{
                color: 'var(--color-text-muted)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              }}
            >
              The charity
            </span>
            <a
              href="https://www.wellwindsor.org.uk"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-brand-ink)' }}
              className="hover:underline"
            >
              wellwindsor.org.uk
            </a>
            <a
              href="https://www.wellwindsor.org.uk/getintouch"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-brand-ink)' }}
              className="hover:underline"
            >
              Get in touch
            </a>
            {/* FAQ & Support and Privacy Policy were both href="#" -- links
                that went nowhere. Left out until the pages exist. */}
            <a
              href="mailto:hello@wellwindsor.org.uk"
              style={{ color: 'var(--color-brand-ink)' }}
              className="hover:underline"
            >
              hello@wellwindsor.org.uk
            </a>
          </nav>
        </div>

        <div
          className="mt-8 flex flex-col gap-1 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between"
          style={{
            borderTop: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span>&copy; {year} Well Windsor. Registered charity number 1207021.</span>
          <span>
            Well Windsor does not vet or DBS-check volunteers or organisations.
          </span>
        </div>
      </div>
    </footer>
  );
}
