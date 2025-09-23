// OrganizationDashboard.jsx
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { toast } from 'react-hot-toast';
import { format, parseISO, isValid } from 'date-fns';

import { Edit2, Trash2 } from 'lucide-react';


export default function OrganizationDashboard() {
  const [opportunities, setOpportunities] = useState([]);
  const [applicationsCount, setApplicationsCount] = useState({});
  const [orgId, setOrgId] = useState(null);
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

  const handleDelete = async (id, date_needed) => {
    const hasPassed = new Date(date_needed) < new Date();

    const confirmMsg = hasPassed
      ? '⚠️ This opportunity is in the past. If you plan to offer it again, consider editing the date instead. Are you sure you want to delete it permanently?'
      : 'Are you sure you want to delete this opportunity? This will also remove all associated applications.';

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
      <div className="muted mt-1">
        <p>📆 <strong>Specific Times Needed:</strong></p>
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

  const renderSection = (title, filterStatus) => {
    const filtered = opportunities.filter(
      (op) => op.status?.toLowerCase() === filterStatus.toLowerCase()
    );

    return (
      <div className="mb-10">
        <h2 className="section-title mb-2 text-left">{title}</h2>
        {filtered.length === 0 ? (
          <p className="muted italic">No {filterStatus.toLowerCase()} opportunities</p>
        ) : (
          <ul className="space-y-4">
            {filtered.map((op) => (
              <li key={op.id} className="card relative space-y-1">
                <h3 className="card-title">{op.title}</h3>

                {op.description && <p className="text">{op.description}</p>}

                <p className="muted">📍 {op.location}</p>

                {isValid(new Date(op.date_needed)) &&
                  new Date(op.date_needed).getFullYear() > 1971 && (
                    <p className="muted">📅 {format(new Date(op.date_needed), 'PPP')}</p>
                  )}

                <p className="muted">📧 {op.contact}</p>
                <p className="muted">👥 Volunteers Needed: {op.volunteers_needed ?? 'Not specified'}</p>

                {op.requires_dbs && <p className="text-sm text-red-600">🔒 DBS Required</p>}

                {op.generally_needed ? (
                  <p className="muted">📌 Available anytime</p>
                ) : (
                  renderWhenNeeded(op.when_needed)
                )}

                {op.status !== 'draft' && (
                  <p className="highlight text-brand-teal">📨 {applicationsCount[op.id] || 0} applicants</p>
                )}

                {/* Actions */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {op.status !== 'draft' && (applicationsCount[op.id] ?? 0) > 0 && (
                    <button
                      onClick={() => navigate(`/opportunity/${op.id}/applicants`)}
                      className="btn-success btn-sm"
                    >
                      View Applicants
                    </button>
                  )}
                  {/* <button
                    onClick={() => navigate(`/opportunity/${op.id}/logged-hours`)}
                    className="btn-ghost btn-sm"
                  >
                    Logged Hours
                  </button> */}
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
                      className="icon-btn hover:text-brand-teal"
                      title="Edit"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      aria-label="Delete"
                      onClick={() => handleDelete(op.id, op.date_needed)}
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="page-header">
        <h1 className="title">Organisation Dashboard</h1>
        <div className="flex gap-2">
          <Link to="/organization/sent-enquiries" className="btn btn-success">
            Sent Enquiries
          </Link>
          <Link to="/post-opportunity" className="btn btn-primary">
            + New Post
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading your posts...</p>
      ) : opportunities.length === 0 ? (
        <p className="muted">You haven’t posted any opportunities yet.</p>
      ) : (
        <>
          {renderSection('Active Opportunities', 'Active')}
          {renderSection('Closed Opportunities', 'Closed')}
          {renderSection('Drafts', 'Draft')}
        </>
      )}
    </div>
  );
}
