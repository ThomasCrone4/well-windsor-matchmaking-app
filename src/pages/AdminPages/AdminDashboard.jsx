// src/pages/AdminPages/AdminDashboard.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import { toast } from 'react-hot-toast';
import { format, parseISO, isValid } from 'date-fns';
import { Link } from 'react-router-dom';
import { ExternalLink, User, Building, Clock, MapPin, CheckCircle, XCircle } from 'lucide-react';

// ===== Data fetchers =====
async function getAllOrganisations() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id,name,email,created_at')
    .eq('role', 'organization')
    .order('name');
  if (error) throw error;
  return data;
}

async function getAllOpportunities({ status, orgId, showExpired, q, orgs }) {
  let query = supabase
    .from('volunteer_opportunities')
    .select('id,title,description,location,requires_dbs,status,org_id,when_needed,date_needed,created_at')
    .order('created_at', { ascending: false });

  if (status && status !== 'All') query = query.eq('status', status.toLowerCase());
  if (orgId && orgId !== 'All') query = query.eq('org_id', orgId);

  if (!showExpired) {
    const now = new Date().toISOString();
    query = query.or(`date_needed.is.null,date_needed.gte.${now}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  
  // Client-side filtering for title and organization name
  if (q && data) {
    const searchLower = q.toLowerCase();
    return data.filter(op => {
      const titleMatch = op.title?.toLowerCase().includes(searchLower);
      const orgName = orgs?.find(o => o.id === op.org_id)?.name || '';
      const orgMatch = orgName.toLowerCase().includes(searchLower);
      return titleMatch || orgMatch;
    });
  }
  
  return data;
}

async function getAllVolunteers({ q, town, dbsStatus }) {
  let query = supabase
    .from('user_profiles')
    .select('id,name,email,home_town,dbs_checked,created_at,public_profile')
    .eq('role', 'volunteer')
    .order('created_at', { ascending: false });

  if (q) query = query.ilike('name', `%${q}%`);
  if (town && town !== 'All') query = query.eq('home_town', town);
  if (dbsStatus === 'checked') query = query.eq('dbs_checked', true);
  if (dbsStatus === 'unchecked') query = query.eq('dbs_checked', false);
  
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
  const { error } = await supabase.from('towns').insert({ name, is_active: true });
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
  if (e1 || e2 || e3) throw e1 || e2 || e3;
  return { total: totalRows?.[0]?.minutes_total ?? 0, perOrg, perVol };
}

// ===== Page =====
export default function AdminDashboard() {
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState('opportunities');

  // Opp filters
  const [oppStatus, setOppStatus] = useState('All');
  const [oppOrg, setOppOrg] = useState('All');
  const [oppQ, setOppQ] = useState('');
  const [showExpired, setShowExpired] = useState(false);

  // Volunteer filters
  const [volQ, setVolQ] = useState('');
  const [volTown, setVolTown] = useState('All');
  const [volDbsStatus, setVolDbsStatus] = useState('All');

  // Organization filters
  const [orgQ, setOrgQ] = useState('');

  // Queries
  const { data: orgs } = useQuery({ 
    queryKey: ['admin-orgs'], 
    queryFn: getAllOrganisations,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: opportunities, isLoading: oppLoading } = useQuery({
    queryKey: ['admin-opportunities', oppStatus, oppOrg, showExpired, oppQ],
    queryFn: () => getAllOpportunities({ status: oppStatus, orgId: oppOrg, showExpired, q: oppQ, orgs }),
    staleTime: 2 * 60 * 1000,
    enabled: !!orgs, // Wait for orgs to load first
  });

  const { data: volunteers, isLoading: volLoading } = useQuery({
    queryKey: ['admin-volunteers', volQ, volTown, volDbsStatus],
    queryFn: () => getAllVolunteers({ q: volQ, town: volTown, dbsStatus: volDbsStatus }),
    staleTime: 2 * 60 * 1000,
  });

  const { data: towns } = useQuery({ 
    queryKey: ['towns'], 
    queryFn: getTowns,
    staleTime: 10 * 60 * 1000,
  });

  const { data: hours, isLoading: hoursLoading } = useQuery({
    queryKey: ['admin-hours'],
    queryFn: getHoursSummary,
    staleTime: 2 * 60 * 1000,
  });

  // Town mutations
  const addTownMut = useMutation({
    mutationFn: addTown,
    onSuccess: () => {
      toast.success('Town added successfully');
      qc.invalidateQueries({ queryKey: ['towns'] });
    },
    onError: (e) => toast.error(e.message || 'Failed to add town'),
  });

  const toggleTownMut = useMutation({
    mutationFn: ({ id, is_active }) => toggleTownActive(id, is_active),
    onSuccess: () => {
      toast.success('Town status updated');
      qc.invalidateQueries({ queryKey: ['towns'] });
    },
    onError: (e) => toast.error(e.message || 'Failed to update town'),
  });

  // Get org name by ID
  const getOrgName = (orgId) => {
    return orgs?.find(o => o.id === orgId)?.name || 'Unknown Organisation';
  };

  // Filter organizations for display
  const filteredOrgs = orgs?.filter(org => {
    if (!orgQ) return true;
    const searchLower = orgQ.toLowerCase();
    return org.name?.toLowerCase().includes(searchLower) || 
           org.email?.toLowerCase().includes(searchLower);
  });

  // Status badge component
  const StatusBadge = ({ status }) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      closed: 'bg-gray-100 text-gray-800',
      draft: 'bg-yellow-100 text-yellow-800',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status?.toUpperCase()}
      </span>
    );
  };

  // Reusable Tab Button
  const TabBtn = ({ id, children, count }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`btn ${activeTab === id ? 'btn-primary' : 'btn-secondary'} relative`}
    >
      {children}
      {count !== undefined && (
        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-white bg-opacity-20">
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="container-app max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="title">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Manage opportunities, volunteers, hours tracking, and location settings
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-3 mb-8">
        <TabBtn id="opportunities" count={opportunities?.length}>
          Opportunities
        </TabBtn>
        <TabBtn id="organizations" count={orgs?.length}>
          Organizations
        </TabBtn>
        <TabBtn id="volunteers" count={volunteers?.length}>
          Volunteers
        </TabBtn>
        <TabBtn id="hours">
          Hours
        </TabBtn>
        <TabBtn id="towns" count={towns?.filter(t => t.is_active)?.length}>
          Towns
        </TabBtn>
      </div>

      {/* Content */}
      {/* OPPORTUNITIES */}
      {activeTab === 'opportunities' && (
        <section className="space-y-6">
          <div className="card">
            <h2 className="section-title mb-4">Opportunity Filters</h2>
            
            <div className="form-grid md:grid-cols-4">
              <div className="form-row">
                <label htmlFor="opp-search" className="label">Search</label>
                <input
                  id="opp-search"
                  value={oppQ}
                  onChange={(e) => setOppQ(e.target.value)}
                  className="input"
                  placeholder="Search by title or organization..."
                />
              </div>
              
              <div className="form-row">
                <label htmlFor="opp-status" className="label">Status</label>
                <select 
                  id="opp-status"
                  value={oppStatus} 
                  onChange={(e) => setOppStatus(e.target.value)} 
                  className="select"
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Closed">Closed</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>
              
              <div className="form-row">
                <label htmlFor="opp-org" className="label">Organisation</label>
                <select 
                  id="opp-org"
                  value={oppOrg} 
                  onChange={(e) => setOppOrg(e.target.value)} 
                  className="select"
                >
                  <option value="All">All Organisations</option>
                  {orgs?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-row">
                <label className="label">Options</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showExpired}
                    onChange={(e) => setShowExpired(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Show expired</span>
                </label>
              </div>
            </div>

            {(oppQ || oppStatus !== 'All' || oppOrg !== 'All' || showExpired) && (
              <button
                onClick={() => {
                  setOppQ('');
                  setOppStatus('All');
                  setOppOrg('All');
                  setShowExpired(false);
                }}
                className="btn-secondary btn-sm mt-4"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="card">
            <h2 className="section-title mb-4">
              Opportunities {!oppLoading && `(${opportunities?.length || 0})`}
            </h2>
            
            {oppLoading ? (
              <div className="py-12 text-center text-gray-500">Loading opportunities...</div>
            ) : opportunities?.length === 0 ? (
              <div className="py-12 text-center text-gray-500">No opportunities found</div>
            ) : (
              <div className="space-y-3">
                {opportunities?.map((op) => {
                  const dateNeeded = op.date_needed && isValid(parseISO(op.date_needed)) 
                    ? format(parseISO(op.date_needed), 'PPP')
                    : 'Ongoing';
                  
                  return (
                    <div key={op.id} className="border rounded-lg p-4 hover:opacity-90 transition" style={{ borderColor: 'var(--color-border)' }}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg" style={{ color: 'var(--color-text-primary)' }}>{op.title}</h3>
                            <StatusBadge status={op.status} />
                          </div>
                          
                          <div className="space-y-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            <div className="flex items-center gap-2">
                              <Building size={14} />
                              <span>{getOrgName(op.org_id)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin size={14} />
                              <span>{op.location || 'Location not specified'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock size={14} />
                              <span>{dateNeeded}</span>
                            </div>
                            {op.requires_dbs && (
                              <div className="flex items-center gap-2 text-red-600">
                                <CheckCircle size={14} />
                                <span>DBS Required</span>
                              </div>
                            )}
                          </div>

                          {op.description && (
                            <p className="text-sm text-gray-700 mt-2 line-clamp-2">
                              {op.description}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex flex-col gap-2 shrink-0">
                          <Link
                            to={`/opportunity/${op.id}/applicants`}
                            className="btn-secondary btn-sm flex items-center gap-1"
                          >
                            <ExternalLink size={14} />
                            Applicants
                          </Link>
                          <Link
                            to={`/edit-opportunity/${op.id}`}
                            className="btn-secondary btn-sm flex items-center gap-1"
                          >
                            <ExternalLink size={14} />
                            Edit
                          </Link>
                          <button
                            onClick={() => {
                              setActiveTab('organizations');
                              setOrgQ(getOrgName(op.org_id));
                            }}
                            className="btn-secondary btn-sm flex items-center gap-1"
                          >
                            <User size={14} />
                            View Creator
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ORGANIZATIONS */}
      {activeTab === 'organizations' && (
        <section className="space-y-6">
          <div className="card">
            <h2 className="section-title mb-4">Organization Filters</h2>
            
            <div className="form-grid md:grid-cols-2">
              <div className="form-row">
                <label htmlFor="org-search" className="label">Search</label>
                <input
                  id="org-search"
                  value={orgQ}
                  onChange={(e) => setOrgQ(e.target.value)}
                  className="input"
                  placeholder="Search by name or email..."
                />
              </div>
            </div>

            {orgQ && (
              <button
                onClick={() => setOrgQ('')}
                className="btn-secondary btn-sm mt-4"
              >
                Clear Search
              </button>
            )}
          </div>

          <div className="card">
            <h2 className="section-title mb-4">
              Organizations {filteredOrgs && `(${filteredOrgs.length})`}
            </h2>
            
            {!orgs ? (
              <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading organizations...</div>
            ) : filteredOrgs?.length === 0 ? (
              <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>No organizations found</div>
            ) : (
              <div className="space-y-3">
                {filteredOrgs?.map((org) => (
                  <div key={org.id} className="border rounded-lg p-4 hover:opacity-90 transition" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <Building size={20} className="text-brand-teal shrink-0" />
                          <h3 className="font-semibold text-lg" style={{ color: 'var(--color-text-primary)' }}>{org.name}</h3>
                        </div>
                        
                        <div className="space-y-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                          {org.email && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Email:</span>
                              <span>{org.email}</span>
                            </div>
                          )}
                          {org.created_at && (
                            <div className="flex items-center gap-2">
                              <Clock size={14} />
                              <span>Joined {format(parseISO(org.created_at), 'PPP')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setActiveTab('opportunities');
                            setOppOrg(org.id);
                            setOppQ('');
                          }}
                          className="btn-secondary btn-sm flex items-center gap-1"
                        >
                          <ExternalLink size={14} />
                          View Opportunities
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* VOLUNTEERS */}
      {activeTab === 'volunteers' && (
        <section className="space-y-6">
          <div className="card">
            <h2 className="section-title mb-4">Volunteer Filters</h2>
            
            <div className="form-grid md:grid-cols-3">
              <div className="form-row">
                <label htmlFor="vol-search" className="label">Search</label>
                <input
                  id="vol-search"
                  value={volQ}
                  onChange={(e) => setVolQ(e.target.value)}
                  className="input"
                  placeholder="Search by name..."
                />
              </div>
              
              <div className="form-row">
                <label htmlFor="vol-town" className="label">Town</label>
                <select 
                  id="vol-town"
                  value={volTown} 
                  onChange={(e) => setVolTown(e.target.value)} 
                  className="select"
                >
                  <option value="All">All Towns</option>
                  {towns?.filter((t) => t.is_active).map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label htmlFor="vol-dbs" className="label">DBS Status</label>
                <select 
                  id="vol-dbs"
                  value={volDbsStatus} 
                  onChange={(e) => setVolDbsStatus(e.target.value)} 
                  className="select"
                >
                  <option value="All">All</option>
                  <option value="checked">DBS Checked</option>
                  <option value="unchecked">No DBS</option>
                </select>
              </div>
            </div>

            {(volQ || volTown !== 'All' || volDbsStatus !== 'All') && (
              <button
                onClick={() => {
                  setVolQ('');
                  setVolTown('All');
                  setVolDbsStatus('All');
                }}
                className="btn-secondary btn-sm mt-4"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="card">
            <h2 className="section-title mb-4">
              Volunteers {!volLoading && `(${volunteers?.length || 0})`}
            </h2>
            
            {volLoading ? (
              <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading volunteers...</div>
            ) : volunteers?.length === 0 ? (
              <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>No volunteers found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead style={{ backgroundColor: 'var(--color-background-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Email</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Town</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>DBS</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Profile</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                    {volunteers?.map((v) => (
                      <tr key={v.id} className="hover:opacity-90">
                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-primary)' }}>{v.name}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{v.email}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-primary)' }}>{v.home_town || '—'}</td>
                        <td className="px-4 py-3">
                          {v.dbs_checked ? (
                            <span className="flex items-center gap-1 text-green-700 text-sm">
                              <CheckCircle size={14} />
                              Valid
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-700 text-sm">
                              <XCircle size={14} />
                              No DBS
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {v.public_profile ? (
                            <span className="text-green-700">Public</span>
                          ) : (
                            <span className="text-gray-500">Private</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/volunteers/${v.id}`}
                            className="btn-secondary btn-sm flex items-center gap-1 w-fit"
                          >
                            <User size={14} />
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* HOURS */}
      {activeTab === 'hours' && (
        <section className="space-y-6">
          <div className="card">
            <h2 className="section-title mb-6">Hours Summary - The hours functionality is temporarily disabled</h2>

            {hoursLoading ? (
              <div className="py-12 text-center text-gray-500">Loading hours data...</div>
            ) : (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <StatCard 
                    label="Total Minutes Logged" 
                    value={(hours?.total ?? 0).toLocaleString()} 
                    icon={<Clock size={24} className="text-brand-teal" />}
                  />
                  <StatCard 
                    label="Total Hours" 
                    value={((hours?.total ?? 0) / 60).toFixed(1)} 
                    icon={<Clock size={24} className="text-brand-teal" />}
                  />
                  <StatCard 
                    label="Active Organisations" 
                    value={hours?.perOrg?.length ?? 0} 
                    icon={<Building size={24} className="text-brand-teal" />}
                  />
                </div>

                {/* Lists */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="px-4 py-3 border-b" style={{ backgroundColor: 'var(--color-background-secondary)', borderColor: 'var(--color-border)' }}>
                      <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Hours by Organisation</h3>
                    </div>
                    <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: 'var(--color-border)' }}>
                      {hours?.perOrg?.length > 0 ? (
                        hours.perOrg.map((row) => (
                          <RowItem
                            key={row.organisation_id}
                            left={row.organisation_name ?? row.organisation_id}
                            right={`${row.minutes_total} min (${(row.minutes_total / 60).toFixed(1)} h)`}
                          />
                        ))
                      ) : (
                        <div className="p-6 text-center" style={{ color: 'var(--color-text-muted)' }}>No data yet</div>
                      )}
                    </div>
                  </div>

                  <div className="border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="px-4 py-3 border-b" style={{ backgroundColor: 'var(--color-background-secondary)', borderColor: 'var(--color-border)' }}>
                      <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Hours by Volunteer</h3>
                    </div>
                    <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: 'var(--color-border)' }}>
                      {hours?.perVol?.length > 0 ? (
                        hours.perVol.map((row) => (
                          <RowItem
                            key={row.volunteer_id}
                            left={row.volunteer_name ?? row.volunteer_id}
                            right={`${row.minutes_total} min (${(row.minutes_total / 60).toFixed(1)} h)`}
                          />
                        ))
                      ) : (
                        <div className="p-6 text-center text-gray-500">No data yet</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* TOWNS */}
      {activeTab === 'towns' && (
        <section className="card">
          <h2 className="section-title mb-6">Manage Towns</h2>
          <TownEditor
            towns={towns || []}
            onAdd={(name) => addTownMut.mutate(name)}
            onToggle={(id, is_active) => toggleTownMut.mutate({ id, is_active })}
            isAdding={addTownMut.isPending}
            isToggling={toggleTownMut.isPending}
          />
        </section>
      )}
    </div>
  );
}

// ===== Small UI pieces =====
function StatCard({ label, value, icon }) {
  return (
    <div className="card flex items-center gap-4">
      <div className="p-3 bg-brand-teal bg-opacity-10 rounded-lg">
        {icon}
      </div>
      <div>
        <div className="text-sm text-gray-600 mb-1">{label}</div>
        <div className="text-3xl font-bold text-gray-900">{value}</div>
      </div>
    </div>
  );
}

function RowItem({ left, right }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between hover:opacity-90">
      <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{left}</span>
      <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{right}</span>
    </div>
  );
}

