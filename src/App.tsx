import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  ClipboardList, 
  CheckSquare, 
  BarChart3, 
  Bell, 
  LogOut, 
  User as UserIcon,
  Menu,
  X,
  Settings,
  ShieldCheck,
  Building2,
  Shield,
  CheckCircle2,
  AlertCircle,
  Info,
  ArrowLeft
} from 'lucide-react';
import { cn, formatDate } from './lib/utils';
import { firestoreService, query, where, orderBy, limit } from './services/firestoreService';
import Dashboard from './pages/Dashboard';
import TemplateList from './pages/TemplateList';
import TemplateEditor from './pages/TemplateEditor';
import AssignmentList from './pages/AssignmentList';
import AssignmentForm from './pages/AssignmentForm';
import SubmissionList from './pages/SubmissionList';
import EvaluationForm from './pages/EvaluationForm';
import AssessmentPortal from './pages/AssessmentPortal';
import UserManagement from './pages/UserManagement';
import RoleManagement from './pages/RoleManagement';
import DepartmentManagement from './pages/DepartmentManagement';
import AuditLogs from './pages/AuditLogs';
import Reports from './pages/Reports';
import MyAssessments from './pages/MyAssessments';
import BrandingSettings from './pages/BrandingSettings';
import TrainingRegisterList from './pages/TrainingRegisterList';
import TrainingRegisterDetail from './pages/TrainingRegisterDetail';
import { BookOpen } from 'lucide-react';

import { Login } from './components/Login';

const SidebarItem = ({ to, icon: Icon, label, active }: { to: string, icon: any, label: string, active: boolean }) => (
  <Link
    to={to}
    className={cn(
      "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors rounded-lg",
      active 
        ? "bg-primary text-primary-foreground" 
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    )}
  >
    <Icon className="w-5 h-5" />
    <span>{label}</span>
  </Link>
);

