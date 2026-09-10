import React, { useState, useEffect } from 'react';
import { Search, Filter, CheckCircle2, Clock, AlertCircle, Eye, User, RotateCcw, X, FileText } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { firestoreService } from '../services/firestoreService';
import { Submission, Assignment, Template, User as UserType, Evaluation } from '../types';
import { formatDateTime, formatDate, cn, formatId } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export default function SubmissionList() {
  const { user: currentUser, isAdmin, isHR, isQM, isReviewer } = useAuth();
  const location = useLocation();
  const [tasks, setTasks] = useState<any[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(location.state?.filter || 'all');

  const [departments, setDepartments] = useState<any[]>([]);

  const userRoles = currentUser?.roles && currentUser.roles.length > 0 
    ? currentUser.roles 
    : (currentUser?.role ? [currentUser.role] : []);

  const hasAdminOrQualityRole = 
    isAdmin || 
    isHR || 
    isQM || 
    userRoles.some(r => ['super_admin', 'hr_admin', 'quality_management'].includes(r as any));

  const isReviewerRole = 
    isReviewer || 
    userRoles.includes('reviewer' as any);

  const isEmployeeOnlyRole = !hasAdminOrQualityRole && !isReviewerRole;

  useEffect(() => {
    const loadData = async () => {
      // Log viewing activity
      await firestoreService.logActivity('Viewed Assessment Tracking', 'Reviews', {}, currentUser?.uid, currentUser?.email);

      const [subs, evals, allAssigns, templates, users, depts] = await Promise.all([
        firestoreService.getCollection<Submission>('submissions', []),
        firestoreService.getCollection<Evaluation>('reviews', []),
        firestoreService.getCollection<Assignment>('assignments', []),
        firestoreService.getCollection<Template>('templates', []),
        firestoreService.getCollection<UserType>('users', []),
        firestoreService.getCollection<any>('departments', [])
      ]);

      setDepartments(depts);

      // Determine which assignments to track based on role
      let visibleAssigns = allAssigns;
      
      // Admin role and Quality role see all employee submissions
      if (hasAdminOrQualityRole) {
        visibleAssigns = allAssigns;
      } else if (isReviewerRole) {
        // Reviewer role only sees assessments where they were assigned as the reviewer
        visibleAssigns = allAssigns.filter(a => 
          a.reviewerId === currentUser?.uid || 
          a.reviewerId === currentUser?.email || 
          a.reviewerId === currentUser?.id
        );
      } else if (isEmployeeOnlyRole) {
        // Employee role only sees assessments assigned to them
        visibleAssigns = allAssigns.filter(a => {
          if (a.type === 'individual') return a.targetIds?.includes(currentUser?.uid || '') || a.targetIds?.includes(currentUser?.email || '');
          if (a.type === 'department') return a.targetIds?.includes(currentUser?.departmentId || '');
          return false;
        });
      }

      const now = new Date();
      const allTasks: any[] = [];

      visibleAssigns.forEach(a => {
        const template = templates.find(t => t.id === a.templateId);
        const isExpired = a.status === 'expired' || 
                         (a.dueDate && new Date(a.dueDate) < now) || 
                         (a.linkExpiryDate && new Date(a.linkExpiryDate) < now);

        // Get target user IDs
        let targetUids: string[] = [];
        if (a.type === 'individual') {
          targetUids = a.targetIds || [];
        } else if (a.type === 'department') {
          targetUids = users.filter(u => u.departmentId && a.targetIds?.includes(u.departmentId)).map(u => u.uid || u.email || u.id);
        }

        // Filter targetUids only if purely employee role
        if (isEmployeeOnlyRole) {
          targetUids = targetUids.filter(uid => uid === currentUser?.uid || uid === currentUser?.email);
        }

        const reviewerUser = users.find(u => u.uid === a.reviewerId || u.email === a.reviewerId || u.id === a.reviewerId);
        const reviewerName = reviewerUser?.displayName || a.reviewerId || 'Unassigned';
        const isAssignedReviewer = a.reviewerId === currentUser?.uid || a.reviewerId === currentUser?.email || a.reviewerId === currentUser?.id;
        const canEvaluate = hasAdminOrQualityRole || isAssignedReviewer;

        targetUids.forEach(uid => {
          const employee = users.find(u => u.uid === uid || u.email === uid || u.id === uid);
          const dept = depts.find(d => d.id === employee?.departmentId);
          const submission = subs.find(s => (s.employeeId === uid || s.employeeId === employee?.email || s.employeeId === employee?.uid) && s.assignmentId === a.id);
          const evaluation = submission ? evals.find(e => e.submissionId === submission.id) : undefined;

          let status = 'pending';
          if (submission) {
            if (submission.status === 'completed' || evaluation) {
              if (evaluation?.retestRequired) {
                status = 'retest';
              } else {
                status = 'completed';
              }
            } else if (submission.status === 'submitted' || submission.status === 'under_review') {
              status = 'under_review';
            } else {
              status = 'in_progress';
            }
          } else if (isExpired) {
            status = 'expired';
          }

          allTasks.push({
            id: submission?.id || `${uid}_${a.id}`,
            employee,
            template,
            assignment: a,
            submission,
            evaluation,
            status,
            submittedAt: submission?.submittedAt || null,
            employeeName: employee?.displayName || employee?.email || 'Unknown',
            templateName: template?.name || 'Unknown',
            departmentName: dept?.name || employee?.departmentId || 'N/A',
            reviewerName,
            isAssignedReviewer,
            canEvaluate
          });
        });
      });

      // Sort by submission date if exists, then by creation
      allTasks.sort((a, b) => {
        if (a.submittedAt && b.submittedAt) return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
        if (a.submittedAt) return -1;
        if (b.submittedAt) return 1;
        return 0;
      });

      setTasks(allTasks);
      setLoading(false);
    };

    loadData();
  }, [currentUser]);

  useEffect(() => {
    let filtered = [...tasks];

    // Status Filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        filtered = filtered.filter(t => t.status === 'pending' || t.status === 'in_progress');
      } else if (statusFilter === 'under_review') {
        filtered = filtered.filter(t => t.status === 'under_review' || t.status === 'submitted');
      } else {
        filtered = filtered.filter(t => t.status === statusFilter);
      }
    }

    // Search Filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(t => 
        t.employeeName.toLowerCase().includes(term) ||
        t.templateName.toLowerCase().includes(term)
      );
    }

    setFilteredTasks(filtered);
  }, [tasks, statusFilter, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assessment Performance Tracking</h1>
          <p className="text-muted-foreground mt-1">Real-time status tracking and evaluation for all assigned assessments.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <button 
          onClick={() => setStatusFilter('all')}
          className={cn(
            "bg-card p-4 rounded-xl border shadow-sm flex items-center gap-3 transition-all",
            statusFilter === 'all' ? "ring-2 ring-primary border-transparent" : "hover:border-primary/50"
          )}
        >
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <Filter className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-xl font-black">{tasks.length}</p>
          </div>
        </button>
        <button 
          onClick={() => setStatusFilter('completed')}
          className={cn(
            "bg-card p-4 rounded-xl border shadow-sm flex items-center gap-3 transition-all",
            statusFilter === 'completed' ? "ring-2 ring-primary border-transparent" : "hover:border-primary/50"
          )}
        >
          <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Completed</p>
            <p className="text-xl font-black">{tasks.filter(t => t.status === 'completed').length}</p>
          </div>
        </button>
        <button 
          onClick={() => setStatusFilter('under_review')}
          className={cn(
            "bg-card p-4 rounded-xl border shadow-sm flex items-center gap-3 transition-all",
            statusFilter === 'under_review' ? "ring-2 ring-primary border-transparent" : "hover:border-primary/50"
          )}
        >
          <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Review</p>
            <p className="text-xl font-black">{tasks.filter(t => t.status === 'under_review').length}</p>
          </div>
        </button>
        <button 
          onClick={() => setStatusFilter('retest')}
          className={cn(
            "bg-card p-4 rounded-xl border shadow-sm flex items-center gap-3 transition-all",
            statusFilter === 'retest' ? "ring-2 ring-primary border-transparent" : "hover:border-primary/50"
          )}
        >
          <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Retest</p>
            <p className="text-xl font-black">{tasks.filter(t => t.status === 'retest').length}</p>
          </div>
        </button>
        <button 
          onClick={() => setStatusFilter('expired')}
          className={cn(
            "bg-card p-4 rounded-xl border shadow-sm flex items-center gap-3 transition-all",
            statusFilter === 'expired' ? "ring-2 ring-primary border-transparent" : "hover:border-primary/50"
          )}
        >
          <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
            <X className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Expired</p>
            <p className="text-xl font-black">{tasks.filter(t => t.status === 'expired').length}</p>
          </div>
        </button>
        <button 
          onClick={() => setStatusFilter('pending')}
          className={cn(
            "bg-card p-4 rounded-xl border shadow-sm flex items-center gap-3 transition-all",
            statusFilter === 'pending' ? "ring-2 ring-primary border-transparent" : "hover:border-primary/50"
          )}
        >
          <div className="p-2 bg-blue-50 rounded-lg text-blue-400">
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pending</p>
            <p className="text-xl font-black">{tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length}</p>
          </div>
        </button>
      </div>

      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Search by employee name or assessment..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">S.No</th>
                <th className="px-6 py-4 font-semibold">Employee</th>
                <th className="px-6 py-4 font-semibold">Assessment</th>
                <th className="px-6 py-4 font-semibold">Assigned Reviewer</th>
                <th className="px-6 py-4 font-semibold">Submission/Due</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredTasks.map((task, index) => (
                <tr key={task.id} className="hover:bg-accent/50 transition-colors group">
                  <td className="px-6 py-4 text-sm font-medium">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-[10px] font-bold">
                        {task.employeeName.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{task.employeeName}</p>
                        <p className="text-xs text-muted-foreground">{task.departmentName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium">{task.templateName}</p>
                    <p className="text-xs text-muted-foreground">{task.template?.skillCategory}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-[9px] font-bold text-primary">
                        {task.reviewerName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-medium text-foreground">{task.reviewerName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {task.submittedAt ? (
                      <div className="flex flex-col">
                        <span>{formatDateTime(task.submittedAt)}</span>
                        <span className="text-[10px] text-emerald-600 font-bold uppercase">Submitted</span>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <span>{formatDate(task.assignment.dueDate)}</span>
                        <span className="text-[10px] text-amber-600 font-bold uppercase">Due Date</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit",
                        task.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                        task.status === 'under_review' ? "bg-amber-100 text-amber-700" :
                        task.status === 'retest' ? "bg-rose-100 text-rose-700" :
                        task.status === 'expired' ? "bg-slate-100 text-slate-700" :
                        "bg-blue-100 text-blue-700"
                      )}>
                        {task.status.replace('_', ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {task.submission ? (
                      <Link 
                        to={`/evaluate/${task.submission.id}`}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all w-fit",
                          task.status === 'completed'
                            ? "bg-muted hover:bg-accent text-foreground border"
                            : task.canEvaluate
                              ? "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                              : "bg-muted text-muted-foreground hover:bg-accent border cursor-pointer"
                        )}
                        title={
                          !task.canEvaluate && task.status !== 'completed'
                            ? `Only assigned reviewer (${task.reviewerName}) or Admin/Quality can evaluate`
                            : undefined
                        }
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{task.status === 'completed' ? 'View' : (task.canEvaluate ? 'Evaluate' : 'View (Read Only)')}</span>
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No submission</span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredTasks.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-muted-foreground">
                    {isReviewerRole && !hasAdminOrQualityRole 
                      ? 'No assessments currently assigned to you for review.' 
                      : 'No matching records found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
