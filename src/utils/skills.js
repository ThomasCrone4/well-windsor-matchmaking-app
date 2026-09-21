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
 * Rewrite one row's skills: delete what it had, insert what it now has.
 *
 * The same shape both role forms already use for opportunity_timeblocks --
 * delete every row and re-insert on each save. It is honest about the fact
 * that nothing here needs to know WHICH skill changed, and a join table with
 * no columns of its own has nothing to preserve across the rewrite.
 *
 * Unlike timeblocks there is no schedule_revision to protect: no trigger
 * watches these tables, so a no-op rewrite notifies nobody.
 *
 * @param {'opportunity'|'volunteer'} kind which join table
 * @param {string} ownerId the opportunity id or the volunteer id
 * @param {string[]} skillIds the chosen ids
 */
export async function replaceSkills(kind, ownerId, skillIds) {
  const table = kind === 'opportunity' ? 'opportunity_skills' : 'volunteer_skills';
  const ownerCol = kind === 'opportunity' ? 'opportunity_id' : 'volunteer_id';

  const { error: delError } = await supabase
    .from(table)
    .delete()
    .eq(ownerCol, ownerId);
  if (delError) throw delError;

  const rows = [...new Set(skillIds ?? [])].map((id) => ({
    [ownerCol]: ownerId,
    skill_id: id,
  }));
  if (rows.length === 0) return;

  const { error: insError } = await supabase.from(table).insert(rows);
  if (insError) throw insError;
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
