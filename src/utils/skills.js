import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

/**
 * The managed skills list (POLISH-4).
 *
 * `skills` is the list; the join tables say who has what. This is the towns
 * pattern (ADM-6) with one rule deliberately different: HIDING IS SOFT.
 * A town cannot be deactivated while anyone is filed under it, because a
 * dead town breaks a foreign key. A skill can be hidden at any time, and
 * hiding does not touch anybody who already chose it -- the pickers stop
 * offering it, and a volunteer who really does speak Welsh carries on
 * speaking it.
 *
 * Two consequences that every caller has to handle, and which is why they
 * all come through here rather than each running their own query:
 *
 *  - A PICKER offers active skills only, PLUS whatever this row already has.
 *    Without that, opening the edit form for a role that carries a hidden
 *    skill would silently drop it on the next save -- the same failure the
 *    town <select> has (townOptionsFor), where a value matching no option
 *    renders as nothing chosen.
 *  - DISPLAY uses every skill, active or not, because a hidden skill still
 *    has to render its name wherever somebody holds it.
 */
export function useSkills() {
  const { data, isPending, error } = useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skills')
        .select('id, name, category, is_active, sort_order')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const all = data ?? [];
  const active = all.filter((s) => s.is_active);

  return {
    /** Every skill, hidden ones included. For rendering names. */
    all,
    /** Only the ones a picker should offer. */
    active,
    /** id -> row, for turning stored ids into names. */
    byId: new Map(all.map((s) => [s.id, s])),
    isPending,
    error,
  };
}

/**
 * The options a picker should show: the active list, plus any already-chosen
 * skill that has since been hidden, so editing a row cannot quietly discard
 * what it holds.
 *
 * @param {Array} all every skill, from useSkills().all
 * @param {string[]} selectedIds what this row currently has
 */
export function pickerOptions(all, selectedIds) {
  const chosen = new Set(selectedIds ?? []);
  return (all ?? []).filter((s) => s.is_active || chosen.has(s.id));
}

/**
 * Group rows by category, preserving the sort order the database gave them.
 * Returns [[category, rows], ...] rather than an object, because object key
 * order is not something to rely on for display.
 */
export function groupByCategory(rows) {
  const groups = new Map();
  for (const row of rows ?? []) {
    const key = row.category || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()];
}

/**
 * Rewrite one row's skills, in a single transaction.
 *
 * This used to delete every row and then insert the new set, the way both
 * role forms rewrite opportunity_timeblocks. Over PostgREST that is two HTTP
 * requests and therefore TWO TRANSACTIONS, so between them the row genuinely
 * has no skills at all. Two things follow, and the second is why this
 * changed:
 *
 *  - A DELETE that succeeded followed by an INSERT that failed left somebody
 *    with no skills and an error message about saving.
 *  - The public-profile rule is becoming a trigger that reads
 *    volunteer_skills. A deferred trigger fires at COMMIT -- so the DELETE's
 *    commit, where a public volunteer has zero skills, is exactly the state
 *    it refuses. Saving your profile would fail.
 *
 * The RPCs do both statements in one transaction, so a deferred trigger only
 * ever sees the end state. They are SECURITY INVOKER: RLS still decides who
 * may write what.
 *
 * @param {'opportunity'|'volunteer'} kind which join table
 * @param {string} ownerId the opportunity id; ignored for a volunteer, whose
 *   rows are always their own (the RPC takes no user id at all)
 * @param {string[]} skillIds the chosen ids
 */
export async function replaceSkills(kind, ownerId, skillIds) {
  const ids = [...new Set(skillIds ?? [])];

  const { error } =
    kind === 'opportunity'
      ? await supabase.rpc('set_opportunity_skills', {
          p_opportunity_id: ownerId,
          p_skill_ids: ids,
        })
      : await supabase.rpc('set_volunteer_skills', { p_skill_ids: ids });

  if (error) throw error;
}

/**
 * The ids currently stored for one row. Used by the edit forms, which have
 * to show what is there before they can let anyone change it.
 */
export async function fetchSkillIds(kind, ownerId) {
  if (!ownerId) return [];
  const table = kind === 'opportunity' ? 'opportunity_skills' : 'volunteer_skills';
  const ownerCol = kind === 'opportunity' ? 'opportunity_id' : 'volunteer_id';

  const { data, error } = await supabase
    .from(table)
    .select('skill_id')
    .eq(ownerCol, ownerId);
  if (error) throw error;
  return (data ?? []).map((r) => r.skill_id);
}
