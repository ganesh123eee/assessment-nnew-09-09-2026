import React, { useState, useEffect } from 'react';
import { Shield, Plus, Edit2, Trash2, Check, X, AlertCircle, Info, Save, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { firestoreService } from '../services/firestoreService';
import { RoleDefinition, Permission } from '../types';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

const PERMISSIONS: { id: Permission; label: string; description: string }[] = [
  { id: 'view_dashboard', label: 'View Dashboard', description: 'Access to the main dashboard and statistics' },
  { id: 'manage_templates', label: 'Manage Templates', description: 'Create, edit, and delete assessment templates' },
  { id: 'manage_assignments', label: 'Manage Assignments', description: 'Assign assessments to employees or departments' },
  { id: 'evaluate_submissions', label: 'Evaluate Submissions', description: 'Review and score employee assessment submissions' },
  { id: 'manage_users', label: 'Manage Users', description: 'Create and manage user accounts and roles' },
  { id: 'manage_departments', label: 'Manage Departments', description: 'Create and manage organizational departments' },
  { id: 'view_reports', label: 'View Reports', description: 'Access to detailed assessment and performance reports' },
  { id: 'view_audit_logs', label: 'View Audit Logs', description: 'Monitor system activities and changes' },
  { id: 'manage_branding', label: 'Manage Branding', description: 'Customize application name, logo, and colors' },
  { id: 'view_my_assessments', label: 'View My Assessments', description: 'Access to take assigned assessments' },
  { id: 'manage_training_registers', label: 'Manage Training Registers', description: 'Create and oversee SOP training registers and digital signature workflows' }
];

export default function RoleManagement() {
  const { user: currentUser } = useAuth();
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const [deleteConfirmRole, setDeleteConfirmRole] = useState<RoleDefinition | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newRole, setNewRole] = useState<Partial<RoleDefinition>>({
    name: '',
    description: '',
    permissions: []
  });

  const loadRoles = async () => {
    setLoading(true);
    try {
      const data = await firestoreService.getCollection<RoleDefinition>('roles');
      setRoles(data);
    } catch (err) {
      console.error('Error loading roles:', err);
      toast.error('Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRole.name || !newRole.permissions || newRole.permissions.length === 0) {
      toast.error('Please provide a name and at least one permission');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const roleId = editingRole ? editingRole.id : newRole.name.toLowerCase().replace(/\s+/g, '_');
      const roleData = {
        ...newRole,
        id: roleId,
        updatedAt: new Date().toISOString()
      };

      if (editingRole) {
        await firestoreService.updateDocument('roles', editingRole.id, roleData);
        toast.success('Role updated successfully');
      } else {
        await firestoreService.createDocument('roles', {
          ...roleData,
          createdAt: new Date().toISOString()
        }, roleId);
        toast.success('Role created successfully');
      }

      setIsModalOpen(false);
      setEditingRole(null);
      setNewRole({ name: '', description: '', permissions: [] });
      loadRoles();
    } catch (err: any) {
      console.error('Error saving role:', err);
      setError(err.message || 'Failed to save role');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRole = async (role: RoleDefinition) => {
    setDeleteConfirmRole(role);
  };

  const confirmDeleteRole = async () => {
    if (!deleteConfirmRole) return;

    try {
      await firestoreService.deleteDocument('roles', deleteConfirmRole.id);
      toast.success('Role deleted successfully');
      setDeleteConfirmRole(null);
      loadRoles();
    } catch (err) {
      console.error('Error deleting role:', err);
      toast.error('Failed to delete role');
    }
  };

  const togglePermission = (permissionId: Permission) => {
    const currentPermissions = newRole.permissions || [];
    if (currentPermissions.includes(permissionId)) {
      setNewRole({ ...newRole, permissions: currentPermissions.filter(p => p !== permissionId) });
    } else {
      setNewRole({ ...newRole, permissions: [...currentPermissions, permissionId] });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Role Definitions</h1>
          <p className="text-muted-foreground mt-1">Define roles and assign specific permissions.</p>
        </div>
        <button 
          onClick={() => {
            setEditingRole(null);
            setNewRole({ name: '', description: '', permissions: [] });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Role</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roles.map((role) => (
          <div key={role.id} className="bg-card p-6 rounded-2xl border shadow-sm flex flex-col h-full">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <Shield className="w-6 h-6" />
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setEditingRole(role);
                    setNewRole({ ...role });
                    setIsModalOpen(true);
                  }}
                  className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-primary transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDeleteRole(role)}
                  className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                {role.isSystem && (
                  <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded-md">System</span>
                )}
              </div>
            </div>
            
            <h3 className="text-lg font-bold">{role.name}</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4 flex-1">{role.description}</p>
            
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Permissions ({role.permissions.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {role.permissions.slice(0, 4).map((p) => (
                  <span key={p} className="px-2 py-0.5 bg-accent/50 text-[10px] font-medium rounded-md border">
                    {PERMISSIONS.find(perm => perm.id === p)?.label || p}
                  </span>
                ))}
                {role.permissions.length > 4 && (
                  <span className="px-2 py-0.5 bg-accent/50 text-[10px] font-medium rounded-md border">
                    +{role.permissions.length - 4} more
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden my-8">
            <div className="p-6 border-b flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{editingRole ? 'Edit Role' : 'Create New Role'}</h2>
                  <p className="text-sm text-muted-foreground">Define permissions for this role</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-accent rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="p-6 space-y-6">
              {error && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-xl flex items-center gap-3 text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role Name</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                    value={newRole.name}
                    onChange={(e) => setNewRole({...newRole, name: e.target.value})}
                    placeholder="e.g. Content Manager"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <textarea 
                    className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
                    value={newRole.description}
                    onChange={(e) => setNewRole({...newRole, description: e.target.value})}
                    placeholder="Briefly describe the purpose of this role..."
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Permissions</label>
                    <span className="text-xs text-muted-foreground">{newRole.permissions?.length || 0} selected</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-muted/30 rounded-xl border max-h-64 overflow-y-auto">
                    {PERMISSIONS.map((perm) => (
                      <label 
                        key={perm.id} 
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer hover:shadow-sm",
                          newRole.permissions?.includes(perm.id) 
                            ? "bg-primary/5 border-primary/30 ring-1 ring-primary/30" 
                            : "bg-background border-transparent hover:border-muted-foreground/20"
                        )}
                      >
                        <div className="mt-0.5">
                          <input 
                            type="checkbox"
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                            checked={newRole.permissions?.includes(perm.id)}
                            onChange={() => togglePermission(perm.id)}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold leading-none">{perm.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{perm.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium hover:bg-accent rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{editingRole ? 'Update Role' : 'Create Role'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-8 h-8 text-destructive" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Delete Role</h2>
                <p className="text-muted-foreground mt-1">
                  {deleteConfirmRole.isSystem 
                    ? `WARNING: "${deleteConfirmRole.name}" is a System Role. Deleting it may cause access issues for users. Are you sure?`
                    : `Are you sure you want to delete the role "${deleteConfirmRole.name}"? This action cannot be undone.`}
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setDeleteConfirmRole(null)}
                  className="flex-1 py-2 border rounded-lg font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteRole}
                  className="flex-1 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
