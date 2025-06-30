// OrganizationDashboard.jsx
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { toast } from 'react-hot-toast';
import { format, parseISO, isValid } from 'date-fns';

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
        const ids = ops.map(op => op.id);

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

    const { error } = await supabase
      .from('volunteer_opportunities')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete opportunity');
      console.error(error);
    } else {
      toast.success('Opportunity deleted');
      setOpportunities(prev => prev.filter(o => o.id !== id));
    }
  };

  const handleStatusChange = async (id, newStatus, reason = '') => {
    const updates = {
      status: newStatus,
      closed_reason: newStatus === 'closed' ? (reason || null) : null
    };

    const { error } = await supabase
      .from('volunteer_opportunities')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast.error('Failed to update status');
      console.error(error);
    } else {
      toast.success(`Marked as ${newStatus}`);
      setOpportunities(prev =>
        prev.map(o => (o.id === id ? { ...o, ...updates } : o))
      );
      setShowReasonDropdown(null);
      setSelectedReason('');
      setCustomReason('');
      if (newStatus === 'active') {
        navigate(`/edit-opportunity/${id}`);
      }
    }
  };

  const renderWhenNeeded = (blocks) => {
    if (!Array.isArray(blocks) || blocks.length === 0) return null;

    return (
      <div className="text-sm text-gray-600 mt-1">
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
      op => op.status?.toLowerCase() === filterStatus.toLowerCase()
    );

    return (
      <div className="mb-10">
        <h2 className="text-xl font-bold mb-2">{title}</h2>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No {filterStatus} opportunities</p>
        ) : (
          <ul className="space-y-4">
            {filtered.map(op => (
              <li key={op.id} className="bg-white border rounded p-4 shadow-sm space-y-1">
                <h3 className="text-lg font-semibold">{op.title}</h3>
                {op.description && <p>{op.description}</p>}
                <p className="text-sm text-gray-600">📍 {op.location}</p>
                {isValid(new Date(op.date_needed)) && new Date(op.date_needed).getFullYear() > 1971 && (
                  <p className="text-sm text-gray-600">📅 {format(new Date(op.date_needed), 'PPP')}</p>
                )}
                <p className="text-sm text-gray-600">📧 {op.contact}</p>
                <p className="text-sm text-gray-600">👥 Volunteers Needed: {op.volunteers_needed ?? 'Not specified'}</p>
                {op.requires_dbs && <p className="text-sm text-red-600">🔒 DBS Required</p>}
                {op.generally_needed ? (
                  <p className="text-sm text-gray-600">📌 Available anytime</p>
                ) : (
                  renderWhenNeeded(op.when_needed)
                )}
                {op.status !== 'draft' && (
                  <p className="text-sm text-blue-600">
                    📨 {applicationsCount[op.id] || 0} applicants
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-4">
                  <button
                    onClick={() => navigate(`/opportunity/${op.id}/applicants`)}
                    className="text-blue-600 hover:underline"
                  >
                    View Applicants
                  </button>
                  <button
                    onClick={() => navigate(`/opportunity/${op.id}/logged-hours`)}
                    className="text-purple-600 hover:underline"
                  >
                    Logged Hours
                  </button>
                  {op.status !== 'active' && (
                    <button
                      onClick={() => handleStatusChange(op.id, 'active')}
                      className="text-green-600 hover:underline"
                    >
                      Mark as Active
                    </button>
                  )}
                  {op.status !== 'closed' && (
                    <button
                      onClick={() => setShowReasonDropdown(op.id)}
                      className="text-yellow-600 hover:underline"
                    >
                      Mark as Closed
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/edit-opportunity/${op.id}`)}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(op.id, op.date_needed)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>

                {showReasonDropdown === op.id && (
                  <div className="mt-2 p-3 border rounded bg-gray-50 space-y-2">
                    <label className="block text-sm font-medium">Why are you closing this post?</label>
                    <select
                      className="w-full border rounded p-2"
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
                        className="w-full border rounded p-2"
                        placeholder="Enter custom reason"
                        value={customReason}
                        onChange={(e) => setCustomReason(e.target.value)}
                      />
                    )}

                    <div className="flex gap-4 pt-1">
                      <button
                        className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
                        onClick={() =>
                          handleStatusChange(op.id, 'closed', selectedReason === 'Other' ? customReason : selectedReason)
                        }
                        disabled={!selectedReason || (selectedReason === 'Other' && !customReason.trim())}
                      >
                        Confirm Close
                      </button>
                      <button
                        className="text-gray-600 hover:underline"
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Organization Dashboard</h1>
        <div className="flex gap-4">
          <Link to="/organization/sent-enquiries">
            <button className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700">
              Sent Enquiries
            </button>
          </Link>
          <Link to="/post-opportunity">
            <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              + New Post
            </button>
          </Link>
        </div>
      </div>

      {loading ? (
        <p>Loading your posts...</p>
      ) : opportunities.length === 0 ? (
        <p className="text-gray-600">You haven’t posted any opportunities yet.</p>
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
