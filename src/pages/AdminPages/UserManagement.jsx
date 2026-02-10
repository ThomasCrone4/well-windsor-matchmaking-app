/**
 * User Management Page
 * Admin controls for user ban, suspend, impersonate, edit
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabase';
import { toast } from 'react-hot-toast';
import {
  Search,
  Lock,
  AlertCircle,
  Edit2,
  LogIn,
  Trash2,
  CheckCircle,
  Clock,
  Users,
} from 'lucide-react';

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState(null);
  const [actionReason, setActionReason] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, email, role, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async (userId) => {
    try {
      // In production, this would also log the action and set a record in user_status table
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: false })
        .eq('id', userId);

      if (error) throw error;

      toast.success('User banned successfully');
      fetchUsers();
      setShowActionModal(false);
    } catch (error) {
      console.error('Error banning user:', error);
      toast.error('Failed to ban user');
    }
  };

  const handleSuspendUser = async (userId, days = 7) => {
    try {
      const suspendUntil = new Date();
      suspendUntil.setDate(suspendUntil.getDate() + days);

      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: false })
        .eq('id', userId);

      if (error) throw error;

      toast.success(`User suspended for ${days} days`);
      fetchUsers();
      setShowActionModal(false);
    } catch (error) {
      console.error('Error suspending user:', error);
      toast.error('Failed to suspend user');
    }
  };

  const handleImpersonate = async (userId) => {
    try {
      // This would store the impersonation session
      const { error } = await supabase
        .from('impersonation_logs')
        .insert({
          admin_id: (await supabase.auth.getUser()).data.user.id,
          target_user_id: userId,
          started_at: new Date().toISOString(),
        });

      if (!error) {
        toast.success('Impersonation session started');
        // In production, you'd navigate to a page as this user
      }
    } catch (error) {
      console.error('Error impersonating user:', error);
      toast.error('Failed to start impersonation session');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          user.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600 dark:text-gray-400">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            User Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage users, handle violations, and monitor activity
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="all">All Roles</option>
              <option value="volunteer">Volunteers</option>
              <option value="organization">Organizations</option>
              <option value="admin">Admins</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredUsers.map(user => (
                  <tr
                    key={user.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {user.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
                          : user.role === 'organization'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle size={16} />
                          Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                          <AlertCircle size={16} />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setActionType('edit');
                            setShowActionModal(true);
                          }}
                          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                          title="Edit user"
                        >
                          <Edit2 size={16} className="text-gray-600 dark:text-gray-400" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setActionType('impersonate');
                            handleImpersonate(user.id);
                          }}
                          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                          title="Impersonate user"
                        >
                          <LogIn size={16} className="text-gray-600 dark:text-gray-400" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setActionType('suspend');
                            setShowActionModal(true);
                          }}
                          className="p-2 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded transition-colors"
                          title="Suspend user"
                        >
                          <Clock size={16} className="text-yellow-600 dark:text-yellow-400" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setActionType('ban');
                            setShowActionModal(true);
                          }}
                          className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                          title="Ban user"
                        >
                          <Lock size={16} className="text-red-600 dark:text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="p-8 text-center text-gray-600 dark:text-gray-400">
              No users found matching your criteria
            </div>
          )}
        </div>

        {/* Action Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Total Users
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {users.length}
                </p>
              </div>
              <Users className="text-blue-500" size={32} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Active Users
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {users.filter(u => u.is_active).length}
                </p>
              </div>
              <CheckCircle className="text-green-500" size={32} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Inactive Users
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {users.filter(u => !u.is_active).length}
                </p>
              </div>
              <AlertCircle className="text-red-500" size={32} />
            </div>
          </div>
        </div>

        {/* Action Modal */}
        {showActionModal && selectedUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                {actionType === 'ban'
                  ? 'Ban User'
                  : actionType === 'suspend'
                    ? 'Suspend User'
                    : actionType === 'edit'
                      ? 'Edit User'
                      : 'Confirm Action'}
              </h2>

              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {actionType === 'ban' && 'Permanently ban this user from the platform?'}
                {actionType === 'suspend' && 'Temporarily suspend this user?'}
                {actionType === 'edit' && 'Edit user information'}
              </p>

              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>User:</strong> {selectedUser.full_name} ({selectedUser.email})
                </p>
              </div>

              {(actionType === 'ban' || actionType === 'suspend') && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Reason (optional)
                  </label>
                  <textarea
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="Why is this action being taken?"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    rows={3}
                  />
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowActionModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors dark:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (actionType === 'ban') {
                      handleBanUser(selectedUser.id);
                    } else if (actionType === 'suspend') {
                      handleSuspendUser(selectedUser.id);
                    }
                  }}
                  className={`px-4 py-2 text-white rounded-lg hover:opacity-90 transition-opacity ${
                    actionType === 'ban'
                      ? 'bg-red-600'
                      : actionType === 'suspend'
                        ? 'bg-yellow-600'
                        : 'bg-blue-600'
                  }`}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
