import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Users, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Send,
  Info,
  Settings as SettingsIcon,
  Mail,
  Edit2,
  X,
  Save,
  Loader2,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { firestoreService } from '../services/firestoreService';
import { Submission, Evaluation, Template, Assignment } from '../types';
import { cn, formatDate, formatDateTime } from '../lib/utils';

const StatCard = ({ title, value, icon: Icon, trend, trendValue, color, onClick }: any) => (
  <div 
    onClick={onClick}
    className="bg-card p-6 rounded-2xl border shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
  >
    <div className="flex items-start justify-between">
      <div className={cn("p-3 rounded-xl", color)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      {trend && (
        <div className={cn("flex items-center gap-1 text-xs font-medium", trend === 'up' ? "text-emerald-600" : "text-rose-600")}>
          {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {trendValue}%
        </div>
      )}
    </div>
    <div className="mt-4">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <p className="text-2xl font-bold mt-1 group-hover:text-primary transition-colors">{value}</p>
    </div>
  </div>
);

interface SMTPStatus {
  SMTP_HOST: boolean;
  SMTP_PORT: boolean;
  SMTP_USER: boolean;
  SMTP_PASS: boolean;
  SMTP_FROM: boolean;
  host: string;
  port: string;
  user: string;
  from: string;
  configured: boolean;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user: currentUser, hasPermission } = useAuth();

  useEffect(() => {
    // If user doesn't have permission to view dashboard, redirect to my-assessments
    if (currentUser && !hasPermission('view_dashboard')) {
      navigate('/my-assessments', { replace: true });
    }
  }, [currentUser, navigate, hasPermission]);
  const [loading, setLoading] = useState(true);
  const [smtpStatus, setSmtpStatus] = useState<SMTPStatus | null>(null);
  const [isEditingSmtp, setIsEditingSmtp] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: '587',
    user: '',
    pass: '',
    from: ''
  });

  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    pending: 0,
    underReview: 0,
    passed: 0,
    failed: 0,
    retest: 0,
    expired: 0
  });

  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleResetData = async () => {
    if (resetConfirmInput !== 'RESET') {
      toast.error('Please type RESET to confirm.');
      return;
    }

    setIsResetting(true);
    const toastId = toast.loading('Resetting transaction data...');
    try {
      await firestoreService.resetTransactionData();
      toast.success('All transaction data has been deleted and counters reset to zero.', { id: toastId });
      setIsResetModalOpen(false);
      setResetConfirmInput('');
      
      // Reset local state counters
      setStats({
        total: 0,
        completed: 0,
        pending: 0,
        underReview: 0,
        passed: 0,
        failed: 0,
        retest: 0,
        expired: 0
      });
      setRecentSubmissions([]);

      if (currentUser) {
        await firestoreService.logActivity('Reset Transaction Data', 'Dashboard', { action: 'Full Transaction Purge' }, currentUser.uid, currentUser.email);
      }
    } catch (err: any) {
      console.error('Reset transaction data error:', err);
      toast.error(err.message || 'Failed to reset transaction data', { id: toastId });
    } finally {
      setIsResetting(false);
    }
  };

  const fetchSmtpStatus = async () => {
    if (currentUser?.role === 'super_admin') {
      try {
        const smtpRes = await fetch('/api/smtp-status');
        if (smtpRes.ok) {
          const data = await smtpRes.json();
          setSmtpStatus(data);
          
          // If we have data from Firestore, it might be useful to pre-fill the form
          // But the server doesn't tell us if it's from Firestore or Env
          // Let's try to fetch directly from Firestore for the form
          const smtpDoc = await getDoc(doc(db, 'settings', 'smtp'));
          if (smtpDoc.exists()) {
            const firestoreData = smtpDoc.data().data;
            setSmtpForm({
              host: firestoreData.host || '',
              port: firestoreData.port || '587',
              user: firestoreData.user || '',
              pass: firestoreData.pass || '',
              from: firestoreData.from || ''
            });
          } else {
            // Fallback to what we got from the API (masked)
            setSmtpForm({
              host: data.host === 'Not Set' ? '' : data.host,
              port: data.port === 'Not Set' ? '587' : data.port,
              user: data.user === 'Not Set' ? '' : data.user,
              pass: '', // Never pre-fill password
              from: data.from === 'Not Set' ? '' : data.from
            });
          }
        }
      } catch (e) {
        console.error('Failed to fetch SMTP status', e);
      }
    }
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const [subs, evals, templates, assigns, users, departments] = await Promise.all([
          firestoreService.getCollection<Submission>('submissions'),
          firestoreService.getCollection<Evaluation>('reviews'),
          firestoreService.getCollection<Template>('templates'),
          firestoreService.getCollection<Assignment>('assignments'),
          firestoreService.getCollection<any>('users'),
          firestoreService.getCollection<any>('departments')
        ]);

        await fetchSmtpStatus();

        if (currentUser?.role === 'employee') {
          const myAssigns = assigns.filter(a => {
            if (a.type === 'individual') return a.targetIds.includes(currentUser.uid);
            if (a.type === 'department') return a.targetIds.includes(currentUser.departmentId || '');
            return false;
          });
          const mySubs = subs.filter(s => s.employeeId === currentUser.uid);
          const myEvals = evals.filter(e => mySubs.some(s => s.id === e.submissionId));

          // Use unique assignment IDs to avoid double counting multiple attempts
          const completedAssignIds = new Set(mySubs.filter(s => s.status === 'completed').map(s => s.assignmentId));
          const underReviewAssignIds = new Set(mySubs.filter(s => s.status === 'submitted' || s.status === 'under_review').map(s => s.assignmentId));

          const now = new Date();
          const expiredAssignIds = new Set();
          const pendingAssignIds = new Set();
          
          myAssigns.forEach(a => {
            const hasSubmitted = mySubs.some(s => s.assignmentId === a.id && 
                                           (s.status === 'submitted' || s.status === 'under_review' || s.status === 'completed'));
            
            if (!hasSubmitted) {
              const isExpired = a.status === 'expired' || 
                               (a.dueDate && new Date(a.dueDate) < now) || 
                               (a.linkExpiryDate && new Date(a.linkExpiryDate) < now);
              if (isExpired) {
                expiredAssignIds.add(a.id);
              } else {
                pendingAssignIds.add(a.id);
              }
            }
          });

          setStats({
            total: myAssigns.length,
            completed: completedAssignIds.size,
            pending: pendingAssignIds.size,
            underReview: underReviewAssignIds.size,
            passed: myEvals.filter(e => e.result === 'pass').length,
            failed: myEvals.filter(e => e.result === 'fail').length,
            retest: myEvals.filter(e => e.retestRequired).length,
            expired: expiredAssignIds.size
          });

          const enriched = mySubs
            .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
            .slice(0, 5)
            .map(s => {
              const assign = assigns.find(a => a.id === s.assignmentId);
              const template = templates.find(t => t.id === assign?.templateId);
              const evalData = evals.find(e => e.submissionId === s.id);
              const department = departments.find(d => d.id === currentUser.departmentId);

              return {
                id: s.id,
                name: currentUser.displayName,
                dept: department?.name || currentUser.departmentId || 'N/A',
                assessment: template?.name || 'Unknown',
                date: formatDate(s.submittedAt),
                status: s.status === 'completed' ? 'Completed' : 'Submitted',
                score: evalData ? evalData.finalScore.toFixed(1) : '-',
                result: evalData?.result === 'pass' ? 'Pass' : evalData?.result === 'fail' ? 'Fail' : '-'
              };
            });
          setRecentSubmissions(enriched);
        } else {
          // Filter submissions to only those belonging to active assignments
          const activeAssignIds = new Set(assigns.map(a => a.id));
          const activeSubs = subs.filter(s => activeAssignIds.has(s.assignmentId));

          // Calculate total expected submissions (Total Assigned Tasks)
          let totalExpected = 0;
          assigns.forEach(a => {
            if (a.type === 'individual') {
              totalExpected += a.targetIds.length;
            } else if (a.type === 'department') {
              const deptUsers = users.filter((u: any) => u.departmentId && a.targetIds.includes(u.departmentId));
              totalExpected += deptUsers.length;
            }
          });

          const total = totalExpected || assigns.length;

          // Unique completions per user per assignment
          const completedPairs = new Set();
          const underReviewPairs = new Set();
          const retestPairs = new Set();
          const expiredPairs = new Set();
          const pendingPairs = new Set();

          const now = new Date();

          assigns.forEach(a => {
            const isExpired = a.status === 'expired' || 
                             (a.dueDate && new Date(a.dueDate) < now) || 
                             (a.linkExpiryDate && new Date(a.linkExpiryDate) < now);
            
            // Collect all users for this assignment
            let targetUids: string[] = [];
            if (a.type === 'individual') {
              targetUids = a.targetIds;
            } else if (a.type === 'department') {
              targetUids = users.filter((u: any) => u.departmentId && a.targetIds.includes(u.departmentId)).map(u => u.uid);
            }

            targetUids.forEach(uid => {
              const userSub = subs.find(s => s.employeeId === uid && s.assignmentId === a.id);
              const evaluation = userSub ? evals.find(e => e.submissionId === userSub.id) : undefined;

              if (userSub && (userSub.status === 'completed' || evaluation)) {
                if (evaluation?.retestRequired) {
                  retestPairs.add(`${uid}_${a.id}`);
                } else {
                  completedPairs.add(`${uid}_${a.id}`);
                }
              } else if (userSub && (userSub.status === 'under_review' || userSub.status === 'submitted')) {
                underReviewPairs.add(`${uid}_${a.id}`);
              } else {
                // Not submitted at all or in_progress
                if (isExpired) {
                  expiredPairs.add(`${uid}_${a.id}`);
                } else {
                  pendingPairs.add(`${uid}_${a.id}`);
                }
              }
            });
          });

          const completed = completedPairs.size;
          const underReview = underReviewPairs.size;
          const expired = expiredPairs.size;
          const pending = pendingPairs.size;
          const retest = retestPairs.size;

          setStats({
            total,
            completed,
            pending,
            underReview,
            passed: evals.filter(e => e.result === 'pass').length,
            failed: evals.filter(e => e.result === 'fail').length,
            retest,
            expired
          });

          // Enrich recent submissions
          const enriched = subs
            .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
            .slice(0, 5)
            .map(s => {
              const employee = users.find((u: any) => u.uid === s.employeeId);
              const assign = assigns.find(a => a.id === s.assignmentId);
              const template = templates.find(t => t.id === assign?.templateId);
              const evalData = evals.find(e => e.submissionId === s.id);
              const department = departments.find(d => d.id === employee?.departmentId);

              return {
                id: s.id,
                name: employee?.displayName || 'Unknown',
                dept: department?.name || employee?.departmentId || 'N/A',
                assessment: template?.name || 'Unknown',
                date: formatDate(s.submittedAt),
                status: s.status === 'completed' ? 'Completed' : s.status === 'under_review' ? 'Under Review' : 'Submitted',
                score: evalData ? evalData.finalScore.toFixed(1) : '-',
                result: evalData?.result === 'pass' ? 'Pass' : evalData?.result === 'fail' ? 'Fail' : '-'
              };
            });

          setRecentSubmissions(enriched);
        }
        await firestoreService.logActivity('Viewed Dashboard', 'Dashboard', {}, currentUser?.uid, currentUser?.email);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [currentUser]);

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    setSavingSmtp(true);
    try {
      await setDoc(doc(db, 'settings', 'smtp'), {
        id: 'smtp',
        data: smtpForm,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.uid
      });
      
      toast.success('SMTP settings saved to Firestore. The server will use these settings for future emails.');
      await firestoreService.logActivity('Updated SMTP Settings', 'Dashboard', { host: smtpForm.host, user: smtpForm.user }, currentUser.uid, currentUser.email);
      setIsEditingSmtp(false);
      await fetchSmtpStatus();
    } catch (error: any) {
      console.error('Error saving SMTP settings:', error);
      toast.error('Failed to save SMTP settings.', {
        description: error.message || 'Check your permissions.'
      });
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (currentUser?.role !== 'super_admin') {
      toast.error('Access Restricted: Only Super Admin role users can send test emails.');
      return;
    }

    if (!currentUser?.email) {
      toast.error('No email address found in your profile. Please update your profile first.');
      return;
    }
    
    const toastId = toast.loading(`Sending test email to ${currentUser.email}...`);
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: currentUser.email,
          subject: 'AssessPro SMTP Test',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <h1 style="color: #2563eb;">SMTP Configuration Success!</h1>
              <p>This is a test email from your AssessPro instance.</p>
              <p>If you are seeing this, your SMTP settings are correctly configured.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 12px; color: #64748b;">Sent at: ${formatDateTime(new Date())}</p>
            </div>
          `
        }),
      });
      
      const result = await response.json();
      if (result.status === 'ok') {
        toast.success('Test email sent successfully!', { id: toastId });
        await firestoreService.logActivity('Sent Test Email', 'Dashboard', { recipient: currentUser.email }, currentUser.uid, currentUser.email);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="flex flex-col items-center gap-4">
          <Clock className="w-10 h-10 text-primary animate-spin" />
          <p className="text-muted-foreground font-medium">Loading dashboard analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Executive Overview</h1>
          <p className="text-muted-foreground mt-1">Real-time performance analytics for your organization.</p>
        </div>
        <div className="flex gap-3">
          {currentUser?.role === 'super_admin' && (
            <div className="relative group">
              <button className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-primary transition-colors">
                <Info className="w-5 h-5" />
              </button>
              <div className="absolute right-0 top-full mt-2 w-80 bg-card border rounded-xl shadow-xl p-4 invisible group-hover:visible z-50">
                <h4 className="font-bold text-sm mb-2">SMTP Troubleshooting (M365)</h4>
                <div className="text-xs text-muted-foreground space-y-2">
                  <p>If you see "535 5.7.139 Authentication unsuccessful":</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Enable <strong>Authenticated SMTP</strong> in M365 Admin Center (Users {'>'} Active Users {'>'} Mail {'>'} Manage email apps).</li>
                    <li>Use an <strong>App Password</strong> if MFA is enabled. Regular passwords will fail.</li>
                    <li>Ensure <strong>Security Defaults</strong> are disabled in Azure AD / Entra ID.</li>
                    <li>Use host <strong>smtp.office365.com</strong> and port <strong>587</strong>.</li>
                    <li>The <strong>From Email</strong> must match the <strong>Username</strong> unless you have "Send As" permissions.</li>
                    <li>For <strong>Shared Mailboxes</strong>, use Username: <code>primary@domain.com/shared@domain.com</code></li>
                  </ol>
                </div>
              </div>
            </div>
          )}
          {currentUser?.role === 'super_admin' && (
            <>
              <button 
                onClick={handleSendTestEmail}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg font-medium hover:bg-accent transition-all"
              >
                <Send className="w-4 h-4" />
                <span>Test Email</span>
              </button>
              <button 
                onClick={() => {
                  setResetConfirmInput('');
                  setIsResetModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 border border-rose-500/40 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg font-medium transition-all"
                title="Reset application transaction data"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Data</span>
              </button>
            </>
          )}
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity">
            Export Data
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        <StatCard 
          title="Total Assessments" 
          value={stats.total} 
          icon={FileText} 
          color="bg-blue-500" 
          trend="up" 
          trendValue="12" 
          onClick={() => navigate('/submissions', { state: { filter: 'all' } })}
        />
        <StatCard 
          title="Completed" 
          value={stats.completed} 
          icon={CheckCircle2} 
          color="bg-emerald-500" 
          trend="up" 
          trendValue="8" 
          onClick={() => navigate('/submissions', { state: { filter: 'completed' } })}
        />
        <StatCard 
          title="Under Review" 
          value={stats.underReview} 
          icon={Clock} 
          color="bg-amber-500" 
          onClick={() => navigate('/submissions', { state: { filter: 'under_review' } })}
        />
        <StatCard 
          title="Re-assessment Required" 
          value={stats.retest} 
          icon={AlertCircle} 
          color="bg-rose-500" 
          trend="down" 
          trendValue="2" 
          onClick={() => navigate('/submissions', { state: { filter: 'retest' } })}
        />
        <StatCard 
          title="Expired" 
          value={stats.expired} 
          icon={X} 
          color="bg-slate-500" 
          onClick={() => navigate('/submissions', { state: { filter: 'expired' } })}
        />
      </div>

      {currentUser?.role === 'super_admin' && smtpStatus && (
        <div className="bg-card border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold">SMTP Configuration Status</h2>
                <p className="text-sm text-muted-foreground">Current email server settings (Firestore overrides Environment Secrets).</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  smtpStatus.configured ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                )} />
                <span className="text-xs font-medium uppercase tracking-wider">
                  {smtpStatus.configured ? "Configured" : "Incomplete"}
                </span>
              </div>
              <button 
                onClick={() => setIsEditingSmtp(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit Settings
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-accent/50 rounded-xl border border-border/50">
              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Host</p>
              <p className="text-sm font-mono truncate">{smtpStatus.host}</p>
              <div className="mt-2 flex items-center gap-1">
                {smtpStatus.SMTP_HOST ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-rose-500" />
                )}
                <span className="text-[10px] text-muted-foreground">{smtpStatus.SMTP_HOST ? "Set" : "Missing"}</span>
              </div>
            </div>
            <div className="p-4 bg-accent/50 rounded-xl border border-border/50">
              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Port</p>
              <p className="text-sm font-mono">{smtpStatus.port}</p>
              <div className="mt-2 flex items-center gap-1">
                {smtpStatus.SMTP_PORT ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-rose-500" />
                )}
                <span className="text-[10px] text-muted-foreground">{smtpStatus.SMTP_PORT ? "Set" : "Missing"}</span>
              </div>
            </div>
            <div className="p-4 bg-accent/50 rounded-xl border border-border/50">
              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">User</p>
              <p className="text-sm font-mono truncate">{smtpStatus.user}</p>
              <div className="mt-2 flex items-center gap-1">
                {smtpStatus.SMTP_USER ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-rose-500" />
                )}
                <span className="text-[10px] text-muted-foreground">{smtpStatus.SMTP_USER ? "Set" : "Missing"}</span>
              </div>
            </div>
            <div className="p-4 bg-accent/50 rounded-xl border border-border/50">
              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Password</p>
              <p className="text-sm font-mono">••••••••••••</p>
              <div className="mt-2 flex items-center gap-1">
                {smtpStatus.SMTP_PASS ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-rose-500" />
                )}
                <span className="text-[10px] text-muted-foreground">{smtpStatus.SMTP_PASS ? "Set" : "Missing"}</span>
              </div>
            </div>
          </div>

          {!smtpStatus.configured && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">SMTP is not fully configured</p>
                <p className="text-xs text-amber-700 mt-1">
                  Email notifications will not be sent. Please click "Edit Settings" to configure SMTP via Firestore or add variables to the <strong>Secrets</strong> panel.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SMTP Edit Modal */}
      {isEditingSmtp && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-card w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b flex items-center justify-between bg-accent/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <SettingsIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Edit SMTP Configuration</h3>
                  <p className="text-xs text-muted-foreground">These settings will be stored securely in Firestore.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsEditingSmtp(false)}
                className="p-2 hover:bg-accent rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveSmtp} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2 md:col-span-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SMTP Host</label>
                  <input 
                    type="text"
                    required
                    placeholder="smtp.office365.com"
                    className="w-full px-4 py-2 bg-accent/50 border rounded-xl outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    value={smtpForm.host}
                    onChange={e => setSmtpForm({...smtpForm, host: e.target.value})}
                  />
                </div>
                <div className="space-y-2 col-span-2 md:col-span-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Port</label>
                  <input 
                    type="text"
                    required
                    placeholder="587"
                    className="w-full px-4 py-2 bg-accent/50 border rounded-xl outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    value={smtpForm.port}
                    onChange={e => setSmtpForm({...smtpForm, port: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Username / Email</label>
                <input 
                  type="email"
                  required
                  placeholder="info@symetricsystems.com"
                  className="w-full px-4 py-2 bg-accent/50 border rounded-xl outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  value={smtpForm.user}
                  onChange={e => setSmtpForm({...smtpForm, user: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Password / App Password</label>
                <input 
                  type="password"
                  required
                  placeholder="••••••••••••"
                  className="w-full px-4 py-2 bg-accent/50 border rounded-xl outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  value={smtpForm.pass}
                  onChange={e => setSmtpForm({...smtpForm, pass: e.target.value})}
                />
                <p className="text-[10px] text-muted-foreground">
                  For Office 365 with MFA, you <strong>must</strong> use an App Password.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">From Email (Optional)</label>
                <input 
                  type="email"
                  placeholder="info@symetricsystems.com"
                  className="w-full px-4 py-2 bg-accent/50 border rounded-xl outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  value={smtpForm.from}
                  onChange={e => setSmtpForm({...smtpForm, from: e.target.value})}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsEditingSmtp(false)}
                  className="flex-1 px-4 py-2 border rounded-xl font-bold hover:bg-accent transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={savingSmtp}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  {savingSmtp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>Save Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recent Submissions Table */}
      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-6 border-b flex items-center justify-between">
          <h3 className="font-semibold text-lg">Recent Submissions</h3>
          <button 
            onClick={() => navigate('/submissions')}
            className="text-sm font-medium text-primary hover:underline"
          >
            View All
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">S.No</th>
                <th className="px-6 py-4 font-semibold">Employee</th>
                <th className="px-6 py-4 font-semibold">Assessment</th>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Score</th>
                <th className="px-6 py-4 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentSubmissions.map((sub, index) => (
                <tr key={sub.id} className="hover:bg-accent/50 transition-colors cursor-pointer group" onClick={() => navigate('/submissions')}>
                  <td className="px-6 py-4 text-sm font-medium">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs">
                        {sub.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium group-hover:text-primary transition-colors">{sub.name}</p>
                        <p className="text-xs text-muted-foreground">{sub.dept}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">{sub.assessment}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{sub.date}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      sub.status === 'Completed' ? "bg-emerald-100 text-emerald-700" : 
                      sub.status === 'Under Review' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"
                    )}>
                      {sub.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">{sub.score}{typeof sub.score === 'string' && sub.score !== '-' ? '%' : ''}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-sm font-bold",
                      sub.result === 'Pass' ? "text-emerald-600" : sub.result === 'Fail' ? "text-rose-600" : "text-muted-foreground"
                    )}>
                      {sub.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl border border-destructive/20 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex items-center justify-between bg-destructive/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-destructive/20 text-destructive rounded-xl">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-foreground">Reset Transaction Data</h3>
                  <p className="text-xs text-muted-foreground">Permanent deletion of transactions</p>
                </div>
              </div>
              <button 
                onClick={() => setIsResetModalOpen(false)}
                disabled={isResetting}
                className="p-1 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  ⚠️ This action will delete:
                </p>
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                  <li>All assignments &amp; employee submissions</li>
                  <li>All evaluation results, scores, &amp; feedback</li>
                  <li>All training registers &amp; signatures</li>
                  <li>All transaction audit logs &amp; notifications</li>
                </ul>
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  ✓ <strong>Protected:</strong> Templates, users, roles, departments, and branding settings will NOT be affected.
                </p>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  Type <span className="text-destructive font-mono font-bold">RESET</span> to confirm:
                </label>
                <input 
                  type="text"
                  value={resetConfirmInput}
                  onChange={e => setResetConfirmInput(e.target.value)}
                  placeholder="RESET"
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm font-mono tracking-widest outline-none focus:ring-2 focus:ring-destructive/20 border-destructive/40"
                  disabled={isResetting}
                />
              </div>
            </div>

            <div className="p-6 border-t bg-muted/20 flex justify-end gap-3">
              <button 
                onClick={() => setIsResetModalOpen(false)}
                disabled={isResetting}
                className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleResetData}
                disabled={isResetting || resetConfirmInput !== 'RESET'}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {isResetting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Confirm Reset</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
