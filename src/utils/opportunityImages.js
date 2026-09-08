/**
 * Fallback photography for an opportunity, chosen from its category.
 *
 * The approved design gives every role a picture. There is no image column
 * on volunteer_opportunities and no public storage bucket, and
 * per-opportunity upload is deliberately NOT built: it needs a safeguarding
 * decision about who may publish photographs of identifiable children, and
 * that question has not been put to the charity. So the organisation picks
 * one of three categories and the client maps it to a photograph that is
 * already in public/images/.
 *
 * `category` is nullable and most rows have none, so the null case is the
 * NORMAL case rather than an error path -- at launch it will be every row.
 * Putting a picture of children on a role that may involve no children
 * would be a claim, and the wrong one, so the fallbacks claim nothing: a
 * town, some pencils, four people from behind. No identifiable faces.
 *
 * There are three of them rather than one because one repeated down a
 * two-column grid stops reading as a deliberate choice and starts reading
 * as a broken image loop -- which is what a single castle on eleven of
 * fourteen cards actually looked like. The pick is derived from the
 * opportunity id, so it is stable: the same role keeps the same picture
 * across renders, reloads and sessions, and neighbouring cards differ.
 *
 * Every file here exists at 480w and 800w as both WebP and JPEG, written by
 * scripts/prep-images.py. Cards render at roughly 300-520 CSS px, so those
 * two widths cover the range including 2x.
 */

/** The choices offered when posting or editing. Values match the CHECK. */
export const OPPORTUNITY_CATEGORIES = [
  {
    value: 'in_schools',
    label: 'In schools, with children',
    hint: 'Reading support, classroom help, lunchtime and playground roles.',
  },
  {
    value: 'behind_scenes',
    label: 'Behind the scenes',
    hint: 'Admin, fundraising, research, web and social. Often remote.',
  },
  {
    value: 'one_off',
    label: 'A one-off event',
    hint: 'A single day or evening — sports days, fun runs, fetes.',
  },
];

const NEUTRAL = [
  {
    base: 'image-asset-3',
    alt: 'Windsor Castle at the end of a busy Windsor street',
  },
  {
    base: 'unsplash-image-l3n9q27zulw',
    alt: 'A row of sharpened colouring pencils against a white background',
  },
  {
    base: 'image-asset-2',
    alt: 'Four people seen from behind, arms around each other, on a tree-lined road',
  },
];

const BY_CATEGORY = {
  in_schools: {
    base: 'unsplash-image-z-7yz6-f1zq',
    alt: 'An adult and a child reading a book together on a sofa',
  },
  behind_scenes: {
    base: 'unsplash-image-oycl7y4y0bk',
    alt: 'A desk with a stack of books, an apple, pencils and alphabet blocks',
  },
  one_off: {
    base: 'image-asset-4',
    alt: 'Children in a field holding a play parachute above their heads',
  },
};

/**
 * Stable index into NEUTRAL from an opportunity id. Deliberately not
 * Math.random(): a picture that changes on every render is a flicker, and
 * this codebase has shipped Math.random() dressed as a result once already.
 */
function neutralFor(id) {
  const key = String(id ?? '');
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  }
  return NEUTRAL[hash % NEUTRAL.length];
}

/**
 * @param {string|null|undefined} category
 * @param {string|null|undefined} id  opportunity id, only used to pick a
 *   stable fallback when there is no category
 * @returns {{srcSetWebp: string, srcSetJpeg: string, src: string, alt: string}}
 *
 * An unrecognised value falls through to a neutral image rather than
 * throwing or rendering an empty slot -- the CHECK constraint keeps the
 * column honest, but a stale client should still draw something.
 */
export function opportunityImage(category, id) {
  const picked = BY_CATEGORY[category] ?? neutralFor(id);
  const path = (w, ext) => `/images/${picked.base}-${w}.${ext}`;

  return {
    srcSetWebp: `${path(480, 'webp')} 480w, ${path(800, 'webp')} 800w`,
    srcSetJpeg: `${path(480, 'jpg')} 480w, ${path(800, 'jpg')} 800w`,
    src: path(800, 'jpg'),
    alt: picked.alt,
  };
}
