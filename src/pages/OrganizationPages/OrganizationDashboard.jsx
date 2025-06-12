import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { toast } from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

export default function OrganizationDashboard() {
  const [opportunities, setOpportunities] = useState([]);
  const [orgId, setOrgId] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrgIdAndOpportunities = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user?.id) {
        toast.error('Could not get user ID');
        return;
      }

      const uid = userData.user.id;
      setOrgId(uid);

      const { data, error } = await supabase
        .from('volunteer_opportunities')
        .select('*')
        .eq('org_id', uid)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load opportunities');
        console.error(error);
      } else {
        setOpportunities(data);
      }

      setLoading(false);
    };

    fetchOrgIdAndOpportunities();
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

  const handleStatusChange = async (id, newStatus) => {
    const { error } = await supabase
      .from('volunteer_opportunities')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update status');
      console.error(error);
    } else {
      toast.success(`Marked as ${newStatus}`);
      setOpportunities(prev =>
        prev.map(o => (o.id === id ? { ...o, status: newStatus } : o))
      );
    }
  };

  const renderWhenNeeded = (blocks) => {
    if (!Array.isArray(blocks) || blocks.length === 0) return null;

    return (
      <div className="text-sm text-gray-600 mt-1">
        <p>📆 <strong>Specific Times Needed:</strong></p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          {blocks.map((block, idx) => {
            const {
              days,
              start_time,
              end_time,
              start_date,
              end_date,
            } = block;

            return (
              <li key={idx}>
                {days?.length > 0 && start_time && end_time ? (
                  <>
                    {days.join(', ')} — {start_time} to {end_time}
                  </>
                ) : (
                  'Timing info incomplete'
                )}
                {start_date && end_date && (
                  <>
                    {' '}
                    (
                    {format(parseISO(start_date), 'MMM d')} to{' '}
                    {format(parseISO(end_date), 'MMM d')}
                    )
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const renderSection = (title, filterStatus) => {
    const filtered = opportunities.filter(op => op.status === filterStatus);

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
                <p className="text-sm text-gray-600">📅 {format(new Date(op.date_needed), 'PPP')}</p>
                <p className="text-sm text-gray-600">📧 {op.contact}</p>

                {op.requires_dbs && (
                  <p className="text-sm text-red-600">🔒 DBS Required</p>
                )}

                {op.generally_needed ? (
                  <p className="text-sm text-gray-600">📌 Available anytime</p>
                ) : (
                  renderWhenNeeded(op.when_needed)
                )}

                <div className="flex gap-6 mt-2 flex-wrap">
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
                      onClick={() => handleStatusChange(op.id, 'closed')}
                      className="text-yellow-600 hover:underline"
                    >
                      Mark as Closed
                    </button>
                  )}
                  {op.status !== 'draft' && (
                    <button
                      onClick={() => handleStatusChange(op.id, 'draft')}
                      className="text-gray-600 hover:underline"
                    >
                      Mark as Draft
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
        <Link to="/post-opportunity">
          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            + New Post
          </button>
        </Link>
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
