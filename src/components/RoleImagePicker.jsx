// POLISH-9. The organisation chooses the card's picture from the library
// admins keep. Nothing is uploaded from here, by design.
//
// Offers the ACTIVE pictures plus whichever one the role already holds, even
// if an admin has since hidden it -- the same rule as pickerOptions for
// skills. Without that, opening a role whose picture was hidden would show
// nothing selected and the next save would quietly drop it.
//
// Every role has a picture (asked 2026-09-24): there is no "no preference"
// choice, a new role opens with a random one already chosen
// (PostOpportunity), and image_id is NOT NULL. If a role is saved before the
// library has loaded, the database picks one at random rather than refusing
// (volunteer_opportunities_image_rules), and clearing one is refused.
//
// Real radio inputs underneath, so it is keyboard- and screen-reader-operable
// with no extra work: arrow keys move between pictures.
import OpportunityPhoto from './OpportunityPhoto';
import { roleImageSources, useRoleImages } from '../utils/opportunityImages';

// Declared at module level, not inside the picker: a component defined in a
// render body is a NEW type on every render, so React would remount every
// tile -- and reload every thumbnail -- each time a choice is made.
function Tile({ name, checked, onSelect, label, children }) {
  return (
    <label
      data-role-image-tile
      className="group relative block cursor-pointer overflow-hidden rounded-xl"
      style={{
        outline: checked ? '3px solid var(--color-brand-ink)' : '1px solid var(--color-border)',
        outlineOffset: checked ? '2px' : '0',
      }}
    >
      <input
        type="radio"
        name={name}
        className="peer sr-only"
        checked={checked}
        onChange={onSelect}
        aria-label={label}
      />
      <span className="block aspect-[3/2] peer-focus-visible:ring-4 peer-focus-visible:ring-inset peer-focus-visible:ring-[var(--color-brand-ink)]">
        {children}
      </span>
      {checked && (
        <span
          className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: 'var(--color-brand-ink)', color: 'var(--color-background)' }}
        >
          Chosen
        </span>
      )}
    </label>
  );
}

export default function RoleImagePicker({ value, onChange, name = 'role-image' }) {
  const { data: images = [], isPending, isError } = useRoleImages();
  const options = images.filter((i) => i.is_active || i.id === value);
  const current = value ?? null;

  return (
    <fieldset>
      <legend className="label">Picture for the card</legend>
      <p className="help-text mb-3">
        Shown on your role&rsquo;s card in the list of roles. Choose one of the
        pictures Well Windsor provides.
      </p>

      {isError ? (
        <p className="error-text">
          Could not load the pictures. One will be chosen for you, and you can
          change it later.
        </p>
      ) : isPending ? (
        <p className="help-text">Loading pictures…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {options.map((img) => (
            <Tile
              key={img.id}
              name={name}
              checked={current === img.id}
              onSelect={() => onChange(img.id)}
              label={img.alt}
            >
              <OpportunityPhoto
                image={roleImageSources(img)}
                sizes="(min-width: 640px) 200px, 45vw"
              />
            </Tile>
          ))}
        </div>
      )}
    </fieldset>
  );
}
