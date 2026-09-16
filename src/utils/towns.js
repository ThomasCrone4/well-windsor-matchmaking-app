import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

/**
 * The towns this service covers, and whether anyone should be asked to
 * choose one (ADM-6).
 *
 * The `towns` table is the list. Until 2026-09-16 there were two lists that
 * disagreed: this file held a hardcoded array, and the database took its
 * real list from a CHECK on volunteer_opportunities.town naming Windsor,
 * Maidenhead and Slough — while `towns` held a fourth, Old Windsor, that an
 * admin could activate and no role could ever be posted in. The CHECK is now
 * a foreign key to `towns`, and so is user_profiles.home_town.
 *
 * THE ONE RULE: while exactly one town is active, no town picker appears
 * anywhere — sign-up, the role forms, the profile forms, the browse filter,
 * the volunteer search — and everything is filed under that town. Activate a
 * second town in the admin dashboard and every picker comes back on its own.
 * Every picker reads `showPicker` from here; none decides for itself, so they
 * cannot drift apart.
 *
 * The database holds the same rule (sole_active_town()): a role or a profile
 * saved with no town is filed under the only active one. So a form submitted
 * before this query lands still ends up in the right town — the client does
 * not have to win that race to be correct.
 */
export function useTowns() {
  const { data, isPending } = useQuery({
    queryKey: ['active-towns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('towns')
        .select('name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []).map((t) => t.name);
    },
    staleTime: 10 * 60 * 1000,
  });

  const towns = data ?? [];
  return {
    towns,
    // The town everything is filed under while it is the only one, else null.
    soleTown: towns.length === 1 ? towns[0] : null,
    // Hidden while loading too: a picker that flashes up and vanishes on
    // every page load is worse than one that appears a moment late.
    showPicker: towns.length > 1,
    isPending,
  };
}

/**
 * The options a town <select> should show for a person who already has a
 * saved town.
 *
 * Belt and braces now. home_town is a foreign key and a town cannot be
 * deactivated while anyone lives in it, so a saved town should always be
 * active. But a <select> whose value matches no <option> renders as though
 * nothing is chosen, and saving any other field would then silently rewrite
 * the person's town — so their own value stays in the list regardless.
 *
 * @param {string[]} towns the active towns, from useTowns()
 * @param {string|null|undefined} current the saved value, if any
 * @returns {string[]}
 */
export function townOptionsFor(towns, current) {
  const value = (current ?? '').trim();
  return value && !towns.includes(value) ? [...towns, value] : [...towns];
}