const Sidebar = () => {
  const { user, isAdmin, isHR, isReviewer, isQM, branding, hasPermission } = useAuth();
  const location = useLocation();
  const primaryColor = branding.primaryColor || '#0f172a';

  return (
    <div className="flex flex-col w-64 h-screen border-r bg-card text-card-foreground">
      <div className="p-6 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <ShieldCheck className="text-primary-foreground w-5 h-5" />
          )}
        </div>
        <span className="text-xl font-bold tracking-tight truncate">{branding.appName}</span>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {hasPermission('view_dashboard') && (
          <SidebarItem to="/" icon={LayoutDashboard} label="Dashboard" active={location.pathname === "/"} />
        )}
        
        <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee</div>
        <SidebarItem to="/my-assessments" icon={ClipboardList} label="My Assessments" active={location.pathname === "/my-assessments"} />
        <SidebarItem to="/training-registers" icon={BookOpen} label="Training Registers" active={location.pathname.startsWith("/training-registers")} />

        {(hasPermission('manage_templates') || hasPermission('manage_assignments') || hasPermission('manage_training_registers')) && (
          <>
            <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Management</div>
            {hasPermission('manage_templates') && <SidebarItem to="/templates" icon={FileText} label="Templates" active={location.pathname.startsWith("/templates")} />}
            {hasPermission('manage_assignments') && <SidebarItem to="/assignments" icon={ClipboardList} label="Assignments" active={location.pathname.startsWith("/assignments")} />}
            {hasPermission('manage_training_registers') && <SidebarItem to="/training-registers" icon={BookOpen} label="Training Register" active={location.pathname.startsWith("/training-registers")} />}
          </>
        )}

        {(hasPermission('evaluate_submissions') || isReviewer || isQM || isAdmin || isHR) && (
          <>
            <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Evaluation</div>
            <SidebarItem to="/submissions" icon={CheckSquare} label="Submissions" active={location.pathname.startsWith("/submissions")} />
          </>
        )}

        {(hasPermission('manage_users') || hasPermission('manage_departments') || hasPermission('manage_branding') || hasPermission('view_audit_logs')) && (
          <>
            <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin</div>
            {hasPermission('manage_users') && <SidebarItem to="/users" icon={Users} label="Users" active={location.pathname === "/users"} />}
            {hasPermission('manage_users') && <SidebarItem to="/roles" icon={Shield} label="Roles" active={location.pathname === "/roles"} />}
            {hasPermission('manage_departments') && <SidebarItem to="/departments" icon={Building2} label="Departments" active={location.pathname === "/departments"} />}
            {hasPermission('manage_branding') && <SidebarItem to="/branding" icon={LayoutDashboard} label="Branding" active={location.pathname === "/branding"} />}
            {hasPermission('view_audit_logs') && <SidebarItem to="/audit-logs" icon={Settings} label="Audit Logs" active={location.pathname === "/audit-logs"} />}
          </>
        )}

        {hasPermission('view_reports') && (
          <>
            <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Insights</div>
            <SidebarItem to="/reports" icon={BarChart3} label="Reports" active={location.pathname === "/reports"} />
          </>
        )}
      </nav>

      <div className="p-4 border-t">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
            <UserIcon className="w-4 h-4 text-accent-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.displayName}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Header = () => {
  const { logout, branding, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    // In a real app, we'd have a 'notifications' collection.
    // For now, let's simulate notifications based on recent audit logs or assignments
    // or better, let's just implement a basic listener if the collection exists.
    const unsubscribe = firestoreService.subscribeToCollection<any>(
      'notifications',
      [where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(10)],
      (data) => {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.read).length);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const markAsRead = async (id: string) => {
    await firestoreService.updateDocument('notifications', id, { read: true });
  };

  const markAllAsRead = async () => {
    for (const n of notifications) {
      if (!n.read) {
        await markAsRead(n.id);
      }
    }
  };

  return (
    <header className="h-16 border-b bg-background flex items-center justify-between px-8 relative">
      <div className="flex items-center gap-4">
        {location.pathname !== '/' && (
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-accent rounded-lg transition-all group flex items-center gap-1"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:-translate-x-1" />
            <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground hidden sm:inline">Back</span>
          </button>
        )}
        <h2 className="text-lg font-semibold">{branding.appName} Portal</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-background">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowNotifications(false)}
              />
              <div className="absolute right-0 mt-2 w-80 bg-card border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-4 border-b flex items-center justify-between bg-muted/30">
                  <h3 className="font-bold text-sm">Notifications</h3>
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length > 0 ? (
                    <div className="divide-y">
                      {notifications.map((n) => (
                        <div 
                          key={n.id} 
                          className={cn(
                            "p-4 hover:bg-muted/50 transition-colors cursor-pointer flex gap-3",
                            !n.read && "bg-primary/5"
                          )}
                          onClick={() => {
                            markAsRead(n.id);
                            setShowNotifications(false);
                            if ((n as any).link) {
                              navigate((n as any).link);
                            }
                          }}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                            n.type === 'success' ? "bg-emerald-100 text-emerald-600" :
                            n.type === 'warning' ? "bg-amber-100 text-amber-600" :
                            "bg-blue-100 text-blue-600"
                          )}>
                            {n.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> :
                             n.type === 'warning' ? <AlertCircle className="w-4 h-4" /> :
                             <Info className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm", !n.read ? "font-bold" : "font-medium")}>{n.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{formatDate(n.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No notifications yet</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <button 
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};

const ProtectedRoute = ({ children, role }: { children: React.ReactNode, role?: string }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) {
    return <Login />;
  }

  return <>{children}</>;
};

const MainLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-screen bg-background text-foreground overflow-hidden">
    <Sidebar />
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
    </div>
  </div>
);

export default function App() {
  const { user, branding } = useAuth();

  // One-time migration to set the new transparent logo if it's currently empty
  useEffect(() => {
    if (user && !branding.logoUrl) {
      const updateLogo = async () => {
        try {
          await firestoreService.updateDocument('settings', 'branding', { logoUrl: '/logo.svg' });
          console.log('Logo updated to transparent version');
        } catch (error) {
          console.error('Failed to update logo:', error);
        }
      };
      updateLogo();
    }
  }, [user, branding.logoUrl]);

  return (
    <>
      <Toaster position="top-right" richColors />
      <Router>
        <Routes>
          {/* Public Assessment Link - Now Protected to ensure identity */}
          <Route path="/portal/:assignmentId" element={
            <ProtectedRoute>
              <AssessmentPortal />
            </ProtectedRoute>
          } />
          
          {/* Protected Routes */}
          <Route path="/*" element={
            <ProtectedRoute>
              <MainLayout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/my-assessments" element={<MyAssessments />} />
                  <Route path="/templates" element={<TemplateList />} />
                  <Route path="/templates/new" element={<TemplateEditor />} />
                  <Route path="/templates/edit/:id" element={<TemplateEditor />} />
                  <Route path="/assignments" element={<AssignmentList />} />
                  <Route path="/assignments/new" element={<AssignmentForm />} />
                  <Route path="/submissions" element={<SubmissionList />} />
                  <Route path="/evaluate/:submissionId" element={<EvaluationForm />} />
                  <Route path="/users" element={<UserManagement />} />
                  <Route path="/roles" element={<RoleManagement />} />
                  <Route path="/departments" element={<DepartmentManagement />} />
                  <Route path="/branding" element={<BrandingSettings />} />
                  <Route path="/audit-logs" element={<AuditLogs />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/training-registers" element={<TrainingRegisterList />} />
                  <Route path="/training-registers/new" element={<TrainingRegisterDetail />} />
                  <Route path="/training-registers/:id" element={<TrainingRegisterDetail />} />
                </Routes>
              </MainLayout>
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </>
  );
}
