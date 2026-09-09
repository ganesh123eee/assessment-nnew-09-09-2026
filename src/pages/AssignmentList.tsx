import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  Link as LinkIcon, 
  ExternalLink, 
  Trash2, 
  X, 
  AlertCircle, 
  Loader2,
  BarChart3,
  CheckCircle2,
  Clock,
  History,
  ChevronRight,
  ArrowRight,
  UserCheck,
  UserX,
  RotateCcw,
  Eye
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { firestoreService } from '../services/firestoreService';
import { where } from 'firebase/firestore';
import { Assignment, Template, User as UserType, Submission, Evaluation, Department } from '../types';
import { formatDate, formatDateTime, cn, formatId } from '../lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';

interface AssignmentProgress {
  user: UserType;
  submission?: Submission;
  evaluation?: Evaluation;
  status: 'in-process' | 'review-required' | 'completed' | 'retest-required';
}

export default function AssignmentList() {
  const { user } = useAuth();
  const location = useLocation();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(location.state?.filter || 'all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Progress Modal State
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [progressData, setProgressData] = useState<AssignmentProgress[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [viewingInProgress, setViewingInProgress] = useState<Submission | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // Log viewing activity
      await firestoreService.logActivity('Viewed Assignments', 'Assignments', {}, user?.uid, user?.email);

      const [assigns, templates, users, submissions, evaluations, depts] = await Promise.all([
        firestoreService.getCollection<Assignment>('assignments'),
        firestoreService.getCollection<Template>('templates'),
        firestoreService.getCollection<UserType>('users'),
        firestoreService.getCollection<Submission>('submissions'),
        firestoreService.getCollection<Evaluation>('reviews'),
        firestoreService.getCollection<Department>('departments')
      ]);

      setDepartments(depts);

      const enriched = assigns.map(a => {
        const template = templates.find(t => t.id === a.templateId);
        const reviewer = users.find(u => u.uid === a.reviewerId);
        
        // Map target names
        let targetNames: string[] = [];
        if (a.type === 'individual') {
          targetNames = a.targetIds.map(id => users.find(u => u.uid === id)?.displayName || id);
        } else {
          targetNames = a.targetIds.map(id => depts.find(d => d.id === id)?.name || id);
        }

        // Calculate progress summary
        const assignmentSubs = submissions.filter(s => s.assignmentId === a.id);
        
        let totalAssigned = 0;
        if (a.type === 'individual') {
          totalAssigned = a.targetIds.length;
        } else {
          totalAssigned = users.filter(u => u.departmentId && a.targetIds.includes(u.departmentId)).length;
        }

        const reviewRequired = assignmentSubs.filter(s => s.status === 'submitted' || s.status === 'under_review').length;
        const completed = assignmentSubs.filter(s => {
          const evalItem = evaluations.find(e => e.submissionId === s.id);
          return (s.status === 'completed' || evalItem) && !evalItem?.retestRequired;
        }).length;
        const retestRequired = assignmentSubs.filter(s => {
          const evalItem = evaluations.find(e => e.submissionId === s.id);
          return evalItem?.retestRequired;
        }).length;
        const inProcess = assignmentSubs.filter(s => s.status === 'in_progress').length;
        const notStarted = totalAssigned - assignmentSubs.length;

        return {
          ...a,
          template,
          reviewer,
          targetNames,
          summary: {
            total: totalAssigned,
            notStarted,
            inProcess,
            reviewRequired,
            completed,
            retestRequired
          }
        };
      }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setAssignments(enriched);
    } catch (error) {
      console.error('Error loading assignments:', error);
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleViewProgress = async (assignment: any) => {
    setSelectedAssignment(assignment);
    setLoadingProgress(true);
    try {
      const [allUsers, allSubmissions, allEvaluations, allDepartments] = await Promise.all([
        firestoreService.getCollection<UserType>('users'),
        firestoreService.getCollection<Submission>('submissions'),
        firestoreService.getCollection<Evaluation>('reviews'),
        firestoreService.getCollection<any>('departments')
      ]);

      // Filter submissions for this assignment
      const assignmentSubs = allSubmissions.filter(s => s.assignmentId === assignment.id);

      // Determine target users
      let targetUsers: UserType[] = [];
      if (assignment.type === 'individual') {
        targetUsers = allUsers.filter(u => assignment.targetIds.includes(u.uid));
      } else {
        // Department assignment
        targetUsers = allUsers.filter(u => u.departmentId && assignment.targetIds.includes(u.departmentId));
      }

      const progress = targetUsers.map(u => {
        const submission = assignmentSubs.find(s => s.employeeId === u.uid);
        const evaluation = submission ? allEvaluations.find(e => e.submissionId === submission.id) : undefined;
        const department = allDepartments.find((d: any) => d.id === u.departmentId);

        let status: AssignmentProgress['status'] = 'in-process';
        if (submission) {
          if (submission.status === 'in_progress') {
            status = 'in-process';
          } else if (submission.status === 'completed' || evaluation) {
            if (evaluation?.retestRequired) {
              status = 'retest-required';
            } else {
              status = 'completed';
            }
          } else {
            status = 'review-required';
          }
        }

        return {
          user: {
            ...u,
            departmentName: department?.name || u.departmentId || 'N/A'
          },
          submission,
          evaluation,
          status
        };
      });

      setProgressData(progress);
    } catch (error) {
      console.error('Error loading progress:', error);
      toast.error('Failed to load assignment progress');
    } finally {
      setLoadingProgress(false);
    }
  };

  const handleDelete = async (id: string) => {
    const assignment = assignments.find(a => a.id === id);
    setDeleting(true);
    try {
      // Delete related submissions first
      const submissions = await firestoreService.getCollection<any>('submissions', [
        where('assignmentId', '==', id)
      ]);
      
      for (const sub of submissions) {
        await firestoreService.deleteDocument('submissions', sub.id);
      }

      await firestoreService.deleteDocument('assignments', id);
      await firestoreService.logActivity('Deleted Assignment', 'Assignments', { 
        id, 
        templateName: assignment?.template?.name,
        deletedSubmissionsCount: submissions.length
      }, user?.uid, user?.email);
      setAssignments(prev => prev.filter(a => a.id !== id));
      toast.success(`Assignment and ${submissions.length} related submissions deleted successfully`);
      setDeleteConfirmId(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete assignment');
    } finally {
      setDeleting(false);
    }
  };

  const filteredAssignments = assignments.filter(a => {
    const matchesSearch = a.template?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDate = !dateFilter || a.dueDate.startsWith(dateFilter);
    
    let matchesStatus = true;
    if (statusFilter === 'expired') {
      const now = new Date();
      const isExpired = a.status === 'expired' || 
                        (a.dueDate && new Date(a.dueDate) < now) || 
                        (a.linkExpiryDate && new Date(a.linkExpiryDate) < now);
      matchesStatus = isExpired;
    }
    
    return matchesSearch && matchesDate && matchesStatus;
  });

  const getStatusColor = (dueDate: string, summary: any) => {
    const isFullyCompleted = summary && summary.notStarted === 0 && summary.inProcess === 0;
    if (isFullyCompleted) return "bg-emerald-100 text-emerald-700";
    
    const now = new Date();
    const due = new Date(dueDate);
    if (due < now) return "bg-rose-100 text-rose-700";
    return "bg-emerald-100 text-emerald-700";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assessment Assignments</h1>
          <p className="text-muted-foreground mt-1">Manage and track active assessment assignments.</p>
        </div>
        <Link 
          to="/assignments/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          <span>New Assignment</span>
        </Link>
      </div>

      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Search assignments..."
              className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <input 
              type="date"
              className="px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 text-sm"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select 
              className="px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <button 
            onClick={() => { setSearchQuery(''); setDateFilter(''); setStatusFilter('all'); }}
            className="p-2 border rounded-lg hover:bg-accent transition-colors text-xs font-medium"
          >
            Clear
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">S.No</th>
                <th className="px-6 py-4 font-semibold">Assessment</th>
                <th className="px-6 py-4 font-semibold">Target</th>
                <th className="px-6 py-4 font-semibold">Reviewer</th>
                <th className="px-6 py-4 font-semibold">Due Date</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredAssignments.map((item, index) => (
                <tr key={item.id} className="hover:bg-accent/50 transition-colors group">
                  <td className="px-6 py-4 text-sm font-medium">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{item.template?.name || 'Unknown Template'}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">{item.template?.skillCategory}</p>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                          item.type === 'department' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                        )}>
                          {item.type}
                        </span>
                        <span className="text-xs font-medium text-muted-foreground">
                          {item.summary?.total} Users
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[150px]" title={(item as any).targetNames?.join(', ')}>
                        {(item as any).targetNames?.join(', ')}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center text-[10px] font-bold">
                        {item.reviewer?.displayName?.charAt(0)}
                      </div>
                      <span className="text-sm">{item.reviewer?.displayName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {formatDate(item.dueDate)}
                      </div>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider block w-fit",
                        getStatusColor(item.dueDate, item.summary)
                      )}>
                        {item.summary && item.summary.notStarted === 0 && item.summary.inProcess === 0 
                          ? 'Completed' 
                          : new Date(item.dueDate) < new Date() 
                            ? 'Expired' 
                            : 'Active'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleViewProgress(item)}
                        className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-primary transition-colors"
                        title="View Progress"
                      >
                        <BarChart3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          const url = `${window.location.origin}/portal/${item.id}`;
                          navigator.clipboard.writeText(url);
                          toast.success('Assessment link copied to clipboard!');
                        }}
                        className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-primary transition-colors"
                        title="Copy Link"
                      >
                        <LinkIcon className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmId(item.id)}
                        className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
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

      {/* Progress Modal */}
      <AnimatePresence>
        {selectedAssignment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card border rounded-2xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b flex items-center justify-between bg-muted/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{selectedAssignment.template?.name}</h3>
                    <p className="text-sm text-muted-foreground">Detailed Assignment Progress & Status</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedAssignment(null)}
                  className="p-2 hover:bg-accent rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {loadingProgress ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <p className="text-muted-foreground font-medium">Loading progress data...</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                      <div className="bg-muted/30 p-4 rounded-xl border">
                        <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Total Assigned</p>
                        <p className="text-2xl font-bold">{progressData.length}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-xs font-bold uppercase text-slate-600 mb-1">Not Started</p>
                        <p className="text-2xl font-bold text-slate-700">
                          {progressData.filter(p => p.status === 'in-process' && !p.submission).length}
                        </p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <p className="text-xs font-bold uppercase text-blue-600 mb-1">In Process</p>
                        <p className="text-2xl font-bold text-blue-700">
                          {progressData.filter(p => p.status === 'in-process' && p.submission?.status === 'in_progress').length}
                        </p>
                      </div>
                      <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                        <p className="text-xs font-bold uppercase text-amber-600 mb-1">Review Required</p>
                        <p className="text-2xl font-bold text-amber-700">
                          {progressData.filter(p => p.status === 'review-required').length}
                        </p>
                      </div>
                      <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                        <p className="text-xs font-bold uppercase text-emerald-600 mb-1">Completed</p>
                        <p className="text-2xl font-bold text-emerald-700">
                          {progressData.filter(p => p.status === 'completed').length}
                        </p>
                      </div>
                      <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
                        <p className="text-xs font-bold uppercase text-rose-600 mb-1">Re-assessment Required</p>
                        <p className="text-2xl font-bold text-rose-700">
                          {progressData.filter(p => p.status === 'retest-required').length}
                        </p>
                      </div>
                    </div>

                    {/* Detailed Table */}
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                            <th className="px-6 py-4 font-semibold">S.No</th>
                            <th className="px-6 py-4 font-semibold">Employee</th>
                            <th className="px-6 py-4 font-semibold">Current Status</th>
                            <th className="px-6 py-4 font-semibold">Timeline</th>
                            <th className="px-6 py-4 font-semibold">Result</th>
                            <th className="px-6 py-4 font-semibold text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {progressData.map((item, index) => (
                            <tr key={item.user.uid} className="hover:bg-accent/50 transition-colors">
                              <td className="px-6 py-4 text-sm font-medium">
                                {index + 1}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-[10px] font-bold">
                                    {item.user.displayName?.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">{item.user.displayName}</p>
                                    <p className="text-xs text-muted-foreground">{(item.user as any).departmentName}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 w-fit",
                                  item.status === 'in-process' ? "bg-blue-100 text-blue-700" :
                                  item.status === 'review-required' ? "bg-amber-100 text-amber-700" :
                                  item.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                                  "bg-rose-100 text-rose-700"
                                )}>
                                  {item.status === 'in-process' && <Clock className="w-3 h-3" />}
                                  {item.status === 'review-required' && <AlertCircle className="w-3 h-3" />}
                                  {item.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                                  {item.status === 'retest-required' && <RotateCcw className="w-3 h-3" />}
                                  {item.status.replace('-', ' ')}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-xs">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                    <span className="text-muted-foreground">Assigned:</span>
                                    <span className="font-medium">{formatDateTime(selectedAssignment.createdAt)}</span>
                                  </div>
                                  {item.submission && (
                                    <div className="flex items-center gap-2 text-xs">
                                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                      <span className="text-muted-foreground">
                                        {item.submission.status === 'in_progress' ? 'Started:' : 'Submitted:'}
                                      </span>
                                      <span className="font-medium">{formatDateTime(item.submission.submittedAt)}</span>
                                    </div>
                                  )}
                                  {item.evaluation && (
                                    <div className="flex items-center gap-2 text-xs">
                                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                      <span className="text-muted-foreground">Reviewed:</span>
                                      <span className="font-medium">{formatDateTime(item.evaluation.reviewedAt)}</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {item.evaluation ? (
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      "text-sm font-bold",
                                      item.evaluation.result === 'pass' ? "text-emerald-600" : "text-rose-600"
                                    )}>
                                      {item.evaluation.result.toUpperCase()}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      ({item.evaluation.finalScore.toFixed(1)}%)
                                    </span>
                                  </div>
                                ) : item.submission?.status === 'in_progress' ? (
                                  <div className="flex flex-col gap-1">
                                    <div className="w-full bg-muted rounded-full h-1.5">
                                      <div 
                                        className="bg-blue-500 h-1.5 rounded-full transition-all" 
                                        style={{ width: `${(Object.keys(item.submission.answers || {}).length / (selectedAssignment.template?.questions?.length || 1)) * 100}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">
                                      {Object.keys(item.submission.answers || {}).length} / {selectedAssignment.template?.questions?.length} Answered
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                {item.submission?.status === 'in_progress' && (
                                  <button 
                                    onClick={() => setViewingInProgress(item.submission || null)}
                                    className="p-2 hover:bg-accent rounded-lg text-primary transition-colors"
                                    title="Check Current Progress"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t bg-muted/30 flex justify-end">
                <button 
                  onClick={() => setSelectedAssignment(null)}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-bold hover:opacity-90 transition-opacity"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* In Progress Details Modal */}
      <AnimatePresence>
        {viewingInProgress && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b flex items-center justify-between bg-blue-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Current Progress Check</h3>
                    <p className="text-xs text-muted-foreground">Viewing real-time answers for this employee</p>
                  </div>
                </div>
                <button 
                  onClick={() => setViewingInProgress(null)}
                  className="p-2 hover:bg-accent rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/30 rounded-xl border">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Time Remaining</p>
                    <p className="text-xl font-bold text-blue-600">
                      {Math.floor((viewingInProgress.timeLeft || 0) / 60)}:{(viewingInProgress.timeLeft || 0) % 60 < 10 ? '0' : ''}{(viewingInProgress.timeLeft || 0) % 60}
                    </p>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-xl border">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Questions Answered</p>
                    <p className="text-xl font-bold text-emerald-600">
                      {Object.keys(viewingInProgress.answers || {}).length} / {selectedAssignment.template?.questions?.length}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-bold border-b pb-2">Current Answers</h4>
                  {selectedAssignment.template?.questions.map((q: any, idx: number) => (
                    <div key={q.id} className="p-4 bg-muted/20 rounded-xl border border-transparent hover:border-accent transition-all">
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 bg-accent rounded flex items-center justify-center text-xs font-bold shrink-0">
                          {idx + 1}
                        </span>
                        <div className="space-y-2 flex-1">
                          <p className="text-sm font-medium">{q.text}</p>
                          <div className="p-3 bg-background rounded-lg border text-sm">
                            {viewingInProgress.answers?.[q.id] ? (
                              <span className="text-foreground">
                                {Array.isArray(viewingInProgress.answers[q.id]) 
                                  ? viewingInProgress.answers[q.id].join(', ') 
                                  : String(viewingInProgress.answers[q.id])}
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">Not answered yet</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 border-t bg-muted/30 flex justify-end">
                <button 
                  onClick={() => setViewingInProgress(null)}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-bold hover:opacity-90 transition-opacity"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card border rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center gap-4 text-destructive mb-4">
                  <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Delete Assignment</h3>
                    <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  Are you sure you want to delete the assignment for <span className="font-bold text-foreground">"{assignments.find(a => a.id === deleteConfirmId)?.template?.name}"</span>? 
                  This will remove access for all assigned users.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 px-4 py-2 border rounded-lg font-medium hover:bg-accent transition-colors"
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleDelete(deleteConfirmId)}
                    className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                    disabled={deleting}
                  >
                    {deleting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <span>Delete</span>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FileText(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  )
}
