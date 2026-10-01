import React, { useState, useEffect } from 'react';
import { StaffUser, fetchStaffUsers, createStaffUser, updateStaffUser, deleteStaffUser } from '../services/staffUserService';
import { UserRole } from '../types';
import {
  Users,
  ShieldCheck,
  UserPlus,
  Key,
  Lock,
  Mail,
  Trash2,
  Edit2,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Eye,
  EyeOff,
  Hammer,
  Truck,
  HelpCircle,
  UserCheck
} from 'lucide-react';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentUserEmail
}) => {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add User Form State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<UserRole>('production');
  const [addPassword, setAddPassword] = useState('');
  const [addConfirmPassword, setAddConfirmPassword] = useState('');
  const [addDepartment, setAddDepartment] = useState('Workshop');
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Reset Password State
  const [resetUser, setResetUser] = useState<StaffUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  // Edit User State
  const [editUser, setEditUser] = useState<StaffUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('production');
  const [editStatus, setEditStatus] = useState<'active' | 'disabled'>('active');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    const data = await fetchStaffUsers();
    setUsers(data);
    setIsLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addEmail.trim() || !addPassword) {
      showNotification('error', 'Please fill in all required fields.');
      return;
    }
    if (addPassword.length < 6) {
      showNotification('error', 'Password must be at least 6 characters long.');
      return;
    }
    if (addPassword !== addConfirmPassword) {
      showNotification('error', 'Passwords do not match.');
      return;
    }

    setIsSubmittingAdd(true);
    const res = await createStaffUser({
      name: addName.trim(),
      email: addEmail.trim().toLowerCase(),
      role: addRole,
      password: addPassword,
      department: addDepartment,
      status: 'active'
    });
    setIsSubmittingAdd(false);

    if (res.success && res.user) {
      showNotification('success', `Created user ${res.user.name} (${res.user.email}) successfully.`);
      setIsAddUserOpen(false);
      setAddName('');
      setAddEmail('');
      setAddPassword('');
      setAddConfirmPassword('');
      loadUsers();
    } else {
      showNotification('error', res.error || 'Failed to create user.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    if (newPassword.length < 6) {
      showNotification('error', 'New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showNotification('error', 'Passwords do not match.');
      return;
    }

    setIsSubmittingReset(true);
    const res = await updateStaffUser(resetUser.id, { password: newPassword });
    setIsSubmittingReset(false);

    if (res.success) {
      showNotification('success', `Password for ${resetUser.name} updated successfully.`);
      setResetUser(null);
      setNewPassword('');
      setConfirmNewPassword('');
    } else {
      showNotification('error', res.error || 'Failed to update password.');
    }
  };

  const handleUpdateUserDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;

    setIsSubmittingEdit(true);
    const res = await updateStaffUser(editUser.id, {
      name: editName.trim(),
      role: editRole,
      status: editStatus
    });
    setIsSubmittingEdit(false);

    if (res.success) {
      showNotification('success', `Updated ${editName} successfully.`);
      setEditUser(null);
      loadUsers();
    } else {
      showNotification('error', res.error || 'Failed to update user.');
    }
  };

  const handleDeleteUser = async (user: StaffUser) => {
    if (user.email === currentUserEmail) {
      showNotification('error', 'You cannot delete your own active administrator account.');
      return;
    }
    if (!confirm(`Are you sure you want to remove staff member "${user.name}" (${user.email})?`)) {
      return;
    }

    const res = await deleteStaffUser(user.id);
    if (res.success) {
      showNotification('success', `Removed ${user.name} from staff access.`);
      loadUsers();
    } else {
      showNotification('error', res.error || 'Failed to delete user.');
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-900 text-white shadow-2xs">
            <ShieldCheck className="w-3 h-3 text-amber-400" />
            <span>Admin</span>
          </span>
        );
      case 'crm':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
            <Users className="w-3 h-3 text-purple-600" />
            <span>CRM Desk</span>
          </span>
        );
      case 'production':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
            <Hammer className="w-3 h-3 text-amber-600" />
            <span>Production Workshop</span>
          </span>
        );
      case 'logistics':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-900 border border-teal-200">
            <Truck className="w-3 h-3 text-teal-600" />
            <span>Logistics Desk</span>
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-neutral-200/90 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-neutral-900 text-amber-400 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900">Team & Staff Access Management</h2>
              <p className="text-xs text-neutral-500">Configure password-protected staff accounts, roles, and permissions.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadUsers}
              disabled={isLoading}
              title="Refresh Roster"
              className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 border border-neutral-200/80 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className={`mx-6 mt-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
            feedback.type === 'success' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'
          }`}>
            {feedback.type === 'success' ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Action Bar */}
        <div className="px-4 sm:px-6 pt-4 pb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-neutral-500 font-mono">
            <span>Registered Staff Accounts:</span>{' '}
            <span className="font-bold text-neutral-900">{users.length}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsAddUserOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white transition shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-amber-400" />
            <span>Add New Staff Member</span>
          </button>
        </div>

        {/* Main Users Table / Mobile Cards */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-3">
          {/* Mobile Card Roster (shown on < sm screens) */}
          <div className="block sm:hidden space-y-3">
            {users.map((user) => (
              <div
                key={user.id}
                className="p-3.5 bg-neutral-50/80 border border-neutral-200/90 rounded-2xl space-y-2.5 shadow-2xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-neutral-900 text-sm truncate">{user.name}</div>
                    <div className="text-neutral-500 font-mono text-[11px] flex items-center gap-1 mt-0.5 truncate">
                      <Mail className="w-3 h-3 text-neutral-400 shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                    user.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-neutral-100 text-neutral-500'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                    <span className="capitalize">{user.status}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-600 pt-1.5 border-t border-neutral-200/60">
                  <div className="flex items-center gap-1.5">
                    {getRoleBadge(user.role)}
                  </div>
                  <span className="text-[11px] text-neutral-500 font-medium">
                    {user.department || 'General Operations'}
                  </span>
                </div>

                <div className="text-[10px] text-neutral-400 font-mono flex items-center justify-between pt-0.5">
                  <span>Last active:</span>
                  <span>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('en-GB') : 'Active Session'}</span>
                </div>

                {/* Touch-Friendly Action Buttons */}
                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-neutral-200/60">
                  <button
                    type="button"
                    onClick={() => {
                      setResetUser(user);
                      setNewPassword('');
                      setConfirmNewPassword('');
                    }}
                    title="Reset Password"
                    className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 transition cursor-pointer min-h-[42px] active:scale-95"
                  >
                    <Key className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Password</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditUser(user);
                      setEditName(user.name);
                      setEditRole(user.role);
                      setEditStatus(user.status);
                    }}
                    title="Edit Role & Details"
                    className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100/80 border border-blue-200/80 transition cursor-pointer min-h-[42px] active:scale-95"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(user)}
                    title="Remove User"
                    className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200/80 transition cursor-pointer min-h-[42px] active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop & Tablet Table View (shown on >= sm screens) */}
          <div className="hidden sm:block border border-neutral-200/80 rounded-2xl overflow-x-auto shadow-2xs">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Role / Scope</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white font-sans">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-neutral-50/70 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-neutral-900">{user.name}</div>
                      <div className="text-neutral-500 font-mono text-[11px] flex items-center gap-1">
                        <Mail className="w-3 h-3 text-neutral-400" />
                        <span>{user.email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="py-3 px-4 text-neutral-600">
                      {user.department || 'General Operations'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        user.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-neutral-100 text-neutral-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                        <span className="capitalize">{user.status}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-neutral-500 text-[11px] whitespace-nowrap font-mono">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('en-GB') : 'Active Session'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setResetUser(user);
                            setNewPassword('');
                            setConfirmNewPassword('');
                          }}
                          title="Reset Password"
                          className="p-1.5 rounded-lg text-neutral-500 hover:text-amber-700 hover:bg-amber-50 border border-neutral-200 transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditUser(user);
                            setEditName(user.name);
                            setEditRole(user.role);
                            setEditStatus(user.status);
                          }}
                          title="Edit Role & Details"
                          className="p-1.5 rounded-lg text-neutral-500 hover:text-blue-700 hover:bg-blue-50 border border-neutral-200 transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user)}
                          title="Remove User"
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-700 hover:bg-rose-50 border border-neutral-200 transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer info banner */}
        <div className="px-6 py-3 border-t border-neutral-100 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between text-[11px] text-neutral-500 gap-2">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-neutral-400" />
            <span>Passwords are cryptographically salted and securely hashed.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-medium text-neutral-700 hover:bg-neutral-200/70 transition cursor-pointer"
          >
            Close Panel
          </button>
        </div>
      </div>

      {/* MODAL 1: Add New Staff Member */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-neutral-950/60 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-neutral-200 p-5 sm:p-6 animate-in zoom-in-95 max-h-[92vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-neutral-900 text-sm">Add New Staff Operator</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddUserOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded-lg hover:bg-neutral-100 min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Master Artisan Rohit"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl focus:outline-hidden focus:border-neutral-900"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="e.g. rohit.workshop@blkbrdshoemaker.com"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl focus:outline-hidden focus:border-neutral-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Operational Role *</label>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-xl focus:outline-hidden focus:border-neutral-900 bg-white"
                  >
                    <option value="production">Production Workshop</option>
                    <option value="logistics">Logistics Desk</option>
                    <option value="crm">CRM Customer Desk</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Department</label>
                  <input
                    type="text"
                    value={addDepartment}
                    onChange={(e) => setAddDepartment(e.target.value)}
                    placeholder="e.g. Bottoming Section"
                    className="w-full px-3 py-2 border border-neutral-200 rounded-xl focus:outline-hidden focus:border-neutral-900"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-neutral-700 font-semibold">Access Password *</label>
                  <button
                    type="button"
                    onClick={() => setShowAddPassword(!showAddPassword)}
                    className="text-[11px] text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
                  >
                    {showAddPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showAddPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <input
                  type={showAddPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl focus:outline-hidden focus:border-neutral-900"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Confirm Password *</label>
                <input
                  type={showAddPassword ? 'text' : 'password'}
                  required
                  value={addConfirmPassword}
                  onChange={(e) => setAddConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl focus:outline-hidden focus:border-neutral-900"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="px-4 py-2 rounded-xl text-neutral-600 hover:bg-neutral-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd}
                  className="px-5 py-2 rounded-xl bg-neutral-900 text-white font-semibold hover:bg-neutral-800 disabled:opacity-50"
                >
                  {isSubmittingAdd ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Reset Password Dialog */}
      {resetUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-neutral-950/60 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-neutral-200 p-5 sm:p-6 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-neutral-900 text-sm">Reset Password for {resetUser.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setResetUser(null)}
                className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-500 mb-4">
              Enter a new secure password for <span className="font-mono text-neutral-800 font-semibold">{resetUser.email}</span>.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-neutral-700 font-semibold">New Password *</label>
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="text-[11px] text-neutral-500 flex items-center gap-1"
                  >
                    {showResetPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showResetPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl focus:outline-hidden focus:border-neutral-900"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Confirm New Password *</label>
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl focus:outline-hidden focus:border-neutral-900"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setResetUser(null)}
                  className="px-4 py-2 rounded-xl text-neutral-600 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReset}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-50"
                >
                  {isSubmittingReset ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Edit User Role & Details */}
      {editUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-neutral-950/60 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-neutral-200 p-5 sm:p-6 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-neutral-900 text-sm">Edit Staff Member</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUserDetails} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Staff Member Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl focus:outline-hidden focus:border-neutral-900"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Email Address</label>
                <input
                  type="text"
                  disabled
                  value={editUser.email}
                  className="w-full px-3 py-2 bg-neutral-100 text-neutral-500 border border-neutral-200 rounded-xl cursor-not-allowed font-mono"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Operational Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl focus:outline-hidden focus:border-neutral-900 bg-white"
                >
                  <option value="production">Production Workshop</option>
                  <option value="logistics">Logistics Desk</option>
                  <option value="crm">CRM Customer Desk</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Account Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'active' | 'disabled')}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl focus:outline-hidden focus:border-neutral-900 bg-white"
                >
                  <option value="active">Active (Access Allowed)</option>
                  <option value="disabled">Disabled (Access Revoked)</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="px-4 py-2 rounded-xl text-neutral-600 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-5 py-2 rounded-xl bg-neutral-900 text-white font-semibold hover:bg-neutral-800 disabled:opacity-50"
                >
                  {isSubmittingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
