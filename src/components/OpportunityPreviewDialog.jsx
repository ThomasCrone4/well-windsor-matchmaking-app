// "What will this look like?", answered from unsaved form state.
//
// Both halves render the REAL components -- OpportunityCard as the browse
// uses it, RoleDetailBody as the role page uses it. Nothing here is a copy,
// which is the only way a preview can stay honest: a copy drifts, and a
// preview that drifts tells the organisation something untrue with a
// straight face.
//
// It previews what the form HOLDS, not what the database has. So an
// organisation can see the effect of a change before saving it, which is the
// point -- but it is not a promise that the role is live. The notice says so.
import { useEffect, useRef } from 'react';
import OpportunityCard from './OpportunityCard';
import RoleDetailBody from './RoleDetailBody';

export default function OpportunityPreviewDialog({
  op,
  orgName,
  orgHomeTown,
  orgBio,
  blocks = [],
  skillNames = [],
  onClose,
}) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // The page behind must not scroll while this is open, or dismissing it
    // leaves the form somewhere the organisation did not put it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ backgroundColor: 'rgba(12, 23, 25, 0.55)' }}
      onMouseDown={(e) => {
        // Only a click on the backdrop itself closes it -- a drag that
        // started inside the panel and ended outside must not.
        if (!panelRef.current?.contains(e.target)) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Preview of this role"
        className="w-full max-w-3xl rounded-2xl"
        style={{
          backgroundColor: 'var(--color-background-elevated)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div
          className="flex items-start justify-between gap-4 px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Preview
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              How this role will look to volunteers, using what you have typed
              so far. Nothing here is saved yet.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn-secondary btn-sm shrink-0"
          >
            Close
          </button>
        </div>

        <div className="px-6 py-6">
          <h3 className="section-kicker text-[13px]">On the list of roles</h3>
          <p className="mt-1 mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            One card among the others, at the width it gets on a wide screen.
          </p>
          {/* The card is an <li>, so it needs its list. Kept to one column at
              the width a card actually gets on the two-column browse. */}
          <ul className="grid max-w-md gap-5">
            <OpportunityCard
              op={op}
              blocks={blocks}
              orgName={orgName}
              interactive={false}
            />
          </ul>

          <hr className="my-8" style={{ borderColor: 'var(--color-border)' }} />

          <h3 className="section-kicker text-[13px]">When someone opens it</h3>
          <p className="mt-1 mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            The role&rsquo;s own page. The register button and what happens
            after it are left out &mdash; they are the same on every role.
          </p>
          <div
            className="rounded-xl p-5"
            style={{
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-background)',
            }}
          >
            <RoleDetailBody
              op={op}
              orgName={orgName}
              orgHomeTown={orgHomeTown}
              orgBio={orgBio}
              blocks={blocks}
              skillNames={skillNames}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
