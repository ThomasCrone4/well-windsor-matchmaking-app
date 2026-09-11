// OrganizationDashboard.jsx
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { toast } from 'react-hot-toast';
import { format, parseISO, isValid } from 'date-fns';

import { Edit2, Trash2 } from 'lucide-react';
import ListSkeleton from '../../components/skeletons/ListSkeleton';
import useUserProfile from '../../hooks/useUserProfile';
import ApprovalNotice from '../../components/ApprovalNotice';
import { isPendingOrganisation } from '../../utils/approval';


export default function OrganizationDashboard() {
  const [opportunities, setOpportunities] = useState([]);
  const [applicationsCount, setApplicationsCount] = useState({});
  const [orgId, setOrgId] = useState(null);
  const { profile } = useUserProfile();
  const pending = isPendingOrganisation(profile);
  const [loading, setLoading] = useState(true);
  const [showReasonDropdown, setShowReasonDropdown] = useState(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrgIdAndData = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user?.id) {
        toast.error('Could not get user ID');
        return;
      }

      const uid = userData.user.id;
      setOrgId(uid);

      const { data: ops, error: opsError } = await supabase
        .from('volunteer_opportunities')
        .select('*')
        .eq('org_id', uid)
        .order('created_at', { ascending: false });

      if (opsError) {
        toast.error('Failed to load opportunities');
        console.error(opsError);
      } else {
        setOpportunities(ops);
        const ids = ops.map((op) => op.id);

        if (ids.length > 0) {
          const { data: apps, error: appsError } = await supabase
            .from('applications')
            .select('opportunity_id')
            .in('opportunity_id', ids);

          if (appsError) {
            console.error('Error fetching applications:', appsError.message);
          } else {
            const countMap = {};
            for (const app of apps) {
              countMap[app.opportunity_id] = (countMap[app.opportunity_id] || 0) + 1;
            }
            setApplicationsCount(countMap);
          }
        }
      }

      setLoading(false);
    };

    fetchOrgIdAndData();
  }, []);

  // This used to warn "this opportunity is in the past" by testing
  // date_needed -- a column nothing writes, NULL on every row, and
  // new Date(null) is 1 January 1970. So every single delete said the role
  // was in the past. The audit caught it; the warning is now just true.
  const handleDelete = async (id) => {
    const confirmMsg =
      'Delete this opportunity permanently? Everyone who registered interest in it will be removed too. If you might offer it again, close it instead.';

    if (!window.confirm(confirmMsg)) return;

    const { error } = await supabase.from('volunteer_opportunities').delete().eq('id', id);

    if (error) {
      toast.error('Failed to delete opportunity');
      console.error(error);
    } else {
      toast.success('Opportunity deleted');
      setOpportunities((prev) => prev.filter((o) => o.id !== id));
    }
  };

  const handleStatusChange = async (id, newStatus, reason = '') => {
    const updates = {
      status: newStatus,
      closed_reason: newStatus === 'closed' ? reason || null : null,
    };

    const { error } = await supabase.from('volunteer_opportunities').update(updates).eq('id', id);

    if (error) {
      toast.error('Failed to update status');
      console.error(error);
    } else {
      toast.success(`Marked as ${newStatus}`);
      setOpportunities((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
      setShowReasonDropdown(null);
      setSelectedReason('');
      setCustomReason('');
      if (newStatus === 'active') navigate(`/edit-opportunity/${id}`);
    }
  };

  const renderWhenNeeded = (blocks) => {
    if (!Array.isArray(blocks) || blocks.length === 0) return null;

    return (
      <div className="muted mt-1 text-sm">
        <p className="font-semibold">Times needed</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          {blocks.map((block, idx) => {
            const { days, start_time, end_time, start_date, end_date } = block;
            return (
              <li key={idx}>
                {days?.length > 0 && start_time && end_time ? (
                  <>
                    {days.join(', ')} — {start_time} to {end_time}
                  </>
                ) : (
                  'Timing info incomplete'
                )}
                {start_date && end_date && isValid(new Date(start_date)) && isValid(new Date(end_date)) && (
                  <> ({format(parseISO(start_date), 'MMM d')} to {format(parseISO(end_date), 'MMM d')})</>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const renderSection = (title, filterStatus, { hideWhenEmpty = false } = {}) => {
    const filtered = opportunities.filter(
      (op) => op.status?.toLowerCase() === filterStatus.toLowerCase()
    );

    // Drafts and Closed disappear when empty rather than printing an empty
    // box each. Three stacked "no ... opportunities" panels made a page
    // with one real role look like a page with none.
    if (hideWhenEmpty && filtered.length === 0) return null;

    return (
      <div className="mb-10">
        <h2 className="list-head">{title}</h2>
        {filtered.length === 0 ? (
          <div className="empty">
            <p className="empty-desc">No {filterStatus.toLowerCase()} opportunities.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {filtered.map((op) => (
              <li key={op.id} className="card relative space-y-2">
                <h3 className="card-title pr-16">{op.title}</h3>

                {op.description && (
                  <p className="text-sm line-3" style={{ color: 'var(--color-text-secondary)' }}>
                    {op.description}
                  </p>
                )}

                {/* Tags, matching the public browse card. This was six
                    lines each led by a different emoji -- 📍📅📧👥🔒📌 --
                    which rendered differently on every platform and made a
                    list of roles read as a list of receipts. */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {op.requires_dbs && <span className="tag">DBS check</span>}
                  {op.generally_needed && <span className="tag-plain">Flexible timing</span>}
                  {op.location && op.location !== op.town && (
                    <span className="tag-plain">{op.location}</span>
                  )}
                  {isValid(new Date(op.date_needed)) &&
                    new Date(op.date_needed).getFullYear() > 1971 && (
                      <span className="tag-plain">
                        {format(new Date(op.date_needed), 'd MMM yyyy')}
                      </span>
                    )}
                  <span className="tag-plain">
                    {op.volunteers_needed ?? 1} needed
                  </span>
                </div>

                {!op.generally_needed && renderWhenNeeded(op.when_needed)}

                <p className="caption">{op.contact}</p>

                {op.status !== 'draft' && (
                  <p className="highlight">
                    {applicationsCount[op.id] || 0}{' '}
                    {applicationsCount[op.id] === 1 ? 'person interested' : 'people interested'}
                  </p>
                )}

                {/* Actions */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {op.status !== 'draft' && (applicationsCount[op.id] ?? 0) > 0 && (
                    <button
                      onClick={() => navigate(`/opportunity/${op.id}/applicants`)}
                      className="btn-primary btn-sm"
                    >
                      View interested volunteers
                    </button>
                  )}
                  {op.status == 'closed' && (
                    <button
                      onClick={() => handleStatusChange(op.id, 'active')}
                      className="btn-success-outline btn-sm"
                    >
                      Mark as Active
                    </button>
                  )}
                  {op.status == 'active' && (
                    <button
                      onClick={() => setShowReasonDropdown(op.id)}
                      className="btn btn-warning btn-sm"
                    >
                      Mark as Closed
                    </button>
                  )}

                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      aria-label="Edit"
                      onClick={() => navigate(`/edit-opportunity/${op.id}`)}
                      className="icon-btn hover:text-brand-ink"
                      title="Edit"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      aria-label="Delete"
                      onClick={() => handleDelete(op.id)}
                      className="icon-btn icon-btn-danger"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Close reason dropdown */}
                {showReasonDropdown === op.id && (
                  <div className="section space-y-2">
                    <label className="label">Why are you closing this post?</label>
                    <select
                      className="select"
                      value={selectedReason}
                      onChange={(e) => setSelectedReason(e.target.value)}
                    >
                      <option value="">Select a reason</option>
                      <option value="Position filled">Position filled</option>
                      <option value="Event finished">Event finished</option>
                      <option value="No longer needed">No longer needed</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                      <option value="Other">Other</option>
                    </select>

                    {selectedReason === 'Other' && (
                      <input
                        type="text"
                        className="input"
                        placeholder="Enter custom reason"
                        value={customReason}
                        onChange={(e) => setCustomReason(e.target.value)}
                      />
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        className="btn btn-warning"
                        onClick={() =>
                          handleStatusChange(
                            op.id,
                            'closed',
                            selectedReason === 'Other' ? customReason : selectedReason
                          )
                        }
                        disabled={
                          !selectedReason || (selectedReason === 'Other' && !customReason.trim())
                        }
                      >
                        Confirm Close
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          setShowReasonDropdown(null);
                          setSelectedReason('');
                          setCustomReason('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" id="main-content">
      <div className="page-head">
        {pending && <ApprovalNotice />}
        <h1 className="title">Your opportunities</h1>
        <p className="page-description">
          Post what you need and see who has registered interest. People who
          register appear on each post — you email the ones you want, and
          dismissing someone is never shown to them.
        </p>

        <div className="page-actions">
          <Link to="/post-opportunity" className="btn-primary">
            Post an opportunity
          </Link>
          <Link to="/organization/sent-enquiries" className="btn-secondary">
            Messages sent
          </Link>
        </div>
      </div>

      {loading ? (
        <ListSkeleton items={5} />
      ) : opportunities.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No opportunities yet</p>
          <p className="empty-desc">
            Post your first role and volunteers in Windsor will be able to
            find it and register their interest.
          </p>
          <div className="empty-cta">
            <Link to="/post-opportunity" className="btn-primary">
              Post an opportunity
            </Link>
          </div>
        </div>
      ) : (
        <>
          {renderSection('Live', 'Active')}
          {renderSection('Drafts', 'Draft', { hideWhenEmpty: true })}
          {renderSection('Closed', 'Closed', { hideWhenEmpty: true })}
        </>
      )}
    </div>
  );
}
