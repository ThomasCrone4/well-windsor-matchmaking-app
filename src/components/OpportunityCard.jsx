// One role, as it appears in a list.
//
// Extracted from OpportunitiesPage so the PREVIEW on the role forms can
// render the real card rather than a copy of it. A copy is how the two
// near-identical browse blocks drifted and broke the logged-out listing, and
// a preview that drifts from the thing it previews is worse than no preview:
// it tells the organisation something untrue with a straight face.
//
// `interactive` is the whole difference between the two callers. On the
// browse the photo, the title and the buttons are links and actions; in a
// preview dialog they are inert, because there is nothing to navigate to --
// the role may not exist yet.
import { Link } from 'react-router-dom';
import OpportunityPhoto from './OpportunityPhoto';
import { opportunityImage } from '../utils/opportunityImages';
import { formatOpportunitySchedule } from '../utils/schedule';

export default function OpportunityCard({
  op,
  blocks = [],
  orgName = 'Organisation',
  interactive = true,
  isVolunteer = false,
  alreadyEnquired = false,
  onApply,
}) {
  const href = `/opportunities/${op.id}`;

  // In a preview there is no id to link to, so the same markup renders with
  // a plain wrapper. Keeping one element either way means the spacing cannot
  // differ between the real card and the previewed one.
  const Wrap = ({ className, children, ...rest }) =>
    interactive ? (
      <Link to={href} className={className} {...rest}>
        {children}
      </Link>
    ) : (
      <span className={`block ${className ?? ''}`}>{children}</span>
    );

  return (
    <li className="card !p-0 flex flex-col overflow-hidden">
      {/* POLISH-9. Chosen by the organisation from the admins' library, or
          a neutral fallback when none was -- see utils/opportunityImages.js. */}
      <Wrap className="block h-40 sm:h-44 overflow-hidden" tabIndex={-1} aria-hidden="true">
        <OpportunityPhoto
          image={opportunityImage(op)}
          sizes="(min-width: 1024px) 45vw, 100vw"
        />
      </Wrap>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="text-xs font-semibold" style={{ color: 'var(--color-brand-ink)' }}>
          {orgName}
        </p>

        <h2 className="text-lg font-semibold leading-snug">
          {interactive ? (
            <Link to={href} className="hover:underline">
              {op.title}
            </Link>
          ) : (
            op.title || 'Untitled role'
          )}
        </h2>

        <p className="text-sm line-3" style={{ color: 'var(--color-text-secondary)' }}>
          {op.description}
        </p>

        {/* Tags. The schedule, the place and the volunteer count were three
            labelled lines of emoji; they are the same facts, read faster. */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {op.requires_dbs && <span className="tag">DBS check</span>}
          {/* ROLE-5. This reads the same rows the detail page reads, so the
              tag cannot contradict them. Still silent rather than "Schedule
              TBC" when a non-flexible role genuinely has no times: saying
              nothing is honest, guessing is not. */}
          {op.generally_needed ? (
            <span className="tag-plain">Flexible timing</span>
          ) : blocks.length > 0 ? (
            <span className="tag-plain">
              {formatOpportunitySchedule({ ...op, timeblocks: blocks })}
            </span>
          ) : null}
          {/* location is meant to be the venue -- "St Edward's, Parsonage
              Lane". On every row today it just repeats the town, so this
              would print "Windsor" on every card: a tag that says the same
              thing everywhere carries no information. */}
          {op.location && op.location !== op.town && (
            <span className="tag-plain">{op.location}</span>
          )}
          {op.volunteers_needed > 1 && (
            <span className="tag-plain">{op.volunteers_needed} needed</span>
          )}
        </div>

        {/* Safeguarding. The platform vets nobody; say so where the
            requirement is, not only in the page preamble. */}
        {op.requires_dbs && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            The DBS check is arranged by the organisation, not by Well Windsor.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-3 mt-auto">
          {interactive ? (
            <Link to={href} className="btn-secondary btn-sm">
              Read more
            </Link>
          ) : (
            <span className="btn-secondary btn-sm opacity-60">Read more</span>
          )}

          {interactive && isVolunteer && (
            <>
              {alreadyEnquired ? (
                <button
                  className="btn-secondary btn-sm opacity-60 cursor-not-allowed"
                  disabled
                  title="You have already registered interest in this role"
                >
                  Interest registered
                </button>
              ) : (
                <button
                  className="btn-primary btn-sm"
                  onClick={() => onApply?.(op.id)}
                  title="Register interest in this role"
                >
                  Register interest
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
