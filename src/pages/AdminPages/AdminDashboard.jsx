// src/pages/AdminPages/AdminDashboard.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

// ===== Data fetchers =====
async function getAllOrganisations() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id,name')
    .eq('role', 'organization')
    .order('name');
  if (error) throw error;
  return data;
}

async function getAllOpportunities({ status, orgId, showExpired, q }) {
  let query = supabase
    .from('volunteer_opportunities')
    .select('id,title,description,location,requires_dbs,status,org_id,when_needed,created_at')
    .order('created_at', { ascending: false });

  if (status && status !== 'All') query = query.eq('status', status.toLowerCase());
  if (orgId && orgId !== 'All') query = query.eq('org_id', orgId);

  // Include only ongoing or future-dated opportunities unless "Include expired" is ticked
  if (!showExpired) {
    // Safe even if you don't have 'no_longer_available' column
    // Shows records where date_needed is NULL (ongoing) OR in the future
    query = query.or('date_needed.is.null,date_needed.gt.now()');
    // If your PostgREST version dislikes 'now()', you can use:
    // query = query.or(`date_needed.is.null,date_needed.gte.${new Date().toISOString()}`);
  }

  if (q) query = query.ilike('title', `%${q}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getAllVolunteers({ q, town }) {
  let query = supabase
    .from('user_profiles')
    .select('id, role, name, email, hometown, dbs_checked, created_at, last_active_at')
    .eq('role', 'volunteer')
    .order('created_at', { ascending: false });

  if (q) query = query.ilike('name', `%${q}%`);
  if (town && town !== 'All') query = query.eq('hometown', town);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getTowns() {
  const { data, error } = await supabase.from('towns').select('*').order('name');
  if (error) throw error;
  return data;
}

async function addTown(name) {
  const { error } = await supabase.from('towns').insert({ name });
  if (error) throw error;
}

async function toggleTownActive(id, is_active) {
  const { error } = await supabase.from('towns').update({ is_active }).eq('id', id);
  if (error) throw error;
}

async function getHoursSummary() {
  const [{ data: totalRows, error: e1 }, { data: perOrg, error: e2 }, { data: perVol, error: e3 }] =
    await Promise.all([
      supabase.rpc('hours_total_sum'),
      supabase.rpc('hours_by_org'),
      supabase.rpc('hours_by_volunteer'),
    ]);
  if (e1 || e2 || e3) throw (e1 || e2 || e3);
  return { total: totalRows?.[0]?.minutes_total ?? 0, perOrg, perVol };
}

// ===== Page =====
export default function AdminDashboard() {
  const qc = useQueryClient();

  // Tabs & role preview (UI-only)
  const [activeTab, setActiveTab] = useState('opportunities');
  const [rolePreview, setRolePreview] = useState('admin');

  // Opp filters
  const [oppStatus, setOppStatus] = useState('All');
  const [oppOrg, setOppOrg] = useState('All');
  const [oppQ, setOppQ] = useState('');
  const [showExpired, setShowExpired] = useState(false);

  // Volunteer filters
  const [volQ, setVolQ] = useState('');
  const [volTown, setVolTown] = useState('All');

  // Queries
  const { data: orgs } = useQuery({ queryKey: ['admin-orgs'], queryFn: getAllOrganisations });

  const { data: opportunities, isLoading: oppLoading } = useQuery({
    queryKey: ['admin-opportunities', oppStatus, oppOrg, showExpired, oppQ],
    queryFn: () => getAllOpportunities({ status: oppStatus, orgId: oppOrg, showExpired, q: oppQ }),
  });

  const { data: volunteers, isLoading: volLoading } = useQuery({
    queryKey: ['admin-volunteers', volQ, volTown],
    queryFn: () => getAllVolunteers({ q: volQ, town: volTown }),
  });

  const { data: towns } = useQuery({ queryKey: ['towns'], queryFn: getTowns });

  const { data: hours, isLoading: hoursLoading } = useQuery({
    queryKey: ['admin-hours'],
    queryFn: getHoursSummary,
  });

  // Town mutations
  const addTownMut = useMutation({
    mutationFn: addTown,
    onSuccess: () => {
      toast.success('Town added');
      qc.invalidateQueries({ queryKey: ['towns'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleTownMut = useMutation({
    mutationFn: ({ id, is_active }) => toggleTownActive(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['towns'] }),
    onError: (e) => toast.error(e.message),
  });

  // Reusable Tab Button
  const TabBtn = ({ id, children }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`btn-secondary !rounded-full !px-4 !py-2 ${activeTab === id ? '!bg-blue-600 !text-white' : ''}`}
    >
      {children}
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-blue-700">Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Manage opportunities, volunteers, hours and towns. (Admin UI — permissions unchanged)
          </p>
        </div>

        {/* View-as (UI only) */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">View as</label>
          <select
            value={rolePreview}
            onChange={(e) => setRolePreview(e.target.value)}
            className="select w-44"
            title="UI preview only; permissions unchanged."
          >
            <option value="admin">Admin (real)</option>
            <option value="volunteer">Volunteer (preview)</option>
            <option value="organization">Organisation (preview)</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <TabBtn id="opportunities">Opportunities</TabBtn>
        <TabBtn id="volunteers">Volunteers</TabBtn>
        <TabBtn id="hours">Hours</TabBtn>
        <TabBtn id="towns">Towns</TabBtn>
      </div>

      {/* Content */}
      {/* OPPORTUNITIES */}
      {activeTab === 'opportunities' && (
        <section className="card space-y-4">
          <h2 className="text-xl font-semibold text-blue-700">All Opportunities</h2>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="form-control">
              <label className="label-text">Search</label>
              <input
                value={oppQ}
                onChange={(e) => setOppQ(e.target.value)}
                className="input"
                placeholder="Title…"
              />
            </div>
            <div className="form-control">
              <label className="label-text">Status</label>
              <select value={oppStatus} onChange={(e) => setOppStatus(e.target.value)} className="select">
                <option>All</option>
                <option>Active</option>
                <option>Closed</option>
                <option>Draft</option>
              </select>
            </div>
            <div className="form-control">
              <label className="label-text">Organisation</label>
              <select value={oppOrg} onChange={(e) => setOppOrg(e.target.value)} className="select">
                <option>All</option>
                {orgs?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-control pt-6">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showExpired}
                  onChange={(e) => setShowExpired(e.target.checked)}
                />
                <span className="text-sm">Include expired/filled</span>
              </label>
            </div>
          </div>

          {/* List */}
          <div className="divide-y">
            {oppLoading && <div className="py-6 text-gray-500">Loading…</div>}
            {!oppLoading && opportunities?.length === 0 && (
              <div className="py-6 text-gray-500">No opportunities found.</div>
            )}
            {opportunities?.map((op) => (
              <div key={op.id} className="py-4 flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-blue-700">{op.title}</div>
                  <div className="text-sm text-gray-600">
                    {op.organisation?.name ?? 'Unknown org'} • {op.location || 'Town N/A'} • DBS{' '}
                    {op.dbs_required ? 'required' : 'not required'} • Status:{' '}
                    <span className="uppercase">{op.status}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {op.date_needed ? `Date needed: ${format(new Date(op.date_needed), 'dd MMM yyyy')}` : 'Ongoing'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a href={`/organization/opportunity/${op.id}`} className="btn-secondary !py-1">
                    Org view
                  </a>
                  <a href={`/opportunity/${op.id}`} className="btn-secondary !py-1">
                    Public view
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* VOLUNTEERS */}
      {activeTab === 'volunteers' && (
        <section className="card space-y-4">
          <h2 className="text-xl font-semibold text-blue-700">Volunteers</h2>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="form-control">
              <label className="label-text">Search</label>
              <input
                value={volQ}
                onChange={(e) => setVolQ(e.target.value)}
                className="input"
                placeholder="Name…"
              />
            </div>
            <div className="form-control">
              <label className="label-text">Town</label>
              <select value={volTown} onChange={(e) => setVolTown(e.target.value)} className="select">
                <option>All</option>
                {towns?.filter((t) => t.is_active).map((t) => (
                  <option key={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Town</th>
                  <th className="px-4 py-3 text-left">DBS</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {volLoading && (
                  <tr>
                    <td className="px-4 py-3 text-gray-500" colSpan={5}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!volLoading && volunteers?.length === 0 && (
                  <tr>
                    <td className="px-4 py-3 text-gray-500" colSpan={5}>
                      No volunteers found.
                    </td>
                  </tr>
                )}
                {volunteers?.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-3">{v.name}</td>
                    <td className="px-4 py-3">{v.email}</td>
                    <td className="px-4 py-3">{v.hometown || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          v.dbs_checked ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {v.dbs_checked ? 'Valid' : 'No DBS'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/volunteer/${v.id}`} className="btn-secondary !py-1">
                        View profile
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* HOURS */}
      {activeTab === 'hours' && (
        <section className="card space-y-4">
          <h2 className="text-xl font-semibold text-blue-700">Hours Summary</h2>

          {hoursLoading ? (
            <div className="py-6 text-gray-500">Loading…</div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard label="Total minutes (final + confirmed)" value={hours?.total ?? 0} />
                <StatCard label="Total hours" value={((hours?.total ?? 0) / 60).toFixed(1)} />
                <StatCard label="Active organisations" value={hours?.perOrg?.length ?? 0} />
              </div>

              {/* Lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="subcard">
                  <div className="subcard-title">By Organisation</div>
                  <div className="divide-y">
                    {hours?.perOrg?.map((row) => (
                      <RowItem
                        key={row.organisation_id}
                        left={row.organisation_name ?? row.organisation_id}
                        right={`${row.minutes_total} min (${(row.minutes_total / 60).toFixed(1)} h)`}
                      />
                    ))}
                    {(hours?.perOrg?.length ?? 0) === 0 && (
                      <div className="p-3 text-sm text-gray-500">No data yet.</div>
                    )}
                  </div>
                </div>

                <div className="subcard">
                  <div className="subcard-title">By Volunteer</div>
                  <div className="divide-y">
                    {hours?.perVol?.map((row) => (
                      <RowItem
                        key={row.volunteer_id}
                        left={row.volunteer_name ?? row.volunteer_id}
                        right={`${row.minutes_total} min (${(row.minutes_total / 60).toFixed(1)} h)`}
                      />
                    ))}
                    {(hours?.perVol?.length ?? 0) === 0 && (
                      <div className="p-3 text-sm text-gray-500">No data yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* TOWNS */}
      {activeTab === 'towns' && (
        <section className="card space-y-4">
          <h2 className="text-xl font-semibold text-blue-700">Towns</h2>
          <TownEditor
            towns={towns || []}
            onAdd={(name) => addTownMut.mutate(name)}
            onToggle={(id, is_active) => toggleTownMut.mutate({ id, is_active })}
          />
        </section>
      )}

      {/* Role preview banner */}
      {rolePreview !== 'admin' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-100 text-amber-900 px-4 py-2 rounded shadow">
          Viewing UI as <b>{rolePreview}</b>. Permissions are unchanged (admins only).
        </div>
      )}
    </div>
  );
}

// ===== Small UI pieces that use your index.css conventions =====
function StatCard({ label, value }) {
  return (
    <div className="subcard">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-2xl font-semibold text-blue-700">{value}</div>
    </div>
  );
}

function RowItem({ left, right }) {
  return (
    <div className="p-3 flex items-center justify-between">
      <span className="text-sm">{left}</span>
      <span className="text-sm font-medium">{right}</span>
    </div>
  );
}

function TownEditor({ towns, onAdd, onToggle }) {
  const [name, setName] = useState('');
  const active = (towns || []).filter((t) => t.is_active);
  const inactive = (towns || []).filter((t) => !t.is_active);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="form-control grow">
          <label className="label-text">New town name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="e.g. Windsor"
          />
        </div>
        <button
          onClick={() => {
            if (!name.trim()) return toast.error('Town name required');
            onAdd(name.trim());
            setName('');
          }}
          className="btn-primary"
        >
          Add town
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Active */}
        <div className="subcard">
          <div className="subcard-title">Active</div>
          <ul className="divide-y">
            {active.map((t) => (
              <li key={t.id} className="p-3 flex items-center justify-between">
                <span>{t.name}</span>
                <button onClick={() => onToggle(t.id, false)} className="btn-secondary !py-1">
                  Deactivate
                </button>
              </li>
            ))}
            {active.length === 0 && <li className="p-3 text-gray-500 text-sm">No active towns.</li>}
          </ul>
        </div>

        {/* Inactive */}
        <div className="subcard">
          <div className="subcard-title">Inactive</div>
          <ul className="divide-y">
            {inactive.map((t) => (
              <li key={t.id} className="p-3 flex items-center justify-between">
                <span>{t.name}</span>
                <button onClick={() => onToggle(t.id, true)} className="btn-secondary !py-1">
                  Activate
                </button>
              </li>
            ))}
            {inactive.length === 0 && <li className="p-3 text-gray-500 text-sm">No inactive towns.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
