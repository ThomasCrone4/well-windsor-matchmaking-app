// src/pages/AdminPages/AdminDashboard.jsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import { toast } from 'react-hot-toast';
import { format, parseISO, isValid } from 'date-fns';
import { Link, useLocation } from 'react-router-dom';
import { ExternalLink, User, Building, Clock, MapPin, CheckCircle, XCircle } from 'lucide-react';
import AdminAccessTab from './AdminAccessTab';
import ConfirmDialog from '../../components/ConfirmDialog';
import { TakeDownRoleDialog, SwitchAccountDialog } from './AdminActionDialogs';
import AdminNav from './AdminNav';
import AdminApprovalQueue from './AdminApprovalQueue';
import AdminEmailLogs from './AdminEmailLogs';
import AdminRoleImages from './AdminRoleImages';
import Pagination from '../../components/Pagination';
import { useTowns } from '../../utils/towns';

// ===== Data fetchers =====
async function getAllOrganisations() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id,name,email,created_at,approved_at,declined_at')
    .eq('role', 'organization')
    .order('name');
  if (error) throw error;
  // Waiting-for-approval first. WF9-6 moved the queue itself onto /admin,
  // where it is a list with Approve and Decline on it rather than a sort
  // order buried in a list of every organisation that ever signed up -- but
  // this order still helps whoever is scanning the full list here.
  return [...(data ?? [])].sort(
    (a, b) => Number(!!a.approved_at) - Number(!!b.approved_at)
  );
}

// The only way an organisation becomes approved. set_organisation_approval
// is SECURITY DEFINER and checks is_admin(auth.uid()) itself -- approved_at
// is not writable by any client, so there is no update() to get wrong here.
async function setOrganisationApproval(orgId, approved) {
  const { error } = await supabase.rpc('set_organisation_approval', {
    p_org_id: orgId,
    p_approved: approved,
  });
  if (error) throw error;
}

