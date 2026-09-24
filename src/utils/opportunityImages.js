/**
 * The picture on an opportunity card (POLISH-9).
 *
 * Organisations CHOOSE a picture; admins SUPPLY them. There is no upload for
 * organisations and never will be: the library is `role_images`, filled only
 * by admin_add_role_image, and a role points at one row by `image_id`. So
 * every picture a volunteer sees on a card was put there by the charity --
 * which is why the role form carries no safeguarding notice about photographs
 * of children. (An earlier note here said per-role upload was "deliberately
 * NOT built" pending a safeguarding decision. The decision was made
 * 2026-09-24: organisations do not upload at all.)
 *
 * A library row is one of two kinds:
 *   - `static_base`: a stock photograph that ships with the site in
 *     public/images/, at 480w and 800w as WebP and JPEG (scripts/prep-images.py);
 *   - `storage_path`: a file an admin uploaded to the public `role-images`
 *     bucket, already resized in the browser before upload (one width).
 *
 * The image is OPTIONAL. With none chosen the card shows one of three neutral
 * fallbacks that claim nothing -- a town, some pencils, four people from
 * behind -- picked by hashing the role id, so the same role keeps the same
 * picture and neighbouring cards differ. One picture repeated down the grid
 * read as a broken image loop, which is what a single castle on eleven of
 * fourteen cards actually looked like.
 *
 * The card shows it; the role page does not (POLISH-1: one column, no photo).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export const ROLE_IMAGE_BUCKET = 'role-images';

const NEUTRAL = [
  {
    static_base: 'image-asset-3',
    alt: 'Windsor Castle at the end of a busy Windsor street',
  },
  {
    static_base: 'unsplash-image-l3n9q27zulw',
    alt: 'A row of sharpened colouring pencils against a white background',
  },
  {
    static_base: 'image-asset-2',
    alt: 'Four people seen from behind, arms around each other, on a tree-lined road',
  },
];

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
 * Where a library row's file is served from.
 * @param {{storage_path?: string|null, static_base?: string|null, alt: string}} image
 * @returns {{src: string, srcSetWebp?: string, srcSetJpeg?: string, alt: string}}
 */
export function roleImageSources(image) {
  if (image.storage_path) {
    const { data } = supabase.storage
      .from(ROLE_IMAGE_BUCKET)
      .getPublicUrl(image.storage_path);
    return { src: data.publicUrl, alt: image.alt };
  }
  const path = (w, ext) => `/images/${image.static_base}-${w}.${ext}`;
  return {
    srcSetWebp: `${path(480, 'webp')} 480w, ${path(800, 'webp')} 800w`,
    srcSetJpeg: `${path(480, 'jpg')} 480w, ${path(800, 'jpg')} 800w`,
    src: path(800, 'jpg'),
    alt: image.alt,
  };
}

/**
 * The picture for a role as `public_opportunities` returns it, whose image
 * columns are flattened to image_path / image_static / image_alt.
 * A role with no image -- or a stale client missing the columns -- gets a
 * neutral fallback rather than an empty slot.
 */
export function opportunityImage(op) {
  if (op?.image_path || op?.image_static) {
    return roleImageSources({
      storage_path: op.image_path,
      static_base: op.image_static,
      alt: op.image_alt ?? '',
    });
  }
  return roleImageSources(neutralFor(op?.id));
}

/** The view's flattened image columns for a library row (or none). */
export function imageFieldsFor(image) {
  return {
    image_id: image?.id ?? null,
    image_path: image?.storage_path ?? null,
    image_static: image?.static_base ?? null,
    image_alt: image?.alt ?? null,
  };
}

/**
 * The whole library, hidden rows included: a role that holds a since-hidden
 * picture must still be able to show it in its own form (the same rule as
 * pickerOptions for skills). Pickers filter to active + the one held.
 */
export function useRoleImages() {
  return useQuery({
    queryKey: ['role-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_images')
        .select('id, storage_path, static_base, alt, is_active, sort_order, created_at')
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}