function TownEditor({ towns, onAdd, onToggle, isAdding, isToggling }) {
  const [name, setName] = useState('');
  const active = towns.filter((t) => t.is_active);
  const inactive = towns.filter((t) => !t.is_active);

  const handleAdd = () => {
    if (!name.trim()) {
      toast.error('Town name is required');
      return;
    }
    onAdd(name.trim());
    setName('');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label htmlFor="town-name" className="label">New Town Name</label>
          <input
            id="town-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="input"
            placeholder="e.g. Windsor"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleAdd}
            disabled={isAdding || !name.trim()}
            className="btn btn-primary w-full sm:w-auto"
          >
            {isAdding ? 'Adding...' : 'Add Town'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active */}
        <div className="border rounded-lg">
          <div className="bg-green-50 px-4 py-3 border-b border-green-100">
            <h3 className="font-semibold text-green-900 flex items-center gap-2">
              <CheckCircle size={18} />
              Active Towns ({active.length})
            </h3>
          </div>
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {active.length > 0 ? (
              active.map((t) => (
                <li key={t.id} className="px-4 py-3 flex items-center justify-between hover:opacity-90">
                  <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{t.name}</span>
                  <button
                    onClick={() => onToggle(t.id, false)}
                    disabled={isToggling}
                    className="btn-secondary btn-sm"
                  >
                    Deactivate
                  </button>
                </li>
              ))
            ) : (
              <li className="p-6 text-center" style={{ color: 'var(--color-text-muted)' }}>No active towns</li>
            )}
          </ul>
        </div>

        {/* Inactive */}
        <div className="border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>
          <div className="px-4 py-3 border-b" style={{ backgroundColor: 'var(--color-background-secondary)', borderColor: 'var(--color-border)' }}>
            <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
              <XCircle size={18} />
              Inactive Towns ({inactive.length})
            </h3>
          </div>
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {inactive.length > 0 ? (
              inactive.map((t) => (
                <li key={t.id} className="px-4 py-3 flex items-center justify-between hover:opacity-90">
                  <span style={{ color: 'var(--color-text-secondary)' }}>{t.name}</span>
                  <button
                    onClick={() => onToggle(t.id, true)}
                    disabled={isToggling}
                    className="btn-secondary btn-sm"
                  >
                    Activate
                  </button>
                </li>
              ))
            ) : (
              <li className="p-6 text-center" style={{ color: 'var(--color-text-muted)' }}>No inactive towns</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
