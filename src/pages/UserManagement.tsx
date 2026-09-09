import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, UserPlus, Mail, Shield, Trash2, Edit2, X, AlertCircle, Plus, Send, Key } from 'lucide-react';
import { toast } from 'sonner';
import { firestoreService } from '../services/firestoreService';
import { User, Department, UserRole, RoleDefinition } from '../types';
import { cn, formatDateTime } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [availableRoles, setAvailableRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmUid, setDeleteConfirmUid] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    displayName: '',
    employeeId: '',
    email: '',
    password: '',
    roles: ['employee'] as UserRole[],
    departmentId: '',
    designation: '',
    status: 'active' as User['status']
  });
  const [newDept, setNewDept] = useState({
    name: '',
    description: ''
  });

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [isVerifyingDelete, setIsVerifyingDelete] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [resetPasswordMode, setResetPasswordMode] = useState<'auto' | 'manual'>('auto');
  const [manualPassword, setManualPassword] = useState('');

  const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const initiateDeleteUser = async (uid: string) => {
    const code = generateVerificationCode();
    setVerificationCode(code);
    setIsVerifyingDelete(true);
    setDeleteConfirmUid(uid);
    setEnteredCode('');
    
    const toastId = toast.loading('Sending verification code to super admin...');
    
    try {
      // Find the super admin email dynamically
      // Prefer the current user if they are a super admin, otherwise find the first active super admin
      const isCurrentSuperAdmin = currentUser?.roles?.includes('super_admin') || currentUser?.role === 'super_admin';
      
      let superAdminEmail = '';
      if (isCurrentSuperAdmin && currentUser?.email) {
        superAdminEmail = currentUser.email;
      } else {
        const superAdmin = users.find(u => 
          (u.roles?.includes('super_admin') || u.role === 'super_admin') && 
          u.status === 'active'
        );
        superAdminEmail = superAdmin?.email || 'ganesh123eee@gmail.com';
      }
      
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: superAdminEmail,
          subject: 'AssessPro - User Deletion Verification Code',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #2563eb;">User Deletion Verification</h2>
              <p>A user deletion has been initiated for a user in the AssessPro portal.</p>
              <p>Please use the following verification code to authorize this action:</p>
              <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 1px solid #e2e8f0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0f172a;">${code}</span>
              </div>
              <p style="font-size: 14px; color: #64748b;">If you did not initiate this action, please ignore this email.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 12px; color: #94a3b8; text-align: center;">AssessPro Security System</p>
            </div>
          `
        }),
      });
      
      const result = await response.json();
      if (result.status === 'ok') {
        toast.success(`Verification code sent to super admin (${superAdminEmail}).`, { id: toastId });
      } else {
        toast.error(result.message || 'Failed to send verification code.', { id: toastId });
      }
    } catch (err) {
      console.error('Error sending verification code:', err);
      toast.error('Failed to send verification code.', { id: toastId });
    }
  };

  const loadData = async () => {
    setLoading(true);
    // Log viewing activity
    await firestoreService.logActivity('Viewed User Management', 'User Management', {}, currentUser?.uid, currentUser?.email);

    try {
      const [u, d, r] = await Promise.all([
        firestoreService.getCollection<User>('users'),
        firestoreService.getCollection<Department>('departments'),
        firestoreService.getCollection<RoleDefinition>('roles')
      ]);
      setUsers(u);
      setDepartments(d);
      setAvailableRoles(r);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !newUser.displayName) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const userData = {
        ...newUser,
        employeeId: newUser.employeeId?.trim() || '',
        // Migration: ensure roles is set if only role was present
        roles: newUser.roles || (newUser.role ? [newUser.role] : ['employee'])
      };

      if (editingUser) {
        await firestoreService.updateDocument('users', editingUser.uid, userData);
        await firestoreService.logActivity('Updated User', 'User Management', { 
          userId: editingUser.uid, 
          userName: newUser.displayName,
          roles: userData.roles 
        }, currentUser?.uid, currentUser?.email);
      } else {
        // Create user in Firestore
        await firestoreService.createDocument('users', {
          ...userData,
          uid: newUser.email, // Use email as ID for Firestore-only auth
        }, newUser.email);
        
        await firestoreService.logActivity('Created User', 'User Management', { 
          userName: newUser.displayName,
          email: newUser.email,
          roles: userData.roles 
        }, currentUser?.uid, currentUser?.email);

        // Send welcome email with credentials
        try {
          const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: newUser.email,
              subject: 'Welcome to AssessPro - Your Account Credentials',
              html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
                  <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #2563eb; margin: 0; font-size: 28px; letter-spacing: -0.025em;">AssessPro</h1>
                    <p style="color: #64748b; margin-top: 5px;">Enterprise Assessment Portal</p>
                  </div>
                  
                  <h2 style="font-size: 20px; margin-bottom: 16px;">Welcome, ${newUser.displayName}!</h2>
                  <p style="line-height: 1.6; margin-bottom: 24px;">An account has been created for you on the AssessPro portal. You can now log in to access your assigned assessments and track your progress.</p>
                  
                  <div style="background-color: #f8fafc; padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #e2e8f0;">
                    <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 16px;">Your Login Credentials</h3>
                    <div style="margin-bottom: 12px;">
                      <span style="color: #64748b; font-size: 13px;">Username / Email:</span><br/>
                      <strong style="font-size: 16px; color: #0f172a;">${newUser.email}</strong>
                    </div>
                    ${newUser.employeeId ? `
                    <div style="margin-bottom: 12px;">
                      <span style="color: #64748b; font-size: 13px;">Employee ID:</span><br/>
                      <strong style="font-size: 16px; color: #0f172a;">${newUser.employeeId}</strong>
                    </div>
                    ` : ''}
                    <div>
                      <span style="color: #64748b; font-size: 13px;">Password:</span><br/>
                      <strong style="font-size: 16px; color: #0f172a; font-family: monospace;">${newUser.password}</strong>
                    </div>
                  </div>
                  
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${window.location.origin}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">Login to Portal</a>
                  </div>
                  
                  <p style="font-size: 14px; color: #64748b; line-height: 1.6;">For security reasons, we recommend that you do not share these credentials with anyone.</p>
                  
                  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
                  <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">&copy; ${new Date().getFullYear()} AssessPro. All rights reserved.</p>
                </div>
              `
            }),
          });
          
          const result = await response.json();
          if (result.status === 'warning') {
            toast.warning(result.message);
          } else {
            toast.success(`Welcome email sent to ${newUser.email}`);
          }
        } catch (emailErr) {
          console.error('Failed to send welcome email:', emailErr);
          toast.warning('User created, but welcome email failed to send.');
        }
      }
      
      setIsModalOpen(false);
      setEditingUser(null);
      setNewUser({
        email: '',
        displayName: '',
        employeeId: '',
        password: '',
        roles: ['employee'],
        departmentId: '',
        designation: '',
        status: 'active'
      });
      loadData();
    } catch (err: any) {
      console.error('Error saving user:', err);
      setError(err.message || 'Failed to save user. Please check your permissions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (enteredCode !== verificationCode) {
      toast.error('Invalid verification code. Please check the code sent to the super admin.');
      return;
    }

    setIsSubmitting(true);
    try {
      await firestoreService.deleteDocument('users', uid);
      await firestoreService.logActivity('Deleted User', 'User Management', { userId: uid }, currentUser?.uid, currentUser?.email);
      setDeleteConfirmUid(null);
      setIsVerifyingDelete(false);
      setVerificationCode(null);
      setEnteredCode('');
      loadData();
      toast.success('User deleted successfully.');
    } catch (err) {
      console.error('Error deleting user:', err);
      toast.error('Failed to delete user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDept.name) return;
    setIsSubmitting(true);
    try {
      await firestoreService.createDocument('departments', newDept);
      await firestoreService.logActivity('Created Department', 'User Management', { departmentName: newDept.name }, currentUser?.uid, currentUser?.email);
      setIsDeptModalOpen(false);
      setNewDept({ name: '', description: '' });
      loadData();
    } catch (err) {
      console.error('Error adding department:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendTestEmail = async (email: string) => {
    if (!email) {
      toast.error('This user does not have an email address.');
      return;
    }
    
    const toastId = toast.loading(`Sending test email to ${email}...`);
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: email,
          subject: 'AssessPro SMTP Test',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <h1 style="color: #2563eb;">SMTP Configuration Success!</h1>
              <p>This is a test email from your AssessPro instance.</p>
              <p>If you are seeing this, your SMTP settings are correctly configured in the Secrets panel.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 12px; color: #64748b;">Sent at: ${formatDateTime(new Date())}</p>
            </div>
          `
        }),
      });
      
      const result = await response.json();
      if (result.status === 'ok') {
        toast.success('Test email sent successfully!', { id: toastId });
        await firestoreService.logActivity('Sent Test Email', 'User Management', { recipient: email }, currentUser?.uid, currentUser?.email);
      } else if (result.status === 'warning') {
        toast.warning(result.message, { id: toastId, duration: 6000 });
      } else {
        toast.error(result.error || 'Failed to send test email', { 
          id: toastId,
          description: result.details,
          duration: 8000
        });
      }
    } catch (error) {
      console.error('Test email error:', error);
      toast.error('Network error while sending test email', { id: toastId });
    }
  };

  const handleResetPassword = async (user: User, customPassword?: string) => {
    if (!user.email) {
      toast.error('This user does not have an email address.');
      return;
    }

    const newPassword = customPassword || Math.random().toString(36).slice(-8);
    const toastId = toast.loading(`Resetting password for ${user.displayName}...`);

    try {
      // Update password in Firestore
      await firestoreService.updateDocument('users', user.uid, { password: newPassword });
      
      // Log activity
      await firestoreService.logActivity('Reset Password', 'User Management', { 
        userId: user.uid, 
        userName: user.displayName,
        mode: customPassword ? 'manual' : 'auto'
      }, currentUser?.uid, currentUser?.email);

      // Send email with new password
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: user.email,
          subject: 'AssessPro - Your Password has been Updated',
          html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2563eb; margin: 0; font-size: 28px; letter-spacing: -0.025em;">AssessPro</h1>
                <p style="color: #64748b; margin-top: 5px;">Enterprise Assessment Portal</p>
              </div>
              
              <h2 style="font-size: 20px; margin-bottom: 16px;">Password Updated Successfully</h2>
              <p style="line-height: 1.6; margin-bottom: 24px;">Hello ${user.displayName}, your password for the AssessPro portal has been updated by an administrator.</p>
              
              <div style="background-color: #f8fafc; padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #e2e8f0;">
                <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 16px;">Login Credentials</h3>
                <div style="margin-bottom: 12px;">
                  <span style="color: #64748b; font-size: 13px;">Username / Email:</span><br/>
                  <strong style="font-size: 16px; color: #0f172a;">${user.email}</strong>
                </div>
                <div>
                  <span style="color: #64748b; font-size: 13px;">New Password:</span><br/>
                  <strong style="font-size: 16px; color: #0f172a; font-family: monospace;">${newPassword}</strong>
                </div>
              </div>
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="${window.location.origin}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">Login to Portal</a>
              </div>
              
              <p style="font-size: 14px; color: #64748b; line-height: 1.6;">We recommend changing this password after your first login for better security.</p>
              
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">&copy; ${new Date().getFullYear()} AssessPro. All rights reserved.</p>
            </div>
          `
        }),
      });

      const result = await response.json();
      if (result.status === 'ok') {
        toast.success(`Password reset successfully. New password sent to ${user.email}`, { id: toastId });
        setResetPasswordUser(null);
        setManualPassword('');
        loadData();
      } else {
        toast.warning(`Password updated in system, but email failed to send: ${result.error || 'Unknown error'}`, { id: toastId, duration: 6000 });
        setResetPasswordUser(null);
        setManualPassword('');
        loadData();
      }
    } catch (err: any) {
      console.error('Error resetting password:', err);
      toast.error('Failed to reset password. Please try again.', { id: toastId });
    }
  };

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.employeeId && u.employeeId.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-1">Manage employee roles, departments, and access levels.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsDeptModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg font-medium hover:bg-accent transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Department</span>
          </button>
          <button 
            onClick={() => {
              setEditingUser(null);
              setNewUser({
                email: '',
                displayName: '',
                role: 'employee',
                departmentId: '',
                designation: '',
                status: 'active'
              });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">{editingUser ? 'Edit User' : 'Add New User'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-accent rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-rose-100 text-rose-700 text-sm rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name <span className="text-destructive">*</span></label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                    value={newUser.displayName}
                    onChange={(e) => setNewUser({...newUser, displayName: e.target.value})}
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Employee ID</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 font-mono text-sm"
                    value={newUser.employeeId}
                    onChange={(e) => setNewUser({...newUser, employeeId: e.target.value})}
                    placeholder="e.g. EMP-001 or SYM-102"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email Address</label>
                <input 
                  type="email" 
                  required
                  className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  placeholder="e.g. john@company.com"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Login Password</label>
                  <button 
                    type="button"
                    onClick={() => {
                      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
                      let pass = '';
                      for (let i = 0; i < 10; i++) {
                        pass += chars.charAt(Math.floor(Math.random() * chars.length));
                      }
                      setNewUser({...newUser, password: pass});
                    }}
                    className="text-[10px] font-bold text-primary hover:underline"
                  >
                    Generate Random
                  </button>
                </div>
                <input 
                  type="text" 
                  required={!editingUser}
                  className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                  value={newUser.password || ''}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  placeholder="Set a password for the user"
                />
                <p className="text-[10px] text-muted-foreground">
                  This password will be sent to the user via email.
                </p>
              </div>
              <div className="space-y-3">
                <label className="text-sm font-medium">Roles</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(newUser.roles || []).map(roleId => {
                    const roleLabel = availableRoles.find(r => r.id === roleId)?.name || roleId;
                    return (
                      <div key={roleId} className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-md text-xs font-medium border border-primary/20">
                        <span>{roleLabel}</span>
                        <button 
                          type="button"
                          onClick={() => setNewUser({ ...newUser, roles: (newUser.roles || []).filter(r => r !== roleId) })}
                          className="hover:text-destructive transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <select 
                  className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  value=""
                  onChange={(e) => {
                    const roleId = e.target.value as UserRole;
                    if (roleId && !newUser.roles?.includes(roleId)) {
                      setNewUser({ ...newUser, roles: [...(newUser.roles || []), roleId] });
                    }
                  }}
                >
                  <option value="">Add a role...</option>
                  {availableRoles.filter(r => !newUser.roles?.includes(r.id as UserRole)).map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Department</label>
                  <select 
                    className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                    value={newUser.departmentId}
                    onChange={(e) => setNewUser({...newUser, departmentId: e.target.value})}
                  >
                    <option value="">Select Department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Designation</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  value={newUser.designation}
                  onChange={(e) => setNewUser({...newUser, designation: e.target.value})}
                  placeholder="e.g. Senior Software Engineer"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 border rounded-lg font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingUser ? 'Update Profile' : 'Create Profile'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Department Modal */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Add Department</h2>
              <button onClick={() => setIsDeptModalOpen(false)} className="p-2 hover:bg-accent rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddDept} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Department Name</label>
                <input 
                  type="text" 
                  required
                  className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  value={newDept.name}
                  onChange={(e) => setNewDept({...newDept, name: e.target.value})}
                  placeholder="e.g. Engineering"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <textarea 
                  className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px]"
                  value={newDept.description}
                  onChange={(e) => setNewDept({...newDept, description: e.target.value})}
                  placeholder="Brief description of the department..."
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="flex-1 py-2 border rounded-lg font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Create Department</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Search by name, email or employee ID..."
              className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="p-2 border rounded-lg hover:bg-accent transition-colors">
            <Filter className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">S.No</th>
                <th className="px-6 py-4 font-semibold">Employee</th>
                <th className="px-6 py-4 font-semibold">Role</th>
                <th className="px-6 py-4 font-semibold">Department</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredUsers.map((user, index) => (
                <tr key={user.uid} className="hover:bg-accent/50 transition-colors group">
                  <td className="px-6 py-4 text-sm font-medium text-center">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
                        {user.displayName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold">{user.displayName}</p>
                          {user.employeeId && (
                            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold border border-primary/20">
                              {user.employeeId}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(user.roles || (user.role ? [user.role] : [])).map((roleId) => {
                        const roleDef = availableRoles.find(r => r.id === roleId);
                        return (
                          <div key={roleId} className="flex items-center gap-1 bg-accent/50 px-2 py-0.5 rounded-md border">
                            <Shield className={cn(
                              "w-3 h-3",
                              roleId === 'super_admin' ? "text-rose-500" : 
                              roleId === 'hr_admin' ? "text-blue-500" : 
                              roleId === 'quality_management' ? "text-emerald-500" : "text-slate-400"
                            )} />
                            <span className="text-[10px] font-medium">{roleDef?.name || roleId.replace('_', ' ')}</span>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {departments.find(d => d.id === user.departmentId)?.name || 'Unassigned'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      user.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                    )}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleSendTestEmail(user.email)}
                        className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-blue-500 transition-colors"
                        title="Send Test Email"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setResetPasswordUser(user);
                          setResetPasswordMode('auto');
                          setManualPassword('');
                        }}
                        className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-amber-500 transition-colors"
                        title="Reset Password"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setEditingUser(user);
                          setNewUser({
                            email: user.email,
                            displayName: user.displayName,
                            employeeId: user.employeeId || '',
                            password: user.password || '',
                            roles: user.roles || (user.role ? [user.role] : ['employee']),
                            departmentId: user.departmentId || '',
                            designation: user.designation || '',
                            status: user.status
                          });
                          setIsModalOpen(true);
                        }}
                        className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-primary transition-colors"
                        title="Edit User"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => initiateDeleteUser(user.uid)}
                        className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete User Confirmation Modal */}
      {deleteConfirmUid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-8 h-8 text-destructive" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Delete User</h2>
                <p className="text-muted-foreground mt-1">
                  {isVerifyingDelete 
                    ? "A verification code has been sent to the super admin email. Please enter it below to authorize this deletion."
                    : "Are you sure you want to delete this user? This action cannot be undone."}
                </p>
              </div>

              {isVerifyingDelete && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-left block">Verification Code</label>
                  <input
                    type="text"
                    value={enteredCode}
                    onChange={(e) => setEnteredCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    className="w-full px-4 py-2 border rounded-lg text-center text-2xl font-mono tracking-[0.5em] focus:ring-2 focus:ring-primary outline-none"
                    maxLength={6}
                  />
                  <button 
                    onClick={() => initiateDeleteUser(deleteConfirmUid)}
                    className="text-xs text-primary hover:underline"
                  >
                    Resend Code
                  </button>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => {
                    setDeleteConfirmUid(null);
                    setIsVerifyingDelete(false);
                    setVerificationCode(null);
                    setEnteredCode('');
                  }}
                  className="flex-1 py-2 border rounded-lg font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDeleteUser(deleteConfirmUid)}
                  disabled={isVerifyingDelete && enteredCode.length !== 6 || isSubmitting}
                  className="flex-1 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSubmitting ? "Deleting..." : "Delete User"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Key className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Reset Password</h2>
                    <p className="text-xs text-muted-foreground">{resetPasswordUser.displayName}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setResetPasswordUser(null)}
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex p-1 bg-muted rounded-lg">
                  <button
                    onClick={() => setResetPasswordMode('auto')}
                    className={cn(
                      "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                      resetPasswordMode === 'auto' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Auto-Generate
                  </button>
                  <button
                    onClick={() => setResetPasswordMode('manual')}
                    className={cn(
                      "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                      resetPasswordMode === 'manual' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Manual Entry
                  </button>
                </div>

                {resetPasswordMode === 'manual' ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">New Password</label>
                    <input
                      type="text"
                      value={manualPassword}
                      onChange={(e) => setManualPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 text-sm">
                    <p>A secure random password will be generated and sent to the user's email address automatically.</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setResetPasswordUser(null)}
                  className="flex-1 py-2 border rounded-lg font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleResetPassword(resetPasswordUser, resetPasswordMode === 'manual' ? manualPassword : undefined)}
                  disabled={resetPasswordMode === 'manual' && !manualPassword}
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Update Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
