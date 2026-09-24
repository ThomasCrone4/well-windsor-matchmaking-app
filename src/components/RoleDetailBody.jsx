// The body of a role's page: everything between the back button and the
// register button. Extracted from OpportunityDetailPage so the PREVIEW on
// the role forms renders the real page rather than a copy of it -- a preview
// that drifts from what it previews tells the organisation something untrue
// with a straight face.
//
// Purely presentational: it runs no queries. The caller supplies the role,
// its organisation, its timeblocks and its skill NAMES, because the two
// callers get them from different places -- the detail page from the table
// and a join, the preview from unsaved form state.
import {
  deriveDateRangeFromBlocks,
  deriveTimeRangeFromBlocks,
  formatDateRange,
  formatTimeRange,
  getNextSessionDate,
  normalizeDays,
} from '../utils/schedule';

export default function RoleDetailBody({
  op,
  orgName = 'Organisation',
  orgHomeTown = null,
  orgBio = null,
  blocks = [],
  skillNames = [],
}) {
  // location is the venue and town is the filter key, but plenty of rows put
  // the same string in both -- "Windsor · Windsor" is not a location, it is a
  // bug wearing a separator.
  const where =
    [op.location, op.town === op.location ? null : op.town]
      .filter(Boolean)
      .join(' · ') || 'To be confirmed';

  // The schedule, in parts rather than as one bullet-separated string. The
  // single-line form is what the browse cards use; this page is where
  // somebody is deciding whether they can actually make it, so the day, the
  // time and the run of dates get a row each.
  const dayNames = normalizeDays(blocks.flatMap((b) => b?.days ?? []));
  const { start, end } = deriveDateRangeFromBlocks(blocks);
  const { startMins, endMins, consistent } = deriveTimeRangeFromBlocks(blocks);

  const whenRows = op.generally_needed || blocks.length === 0
    ? []
    : [
        dayNames.length
          ? { k: dayNames.length > 1 ? 'Which days' : 'Which day', v: dayNames.join(', ') }
          : { k: 'Which day', v: 'Days vary' },
        {
          k: 'Time',
          v: consistent
            ? formatTimeRange(startMins, endMins, { tbcLabel: 'Times vary' })
            : 'Times vary',
        },
        { k: 'Running', v: formatDateRange(start, end, { tbcLabel: 'Dates to be confirmed' }) },
      ];

  const nextSession = getNextSessionDate({ ...op, timeblocks: blocks });

  const skillList = skillNames.filter(Boolean);

  // The chips under the title: the facts somebody decides on, before any
  // prose. Short forms -- the full versions are in the blocks below.
  const chips = [
    op.generally_needed
      ? { label: 'Any time', solid: true }
      : whenRows.length
        ? {
            label: `${dayNames.length ? dayNames.join(', ') : 'Days vary'}, ${
              consistent
                ? formatTimeRange(startMins, endMins, { tbcLabel: 'times vary' })
                : 'times vary'
            }`,
            solid: true,
          }
        : null,
    { label: where },
    op.requires_dbs ? { label: 'DBS check needed' } : null,
    op.volunteers_needed
      ? {
          label: `${op.volunteers_needed} ${
            op.volunteers_needed === 1 ? 'volunteer' : 'volunteers'
          } needed`,
        }
      : null,
  ].filter(Boolean);

  const org = orgBio ? { bio: orgBio } : null;

  return (
    <>
      <p
        className="text-sm font-semibold"
        style={{ color: 'var(--color-brand-ink)' }}
      >
        {orgName}
        {orgHomeTown ? ` · ${orgHomeTown}` : ''}
      </p>

      <h1
        className="mt-1 text-3xl font-bold leading-tight tracking-[-0.025em] md:text-4xl"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {op.title}
      </h1>

      {/* The facts somebody decides on, before any prose. */}
      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span key={chip.label} className={chip.solid ? 'chip-solid' : 'chip'}>
              {chip.label}
            </span>
          ))}
        </div>
      )}

      {op.description?.trim() ? (
        <p
          className="mt-5 whitespace-pre-line text-base leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {op.description}
        </p>
      ) : (
        <p className="mt-5 italic" style={{ color: 'var(--color-text-muted)' }}>
          The organisation hasn&rsquo;t written a description for this role
          yet.
        </p>
      )}

      <hr className="my-8" style={{ borderColor: 'var(--color-border)' }} />

      {/* ---------------- when ---------------- */}
      <section>
        <h2 className="section-kicker">When</h2>
        {op.generally_needed ? (
          <p className="mt-2 text-base" style={{ color: 'var(--color-text-primary)' }}>
            Any time &mdash; the organisation has no fixed times for this
            role.
          </p>
        ) : whenRows.length === 0 ? (
          <p className="mt-2 text-base" style={{ color: 'var(--color-text-secondary)' }}>
            The organisation hasn&rsquo;t given times for this role yet.
          </p>
        ) : (
          <>
            <dl
              className="mt-3 overflow-hidden rounded-xl"
              style={{
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-background-secondary)',
              }}
            >
              {whenRows.map((row, i) => (
                <div
                  key={row.k}
                  className="flex items-baseline justify-between gap-4 px-4 py-2.5"
                  style={
                    i > 0 ? { borderTop: '1px solid var(--color-border)' } : undefined
                  }
                >
                  <dt className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {row.k}
                  </dt>
                  <dd
                    className="text-right text-sm font-semibold tabular-nums"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {row.v}
                  </dd>
                </div>
              ))}
            </dl>
            {nextSession && (
              <p
                className="mt-2 text-sm font-semibold"
                style={{ color: 'var(--color-brand-ink)' }}
              >
                Next session:{' '}
                {nextSession.toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
            )}
          </>
        )}
      </section>

      {/* ---------------- where ---------------- */}
      <section className="mt-7">
        <h2 className="section-kicker">Where</h2>
        <p className="mt-2 text-base" style={{ color: 'var(--color-text-primary)' }}>
          {where}
        </p>
      </section>

      {/* ---------------- what you need ----------------
          DBS is stated ONCE. It used to be said in the facts panel and
          again in a notice directly beneath it -- the same sentence
          twice, stacked. Both halves are here in one place: that a check
          is needed, who arranges it, and that this site vets nobody. */}
      <section className="mt-7">
        <h2 className="section-kicker">What you need</h2>
        {op.requires_dbs ? (
          <>
            <p className="mt-2 text-base font-medium" style={{ color: 'var(--color-text-primary)' }}>
              A DBS check
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {orgName} arranges it and will tell you what it needs. Well
              Windsor, which runs this site, does not vet or DBS-check
              anyone.
            </p>
          </>
        ) : (
          <p className="mt-2 text-base" style={{ color: 'var(--color-text-primary)' }}>
            No DBS check for this role.
          </p>
        )}
      </section>

      {/* ---------------- skills ---------------- */}
      {skillList.length > 0 && (
        <section className="mt-7">
          <h2 className="section-kicker">Helpful but not required skills</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {skillList.map((skill) => (
              <span key={skill} className="chip">
                {skill}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- about the organisation ---------------- */}
      {org?.bio?.trim() && (
        <section className="mt-7">
          <h2 className="section-kicker">About {orgName}</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {org.bio}
          </p>
        </section>
      )}
    </>
  );
}
