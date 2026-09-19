// WF9-3 / WF9-4. One pagination control, used by the browse (10 per page) and
// by Find Volunteers (10), and by the admin lists (50) once 9.6 lands.
//
// Paginating in the browser is deliberate at this scale. The browse searches
// description, skills and the organisation's name (BRW-4) and sorts on a
// role's next date, which is derived from its timeblocks -- both of those need
// the whole set in hand, and asking the database for page 2 of a list it
// cannot sort the same way would quietly return the wrong rows. Revisit past
// roughly 500 live roles, which is the note in BUILD-PLAN.
//
// The page number lives in the query string, so Back works: a reader who
// opens a role from page 3 and presses Back returns to page 3 and not to the
// top of the list.

/**
 * @param {number} page      1-based, already clamped by the caller
 * @param {number} pageCount total pages, 1 or more
 * @param {(n: number) => void} onChange
 * @param {number} total     how many items in the filtered list
 * @param {number} perPage   page size, so the "Showing x-y" line is right
 * @param {string} noun      what is being counted, singular ("role")
 */
export default function Pagination({
  page,
  pageCount,
  onChange,
  total,
  perPage = 10,
  noun = 'result',
}) {
  if (pageCount <= 1) return null;

  // perPage is a parameter and not the literal 10 it started as: the admin
  // lists in 9.6 page at 50, and a hardcoded 10 here would have printed
  // "Showing 1-10 of 137" above a page of fifty rows -- wrong in a way that
  // looks like a data bug rather than a formatting one.
  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <nav
      className="mt-8 flex flex-wrap items-center justify-between gap-3"
      aria-label={`${noun} pages`}
    >
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Showing {first}&ndash;{last} of {total} {noun}
        {total === 1 ? '' : 's'}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          // Disabled alone is invisible to someone reading the page aloud in
          // a list of controls, so say which page it would go to.
          aria-label={`Go to page ${page - 1}`}
        >
          &larr; Previous
        </button>

        <span
          className="px-2 text-sm font-medium"
          style={{ color: 'var(--color-text-primary)' }}
          aria-current="page"
        >
          Page {page} of {pageCount}
        </span>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          aria-label={`Go to page ${page + 1}`}
        >
          Next &rarr;
        </button>
      </div>
    </nav>
  );
}