async function getAllOpportunities({ status, orgId, showRemoved, q, orgs }) {
  let query = supabase
    .from('volunteer_opportunities')
    .select('id,title,description,location,requires_dbs,status,org_id,deleted_at,created_at')
    .order('created_at', { ascending: false });

  if (status && status !== 'All') query = query.eq('status', status.toLowerCase());
  if (orgId && orgId !== 'All') query = query.eq('org_id', orgId);

  // ROLE-1. Removed roles are hidden from everyone else — including the
  // organisation that removed them — so the admin is the only one who can
  // still see one, and that is worth being able to do deliberately.
  //
  // This replaces a "Show expired" checkbox that filtered on `date_needed`,
  // a column nothing ever wrote. It was NULL on every row, so the
  // `date_needed.is.null` arm matched everything and the control did nothing
  // at all in either position.
  if (!showRemoved) query = query.is('deleted_at', null);

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

async function getAllVolunteers({ q, town }) {
  let query = supabase
    .from('user_profiles')
    .select('id,name,email,home_town,created_at,public_profile')
    .eq('role', 'volunteer')
    .order('created_at', { ascending: false });

  if (q) query = query.ilike('name', `%${q}%`);
  if (town && town !== 'All') query = query.eq('home_town', town);
  
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// POLISH-4. Skills are read through a function, not the table: the counts
// come from the join tables, and the admin needs to see what hiding one would
// leave behind. The table itself grants no writes to anybody -- admin_add_skill
// and admin_set_skill_active are the only ways in.
async function getSkillUsage() {
  const { data, error } = await supabase.rpc('admin_skill_usage');
  if (error) throw error;
  return data ?? [];
}

async function addSkill({ name, category }) {
  const { error } = await supabase.rpc('admin_add_skill', {
    p_name: name,
    p_category: category,
  });
  if (error) throw error;
}

async function setSkillActive(id, is_active) {
  const { error } = await supabase.rpc('admin_set_skill_active', {
    p_skill_id: id,
    p_active: is_active,
  });
  if (error) throw error;
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

// The database refuses to deactivate a town while any role or person is
// filed under it, or the last active town (towns_guard). Its message says
// how many of each, so it is shown as-is.
async function toggleTownActive(id, is_active) {
  const { error } = await supabase.from('towns').update({ is_active }).eq('id', id);
  if (error) throw error;
}

// ADM-1. Removal, not closing, and never DELETE: see
// 20260916115724_wf7_admin_takes_down_a_role.sql. Audited with the reason.
async function takeDownRole(opportunityId, reason) {
  const { error } = await supabase.rpc('admin_take_down_role', {
    p_opportunity_id: opportunityId,
    p_reason: reason,
  });
  if (error) throw error;
}

// ADM-2/ADM-5. The only way an account's type changes. `role` is not
// writable by any client, admins included, so there is no update() to get
// wrong here either.
async function switchAccountType(userId, newRole, dob) {
  const { data, error } = await supabase.rpc('admin_switch_account_type', {
    p_user_id: userId,
    p_new_role: newRole,
    p_dob: dob,
  });
  if (error) throw error;
  return data;
}

// created_at is a timestamp, handled_at is a timestamptz, and either can be
// null on a row that has not been handled — parse defensively rather than
// handing an Invalid Date to format().
function fmtDate(value) {
  if (!value) return 'unknown date';
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, 'PPp') : 'unknown date';
}

// ADM-7. The list is the point: an emailed report with no state cannot be
// tracked, and two admins cannot see each other's work.
async function getProblemReports() {
  const { data, error } = await supabase
    .from('problem_reports')
    .select('id,message,contact_email,page_url,status,created_at,handled_at,handled_by,reporter_id')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  // Unhandled first: that is the queue an admin is here to clear.
  return [...(data ?? [])].sort(
    (a, b) => Number(a.status === 'handled') - Number(b.status === 'handled')
  );
}

// Only `status` is writable. handled_at and handled_by are stamped by a
// database trigger, so handling cannot be back-dated or pinned on another
// admin.
async function setReportStatus(id, status) {
  const { error } = await supabase.from('problem_reports').update({ status }).eq('id', id);
  if (error) throw error;
}

// ===== Page =====
export default function AdminDashboard() {
  const qc = useQueryClient();

  // WF9-6. The top-level split is the ROUTE now, not a tab: /admin,
  // /admin/manage and /admin/logs. `activeTab` survives as the sub-tab
  // WITHIN Site management, which still has four things to show.
  const { pathname } = useLocation();
  const section = pathname.startsWith('/admin/manage')
    ? 'manage'
    : pathname.startsWith('/admin/logs')
      ? 'logs'
      : 'access';

  const [activeTab, setActiveTab] = useState('opportunities');

  // WF9-6. Admin lists page at 50, not 10: these rows carry no images, so a
  // longer page is cheap and means less clicking through a list you are
  // scanning rather than reading. Page state is per-list and resets when the
  // sub-tab changes, so switching tabs never lands on an empty page 3.
  const PER_PAGE = 50;
  const [oppPage, setOppPage] = useState(1);
  const [orgPage, setOrgPage] = useState(1);
  const [volPage, setVolPage] = useState(1);
  const paged = (list, page) => {
    const rows = list ?? [];
    const pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    const safe = Math.min(page, pageCount);
    return {
      rows: rows.slice((safe - 1) * PER_PAGE, safe * PER_PAGE),
      pageCount,
      page: safe,
      total: rows.length,
    };
  };
  const [currentUserId, setCurrentUserId] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data?.user?.id ?? null));
  }, []);

  // Opp filters
  const [oppStatus, setOppStatus] = useState('All');
  const [oppOrg, setOppOrg] = useState('All');
  const [oppQ, setOppQ] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);

  // Volunteer filters
  const [volQ, setVolQ] = useState('');
  const [volTown, setVolTown] = useState('All');

  // Organization filters
  const [orgQ, setOrgQ] = useState('');

  // The two actions that ask a question first.
  const [takingDown, setTakingDown] = useState(null);   // opportunity row
  const [switching, setSwitching] = useState(null);     // { account, toRole }
  const { showPicker: showTownFilter } = useTowns();

  // Queries
  const { data: orgs } = useQuery({ 
    queryKey: ['admin-orgs'], 
    queryFn: getAllOrganisations,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: opportunities, isLoading: oppLoading } = useQuery({
    queryKey: ['admin-opportunities', oppStatus, oppOrg, showRemoved, oppQ],
    queryFn: () => getAllOpportunities({ status: oppStatus, orgId: oppOrg, showRemoved, q: oppQ, orgs }),
    staleTime: 2 * 60 * 1000,
    enabled: !!orgs, // Wait for orgs to load first
  });

  const { data: volunteers, isLoading: volLoading } = useQuery({
    queryKey: ['admin-volunteers', volQ, volTown],
    queryFn: () => getAllVolunteers({ q: volQ, town: volTown }),
    staleTime: 2 * 60 * 1000,
  });

  const { data: towns } = useQuery({ 
    queryKey: ['towns'], 
    queryFn: getTowns,
    staleTime: 10 * 60 * 1000,
  });

  const { data: skillRows } = useQuery({
    queryKey: ['admin_skill_usage'],
    queryFn: getSkillUsage,
    staleTime: 60 * 1000,
  });

  const invalidateSkills = () => {
    qc.invalidateQueries({ queryKey: ['admin_skill_usage'] });
    // The pickers read this one, everywhere on the site.
    qc.invalidateQueries({ queryKey: ['skills'] });
  };

  const addSkillMut = useMutation({
    mutationFn: addSkill,
    onSuccess: () => {
      toast.success('Skill added');
      invalidateSkills();
    },
    onError: (e) => toast.error(e.message || 'Failed to add skill'),
  });

  const toggleSkillMut = useMutation({
    mutationFn: ({ id, is_active }) => setSkillActive(id, is_active),
    onSuccess: (_d, v) => {
      toast.success(v.is_active ? 'Skill restored' : 'Skill hidden');
      invalidateSkills();
    },
    onError: (e) => toast.error(e.message || 'Failed to update skill'),
  });

  // Town mutations
  const addTownMut = useMutation({
    mutationFn: addTown,
    onSuccess: () => {
      toast.success('Town added successfully');
      qc.invalidateQueries({ queryKey: ['towns'] });
      qc.invalidateQueries({ queryKey: ['active-towns'] });
    },
    onError: (e) => toast.error(e.message || 'Failed to add town'),
  });

  const toggleTownMut = useMutation({
    mutationFn: ({ id, is_active }) => toggleTownActive(id, is_active),
    onSuccess: () => {
      toast.success('Town status updated');
      qc.invalidateQueries({ queryKey: ['towns'] });
      qc.invalidateQueries({ queryKey: ['active-towns'] });
    },
    onError: (e) => toast.error(e.message || 'Failed to update town'),
  });

  const takeDownMut = useMutation({
    mutationFn: ({ id, reason }) => takeDownRole(id, reason),
    onSuccess: () => {
      toast.success('Role taken down');
      setTakingDown(null);
      qc.invalidateQueries({ queryKey: ['admin-opportunities'] });
    },
    onError: (e) => toast.error(e.message || 'Could not take the role down'),
  });

  const switchMut = useMutation({
    mutationFn: ({ id, toRole, dob }) => switchAccountType(id, toRole, dob),
    onSuccess: (result, { toRole }) => {
      const detail =
        toRole === 'organization'
          ? `${result?.registrations_withdrawn ?? 0} registration(s) withdrawn`
          : `${result?.roles_closed ?? 0} live role(s) closed`;
      toast.success(
        `Now ${toRole === 'organization' ? 'an organisation, waiting for approval' : 'a volunteer'} (${detail})`
      );
      setSwitching(null);
      qc.invalidateQueries({ queryKey: ['admin-orgs'] });
      qc.invalidateQueries({ queryKey: ['admin-volunteers'] });
      qc.invalidateQueries({ queryKey: ['admin-opportunities'] });
    },
    onError: (e) => toast.error(e.message || 'Could not switch the account'),
  });

  const { data: reports, isPending: reportsPending } = useQuery({
    queryKey: ['admin-problem-reports'],
    queryFn: getProblemReports,
    staleTime: 60 * 1000,
  });

  const reportMut = useMutation({
    mutationFn: ({ id, status }) => setReportStatus(id, status),
    onSuccess: (_r, { status }) => {
      toast.success(status === 'handled' ? 'Report marked handled' : 'Report reopened');
      qc.invalidateQueries({ queryKey: ['admin-problem-reports'] });
    },
    onError: (e) => toast.error(e.message || 'Could not update the report'),
  });

  const approvalMut = useMutation({
    mutationFn: ({ id, approved }) => setOrganisationApproval(id, approved),
    onSuccess: (_r, { approved }) => {
      toast.success(approved ? 'Organisation approved' : 'Approval withdrawn');
      qc.invalidateQueries({ queryKey: ['admin-orgs'] });
    },
    onError: (e) => toast.error(e.message || 'Could not update approval'),
  });

  // Waiting = neither approved nor declined (WF9-6). Counting every
  // unapproved organisation meant the badge never went down once the
  // charity had said no to somebody.
  const pendingOrgCount = (orgs ?? []).filter(
    (o) => !o.approved_at && !o.declined_at
  ).length;
  const newReportCount = (reports ?? []).filter((r) => r.status === 'new').length;

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
      onClick={() => {
        setActiveTab(id);
        setOppPage(1);
        setOrgPage(1);
        setVolPage(1);
      }}
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
        <h1 className="title">
          {section === 'manage'
            ? 'Site management'
            : section === 'logs'
              ? 'Logs and reports'
              : 'Access'}
        </h1>
        <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>
          {section === 'manage'
            ? 'Roles, organisations, volunteers and the towns the service covers.'
            : section === 'logs'
              ? 'What has been reported, and everything the site has sent.'
              : 'Who is waiting to be approved, who can administer the site, and who gets alerted.'}
        </p>
      </div>

      <AdminNav pendingCount={pendingOrgCount} reportCount={newReportCount} />

      {/* Site management keeps sub-tabs: four different things, one page. */}
      {section === 'manage' && (
        <div className="flex flex-wrap gap-3 mb-8">
          <TabBtn id="opportunities" count={opportunities?.length}>
            Opportunities
          </TabBtn>
          <TabBtn id="organizations" count={orgs?.length}>
            Organisations
          </TabBtn>
          <TabBtn id="volunteers" count={volunteers?.length}>
            Volunteers
          </TabBtn>
          <TabBtn id="towns" count={towns?.filter(t => t.is_active)?.length}>
            Towns
          </TabBtn>
          <TabBtn id="skills" count={skillRows?.filter((s) => s.is_active)?.length}>
            Skills
          </TabBtn>
          <TabBtn id="images">
            Pictures
          </TabBtn>
        </div>
      )}

      {/* ACCESS -- the landing page. The queue first, because it is the only
          part of the admin with somebody waiting at the other end. */}
      {section === 'access' && (
        <div className="space-y-8">
          <AdminApprovalQueue organisations={orgs} isLoading={!orgs} />
          <AdminAccessTab currentUserId={currentUserId} />
        </div>
      )}

      {section === 'logs' && <AdminEmailLogs />}

      {/* Content */}
      {/* OPPORTUNITIES */}
      {section === 'manage' && activeTab === 'opportunities' && (
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
                    checked={showRemoved}
                    onChange={(e) => setShowRemoved(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Show removed</span>
                </label>
              </div>
            </div>

            {(oppQ || oppStatus !== 'All' || oppOrg !== 'All' || showRemoved) && (
              <button
                onClick={() => {
                  setOppQ('');
                  setOppStatus('All');
                  setOppOrg('All');
                  setShowRemoved(false);
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
                {paged(opportunities, oppPage).rows.map((op) => {
                  // The "date needed" line that stood here read a column
                  // nothing ever wrote, so it printed "Ongoing" on every row
                  // in the table. Posted date is a fact; that was not.
                  const posted = fmtDate(op.created_at);

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
                              <span>Posted {posted}</span>
                            </div>
                            {op.deleted_at && (
                              <div className="flex items-center gap-2" style={{ color: 'var(--color-danger)' }}>
                                <XCircle size={14} />
                                <span>Removed {fmtDate(op.deleted_at)}</span>
                              </div>
                            )}
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
                          {!op.deleted_at && (
                            <button
                              onClick={() => setTakingDown(op)}
                              className="btn-secondary btn-sm flex items-center gap-1"
                              style={{ color: 'var(--color-danger)' }}
                            >
                              <XCircle size={14} />
                              Take down
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Pagination
              page={paged(opportunities, oppPage).page}
              pageCount={paged(opportunities, oppPage).pageCount}
              onChange={setOppPage}
              total={paged(opportunities, oppPage).total}
              perPage={PER_PAGE}
              noun="role"
            />
          </div>
        </section>
      )}

      {/* ORGANIZATIONS */}
      {section === 'manage' && activeTab === 'organizations' && (
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
                {paged(filteredOrgs, orgPage).rows.map((org) => (
                  <div key={org.id} className="border rounded-lg p-4 hover:opacity-90 transition" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <Building size={20} className="text-brand-ink shrink-0" />
                          <h3 className="font-semibold text-lg" style={{ color: 'var(--color-text-primary)' }}>{org.name}</h3>
                          {org.approved_at ? (
                            <span className="badge badge-success">Approved</span>
                          ) : (
                            <span className="badge badge-warning">Waiting for approval</span>
                          )}
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
                              <span>Joined {format(parseISO(org.created_at), 'd MMM yyyy')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 shrink-0">
                        {/* WF9-7: every admin list links to the one page
                            about a person, where the per-account actions
                            live. */}
                        <Link
                          to={`/admin/accounts/${org.id}`}
                          className="btn-secondary btn-sm w-fit"
                        >
                          View account
                        </Link>
                        {/* Approving lets this organisation publish roles,
                            see discoverable volunteers and email them.
                            Withdrawing takes its live roles off the public
                            browse immediately (RLS), without closing them. */}
                        {org.approved_at ? (
                          <button
                            onClick={() => {
                              if (window.confirm(`Withdraw approval for ${org.name}? Their live roles will disappear from the browse and they will not be able to contact volunteers.`)) {
                                approvalMut.mutate({ id: org.id, approved: false });
                              }
                            }}
                            disabled={approvalMut.isPending}
                            className="btn-secondary btn-sm"
                          >
                            Withdraw approval
                          </button>
                        ) : (
                          <button
                            onClick={() => approvalMut.mutate({ id: org.id, approved: true })}
                            disabled={approvalMut.isPending}
                            className="btn-primary btn-sm"
                          >
                            Approve
                          </button>
                        )}
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
                        <button
                          onClick={() => setSwitching({ account: org, toRole: 'volunteer' })}
                          className="btn-secondary btn-sm"
                        >
                          Make volunteer
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Pagination
              page={paged(filteredOrgs, orgPage).page}
              pageCount={paged(filteredOrgs, orgPage).pageCount}
              onChange={setOrgPage}
              total={paged(filteredOrgs, orgPage).total}
              perPage={PER_PAGE}
              noun="organisation"
            />
          </div>
        </section>
      )}

      {/* VOLUNTEERS */}
      {section === 'manage' && activeTab === 'volunteers' && (
        <section className="space-y-6">
          <div className="card">
            <h2 className="section-title mb-4">Volunteer Filters</h2>
            
            <div className="form-grid md:grid-cols-2">
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
              
              {showTownFilter && (
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
              )}
            </div>

            {(volQ || volTown !== 'All') && (
              <button
                onClick={() => {
                  setVolQ('');
                  setVolTown('All');
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
                    {paged(volunteers, volPage).rows.map((v) => (
                      <tr key={v.id} className="hover:opacity-90">
                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-primary)' }}>{v.name}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{v.email}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-primary)' }}>{v.home_town || 'Not given'}</td>
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
                          <div className="flex flex-wrap gap-2">
                            <Link
                              to={`/admin/accounts/${v.id}`}
                              className="btn-secondary btn-sm flex items-center gap-1 w-fit"
                            >
                              <User size={14} />
                              View
                            </Link>
                            <button
                              onClick={() => setSwitching({ account: v, toRole: 'organization' })}
                              className="btn-secondary btn-sm w-fit"
                            >
                              Make organisation
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={paged(volunteers, volPage).page}
              pageCount={paged(volunteers, volPage).pageCount}
              onChange={setVolPage}
              total={paged(volunteers, volPage).total}
              perPage={PER_PAGE}
              noun="volunteer"
            />
          </div>
        </section>
      )}

      {/* SKILLS (POLISH-4) */}
      {section === 'manage' && activeTab === 'skills' && (
        <section className="card">
          <h2 className="section-title mb-2">Manage Skills</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            This is the list volunteers and organisations choose from, on
            sign-up, on a profile and when posting a role.{' '}
            <strong style={{ color: 'var(--color-text-primary)' }}>
              Hiding a skill only stops new choices.
            </strong>{' '}
            Anyone who already chose it keeps it, and it carries on showing on
            their profile and on any role that asked for it — so hiding is
            always safe, even for a skill in use. There is no way to delete
            one.
          </p>
          <SkillEditor
            skills={skillRows || []}
            onAdd={(name, category) => addSkillMut.mutate({ name, category })}
            onToggle={(id, is_active) => toggleSkillMut.mutate({ id, is_active })}
            isAdding={addSkillMut.isPending}
            isToggling={toggleSkillMut.isPending}
          />
        </section>
      )}

      {/* ROLE PICTURES (POLISH-9) */}
      {section === 'manage' && activeTab === 'images' && <AdminRoleImages />}

      {/* TOWNS (ADM-6) */}
      {section === 'manage' && activeTab === 'towns' && (
        <section className="card">
          <h2 className="section-title mb-2">Manage Towns</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            While only one town is active, nobody is asked to choose a town
            anywhere on the site (sign-up, profiles, posting a role, the
            browse), and everything is filed under that town. Activate a
            second town and every one of those choices appears at once. A town
            cannot be deactivated while any role or person is filed under it.
          </p>
          <TownEditor
            towns={towns || []}
            onAdd={(name) => addTownMut.mutate(name)}
            onToggle={(id, is_active) => toggleTownMut.mutate({ id, is_active })}
            isAdding={addTownMut.isPending}
            isToggling={toggleTownMut.isPending}
          />
        </section>
      )}

      {/* RECIPIENT LIST AND ADMIN ACCOUNTS (APP-3, APP-6) */}
      

      {/* PROBLEM REPORTS (ADM-7) */}
      {section === 'logs' && (
        <section className="space-y-4">
          <div className="card">
            <h2 className="section-title mb-2">Problem reports</h2>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Sent from the &ldquo;Report a problem&rdquo; link in the footer, by
              visitors as well as signed-in people. Marking one handled records
              who did it and when, so two admins can see each other&rsquo;s work.
            </p>
          </div>

          {reportsPending ? (
            <div className="card" style={{ color: 'var(--color-text-secondary)' }}>
              Loading reports…
            </div>
          ) : (reports ?? []).length === 0 ? (
            <div className="card" style={{ color: 'var(--color-text-secondary)' }}>
              No problem reports. Nothing to clear.
            </div>
          ) : (
            (reports ?? []).map((r) => {
              const handled = r.status === 'handled';
              return (
                <div
                  key={r.id}
                  className="card"
                  style={{ opacity: handled ? 0.65 : 1 }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-1 text-xs font-medium rounded-full"
                        style={
                          handled
                            ? { backgroundColor: 'var(--color-background-secondary)',
                                color: 'var(--color-text-secondary)' }
                            : { backgroundColor: 'var(--color-danger)', color: '#fff' }
                        }
                      >
                        {handled ? 'HANDLED' : 'NEW'}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        <Clock className="inline w-3 h-3 mr-1" />
                        {fmtDate(r.created_at)}
                      </span>
                    </div>

                    <button
                      className={handled ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
                      disabled={reportMut.isPending}
                      onClick={() =>
                        reportMut.mutate({ id: r.id, status: handled ? 'new' : 'handled' })
                      }
                    >
                      {handled ? 'Reopen' : 'Mark handled'}
                    </button>
                  </div>

                  <p
                    className="mt-3 whitespace-pre-wrap text-sm"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {r.message}
                  </p>

                  <div
                    className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <span>
                      {r.reporter_id ? 'From a signed-in account' : 'From a signed-out visitor'}
                    </span>
                    {r.page_url && <span>Page: {r.page_url}</span>}
                    {r.contact_email ? (
                      <a
                        href={`mailto:${r.contact_email}`}
                        style={{ color: 'var(--color-brand-ink)' }}
                        className="hover:underline"
                      >
                        {r.contact_email}
                      </a>
                    ) : (
                      <span>No reply address given</span>
                    )}
                    {handled && r.handled_at && <span>Handled {fmtDate(r.handled_at)}</span>}
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {takingDown && (
        <TakeDownRoleDialog
          role={takingDown}
          orgName={getOrgName(takingDown.org_id)}
          isPending={takeDownMut.isPending}
          onClose={() => setTakingDown(null)}
          onConfirm={(reason) => takeDownMut.mutate({ id: takingDown.id, reason })}
        />
      )}

      {switching && (
        <SwitchAccountDialog
          account={switching.account}
          toRole={switching.toRole}
          isPending={switchMut.isPending}
          onClose={() => setSwitching(null)}
          onConfirm={(dob) =>
            switchMut.mutate({ id: switching.account.id, toRole: switching.toRole, dob })
          }
        />
      )}
    </div>
  );
}

// ===== Small UI pieces =====

// POLISH-4. Deliberately simpler than TownEditor below, and the difference is
// the point: activating a town changes the whole site at once, so it asks for
// confirmation. Hiding a skill cannot hurt anybody -- everyone who holds it
// keeps it -- so it just happens, and the count says what it will leave
// behind.
function SkillEditor({ skills, onAdd, onToggle, isAdding, isToggling }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');

  const active = skills.filter((s) => s.is_active);
  const hidden = skills.filter((s) => !s.is_active);

  // Offered from what is already in use, so a new skill lands in a group the
  // pickers already show rather than creating a group of one.
  const categories = [...new Set(skills.map((s) => s.category).filter(Boolean))];

  const submit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, category || 'Other');
    setName('');
    setCategory('');
  };

  const usage = (s) => {
    const bits = [];
    if (s.volunteer_count) bits.push(`${s.volunteer_count} volunteer${s.volunteer_count === 1 ? '' : 's'}`);
    if (s.opportunity_count) bits.push(`${s.opportunity_count} role${s.opportunity_count === 1 ? '' : 's'}`);
    return bits.length ? bits.join(' · ') : 'Not chosen by anyone yet';
  };

  const Row = ({ s }) => (
    <li
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {s.name}
        </p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {s.category} &middot; {usage(s)}
        </p>
      </div>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={isToggling}
        onClick={() => onToggle(s.id, !s.is_active)}
      >
        {s.is_active ? 'Hide' : 'Restore'}
      </button>
    </li>
  );

  return (
    <div className="grid gap-6">
      <form onSubmit={submit} className="form-grid md:grid-cols-[2fr_1fr_auto] md:items-end">
        <div className="form-row">
          <label htmlFor="new-skill" className="label">Add a skill</label>
          <input
            id="new-skill"
            className="input"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Photography and video"
          />
        </div>
        <div className="form-row">
          <label htmlFor="new-skill-category" className="label">Group</label>
          <select
            id="new-skill-category"
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Other</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary mb-1" disabled={isAdding || !name.trim()}>
          Add
        </button>
      </form>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
        <h3
          className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em]"
          style={{ backgroundColor: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}
        >
          On the list ({active.length})
        </h3>
        <ul>
          {active.map((s) => <Row key={s.id} s={s} />)}
          {active.length === 0 && (
            <li className="p-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
              No skills on the list
            </li>
          )}
        </ul>
      </div>

      {hidden.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <h3
            className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em]"
            style={{ backgroundColor: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}
          >
            Hidden ({hidden.length})
          </h3>
          <p className="px-4 pt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Not offered to anyone choosing skills now. Still shown on the
            profiles and roles that already have them.
          </p>
          <ul>
            {hidden.map((s) => <Row key={s.id} s={s} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

function TownEditor({ towns, onAdd, onToggle, isAdding, isToggling }) {
  const [name, setName] = useState('');
  // { kind: 'add', name } or { kind: 'activate', id, name }
  const [confirming, setConfirming] = useState(null);
  const active = towns.filter((t) => t.is_active);
  const inactive = towns.filter((t) => !t.is_active);

  // Activating a town is a site-wide change the moment it lands: going from
  // one active town to two puts a town picker on every form and the browse.
  const handleAdd = () => {
    if (!name.trim()) {
      toast.error('Town name is required');
      return;
    }
    setConfirming({ kind: 'add', name: name.trim() });
  };

  const confirmMessage =
    confirming &&
    (active.length === 1
      ? `${confirming.name} will be active alongside ${active[0].name}. Town choices will appear straight away on sign-up, profiles, the role forms and the browse, everywhere on the site.`
      : `${confirming.name} will be offered as a choice everywhere a town is picked.`);

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
            placeholder="e.g. Maidenhead"
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
                    onClick={() => setConfirming({ kind: 'activate', id: t.id, name: t.name })}
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

      <ConfirmDialog
        isOpen={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming.kind === 'add') {
            onAdd(confirming.name);
            setName('');
          } else {
            onToggle(confirming.id, true);
          }
        }}
        title={confirming?.kind === 'add' ? `Add ${confirming?.name}?` : `Activate ${confirming?.name}?`}
        message={confirmMessage}
        confirmText={confirming?.kind === 'add' ? 'Add town' : 'Activate'}
        confirmStyle="primary"
      />
    </div>
  );
}
