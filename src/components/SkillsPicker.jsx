// The one skills control, used by all four forms (POLISH-4).
//
// A dropdown you open to tick skills, with each choice appearing as a
// removable chip beneath it. One component rather than four, for the same
// reason OpportunityPhoto is one component: two near-identical blocks that
// differ only in indentation is exactly how the logged-out browse once broke.
//
// Not a native <select multiple>: on a phone it is a scrolling box that
// needs ctrl-click to deselect, and it cannot show group headings or chips.
import { useEffect, useRef, useState } from 'react';
import { groupByCategory, pickerOptions, useSkills } from '../utils/skills';

export default function SkillsPicker({
  value = [],
  onChange,
  id = 'skills',
  label = 'Skills',
  hint,
  disabled = false,
  invalid = false,
  // A caller-supplied list, for a FILTER rather than a choice. Find
  // Volunteers offers only the skills its listed volunteers actually hold,
  // so no option can lead to an empty page -- the same rule as the
  // organisation filter on the browse. Omit it on a form, where the whole
  // managed list is the point.
  options,
  emptyLabel = 'Choose skills…',
}) {
  const { all, isPending } = useSkills();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);

  // Active skills, plus anything this row already holds that has since been
  // hidden -- otherwise editing would silently drop it (utils/skills.js).
  const choices = options ?? pickerOptions(all, value);
  const groups = groupByCategory(choices);
  const selected = new Set(value);
  const chosenRows = choices.filter((s) => selected.has(s.id));

  // Close on an outside click or Escape. Without this the panel stays open
  // behind the rest of the form and covers the fields under it.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (skillId) => {
    const next = selected.has(skillId)
      ? value.filter((v) => v !== skillId)
      : [...value, skillId];
    onChange(next);
  };

  const summary = isPending
    ? 'Loading skills…'
    : value.length === 0
      ? emptyLabel
      : `${value.length} chosen`;

  return (
    <div className="form-row" ref={wrapRef}>
      <label className="label" htmlFor={id}>
        {label}{' '}
        {hint && <span className="help-text">{hint}</span>}
      </label>

      <div className="relative">
        <button
          type="button"
          id={id}
          ref={buttonRef}
          disabled={disabled || isPending}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={invalid || undefined}
          className={`select flex w-full items-center justify-between text-left ${
            invalid ? 'input-invalid' : ''
          }`}
          style={
            value.length === 0 ? { color: 'var(--color-text-muted)' } : undefined
          }
        >
          <span>{summary}</span>
          <span aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>
            {open ? '▴' : '▾'}
          </span>
        </button>

        {open && (
          <div
            role="listbox"
            aria-multiselectable="true"
            aria-label={label}
            className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl p-2 shadow-lg"
            style={{
              backgroundColor: 'var(--color-background-elevated)',
              border: '1px solid var(--color-border-strong)',
            }}
          >
            {groups.map(([category, rows]) => (
              <div key={category} className="mb-2 last:mb-0">
                <p
                  className="section-kicker px-2 py-1"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {category}
                </p>
                {rows.map((skill) => (
                  <label
                    key={skill.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--color-background-secondary)]"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    <input
                      type="checkbox"
                      className="check"
                      checked={selected.has(skill.id)}
                      onChange={() => toggle(skill.id)}
                    />
                    <span>{skill.name}</span>
                    {/* A skill the admin has hidden since this row chose it.
                        Said plainly rather than hidden, so nobody wonders why
                        it is not in anyone else's list. */}
                    {!skill.is_active && (
                      <span className="help-text">(no longer offered)</span>
                    )}
                  </label>
                ))}
              </div>
            ))}
            {choices.length === 0 && !isPending && (
              <p className="px-2 py-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No skills have been set up yet.
              </p>
            )}
          </div>
        )}
      </div>

      {chosenRows.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {chosenRows.map((skill) => (
            <span key={skill.id} className="chip">
              {skill.name}
              <button
                type="button"
                onClick={() => toggle(skill.id)}
                disabled={disabled}
                aria-label={`Remove ${skill.name}`}
                className="ml-0.5 rounded-full leading-none"
                style={{ color: 'var(--color-text-muted)' }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
