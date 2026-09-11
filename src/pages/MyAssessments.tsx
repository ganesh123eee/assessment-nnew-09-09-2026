import React, { useEffect, useState, useMemo } from 'react';
import { 
  ClipboardList, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Search, 
  Filter, 
  Download, 
  FileText,
  Trophy,
  Target,
  RotateCcw,
  ChevronRight,
  Eye,
  X,
  Loader2,
  Calendar
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { firestoreService } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import { Assignment, Template, Submission, Evaluation, User as UserType, Department } from '../types';
import { formatDate, formatDateTime, formatSignatureDate, cn, formatId } from '../lib/utils';
import { drawPdfBrandingHeader } from '../utils/pdfBranding';
import { BrandLogo } from '../components/BrandLogo';

type TabType = 'active' | 'results' | 'reports'; // Keeping for type safety if needed elsewhere, but activeTab is removed

interface ResultItem {
  submission: Submission;
  evaluation?: Evaluation;
  template?: Template;
  assignment?: Assignment;
}

export default function MyAssessments() {
  const { user, branding } = useAuth();
  const [assignments, setAssignments] = useState<(Assignment & { template?: Template })[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pass' | 'fail'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exporting, setExporting] = useState(false);
  const [tempSearch, setTempSearch] = useState('');
  const [selectedResult, setSelectedResult] = useState<ResultItem | null>(null);
  const [modalExtraData, setModalExtraData] = useState<{ reviewerName: string; deptName: string; } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      setLoading(true);
      try {
        // Load all necessary data in parallel
        const [allAssignments, allSubmissions, allEvaluations, allTemplates, allDepts] = await Promise.all([
          firestoreService.getCollection<Assignment>('assignments'),
          firestoreService.getCollection<Submission>('submissions'),
          firestoreService.getCollection<Evaluation>('reviews'),
          firestoreService.getCollection<Template>('templates'),
          firestoreService.getCollection<Department>('departments')
        ]);

        setDepartments(allDepts);

        const userSubmissions = allSubmissions.filter(s => s.employeeId === user.uid);
        
        // Assignments that are active and either not started or in progress
        const userAssignments = allAssignments.filter(a => {
          const isTarget = a.targetIds.includes(user.uid) || (user.departmentId && a.targetIds.includes(user.departmentId));
          if (!isTarget || a.status !== 'active') return false;
          
          const assignmentSubs = userSubmissions.filter(s => s.assignmentId === a.id);
          
          // Check if expired
          const isExpired = new Date(a.dueDate) < new Date();
          if (isExpired) {
            // Only hide if not in progress. If in progress, we might want to show it but block it in the portal
            // Actually, per user request: "not allow to do the exam" if not completed before due date
            return false;
          }

          // 1. If there's a pending submission (submitted or under review), hide it from active
          const isPending = assignmentSubs.some(s => s.status === 'submitted' || s.status === 'under_review');
          if (isPending) return false;

          // 2. If they have a completed submission that is a PASS, hide it
          const hasPassed = assignmentSubs.some(s => {
            if (s.status !== 'completed') return false;
            const evaluation = allEvaluations.find(e => e.submissionId === s.id);
            return evaluation?.result === 'pass';
          });
          if (hasPassed) return false;

          // 3. Check attempt limit
          const attemptLimit = a.attemptLimit || 1;
          const completedSubs = assignmentSubs.filter(s => s.status !== 'in_progress');
          const inProgressSub = assignmentSubs.find(s => s.status === 'in_progress');
          
          if (completedSubs.length >= attemptLimit && !inProgressSub) {
            // Only show if the last evaluation explicitly requires a retest (which might bypass the limit)
            const lastSub = [...completedSubs].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];
            const lastEval = lastSub ? allEvaluations.find(e => e.submissionId === lastSub.id) : null;
            if (!lastEval?.retestRequired) return false;
          }

          return true;
        });

        const assignmentsWithTemplates = userAssignments.map(a => ({
          ...a,
          template: allTemplates.find(t => t.id === a.templateId),
          submission: userSubmissions.find(s => s.assignmentId === a.id && s.status === 'in_progress')
        })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setAssignments(assignmentsWithTemplates);

        // Submissions that are submitted, under_review, or completed
        const resultsData = userSubmissions
          .filter(s => s.status === 'submitted' || s.status === 'under_review' || s.status === 'completed')
          .map(s => {
            const evaluation = allEvaluations.find(e => e.submissionId === s.id);
            const assignment = allAssignments.find(a => a.id === s.assignmentId);
            const template = allTemplates.find(t => t.id === (assignment?.templateId || (s as any).templateId));
            
            return {
              submission: s,
              evaluation,
              template: template || undefined,
              assignment
            };
          });

        setResults(resultsData.sort((a, b) => 
          new Date(b.submission.submittedAt).getTime() - new Date(a.submission.submittedAt).getTime()
        ));

        await firestoreService.logActivity('Viewed My Assessments & Results', 'Assessments', {}, user?.uid, user?.email);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  const filteredResults = useMemo(() => {
    return results.filter(item => {
      const templateName = item.template?.name || 'Unknown Assessment';
      const assignmentId = item.assignment?.id || '';
      const matchesSearch = templateName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           assignmentId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || item.evaluation?.result === statusFilter;
      
      let matchesDate = true;
      if (startDate || endDate) {
        const submittedDate = new Date(item.submission.submittedAt);
        submittedDate.setHours(0, 0, 0, 0);
        
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (submittedDate < start) matchesDate = false;
        }
        
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(0, 0, 0, 0);
          if (submittedDate > end) matchesDate = false;
        }
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [results, searchQuery, statusFilter, startDate, endDate]);

  const handleViewReport = async (item: ResultItem) => {
    setSelectedResult(item);
    if (item.evaluation) {
      try {
        const [reviewer, dept] = await Promise.all([
          firestoreService.getDocument<UserType>('users', item.evaluation.reviewerId),
          user?.departmentId ? firestoreService.getDocument<Department>('departments', user.departmentId) : Promise.resolve(null)
        ]);
        const trainerName = reviewer?.displayName === 'System Admin' ? (user?.displayName || 'Super Admin') : (reviewer?.displayName || 'N/A');
        setModalExtraData({
          reviewerName: trainerName,
          deptName: dept?.name || 'N/A'
        });
      } catch (error) {
        console.error('Error fetching modal extra data:', error);
        setModalExtraData({ reviewerName: 'N/A', deptName: 'N/A' });
      }
    }
  };

  const handleDownloadIndividualReport = async (item: ResultItem) => {
    if (!item.evaluation) {
      toast.error('Evaluation report not found for this submission.');
      return;
    }

    setExporting(true);
    try {
      const submission = item.submission;
      const evaluation = item.evaluation;
      const template = item.template;
      const assignment = item.assignment;

      // Fetch additional data needed for the report
      const [reviewer, dept] = await Promise.all([
        firestoreService.getDocument<UserType>('users', evaluation.reviewerId),
        user?.departmentId ? firestoreService.getDocument<Department>('departments', user.departmentId) : Promise.resolve(null)
      ]);

      const doc = new jsPDF();
      const primaryColor = branding.primaryColor || '#0f172a';

      // Render consistent branding header preserving logo aspect ratio and typography
      const { nextY } = await drawPdfBrandingHeader(doc, branding, {
        margin: 14,
        topY: 10,
        rightHeaderText: 'Confidential - Evaluation Report',
        showDivider: true
      });

      // Header
      doc.setFontSize(16);
      doc.setTextColor(primaryColor);
      doc.text('Evaluation Report', 14, nextY + 3);

      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Generated on: ${formatDateTime(new Date())}`, 14, nextY + 9);

      // Employee Info
      doc.setDrawColor(220);
      doc.line(14, nextY + 13, 196, nextY + 13);

      const infoHeaderY = nextY + 20;
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('Employee Information', 14, infoHeaderY);
      doc.text('SOP Information', 110, infoHeaderY);

      const infoStartY = infoHeaderY + 7;
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text(`Name: ${user?.displayName || 'N/A'}`, 14, infoStartY);
      doc.text(`Employee ID: ${user?.employeeId || 'N/A'}`, 14, infoStartY + 6);
      doc.text(`Email: ${user?.email || 'N/A'}`, 14, infoStartY + 12);
      doc.text(`Department: ${dept?.name || 'N/A'}`, 14, infoStartY + 18);
      doc.text(`Designation: ${user?.designation || 'N/A'}`, 14, infoStartY + 24);

      // Assessment Info
      const trainerName = reviewer?.displayName === 'System Admin' ? (user?.displayName || 'Super Admin') : (reviewer?.displayName || 'N/A');
      doc.text(`SOP Name: ${template?.name || 'N/A'}`, 110, infoStartY);
      doc.text(`Trainer Name: ${trainerName}`, 110, infoStartY + 6);
      doc.text(`Submitted At: ${formatDateTime(submission.submittedAt)}`, 110, infoStartY + 12);
      doc.text(`Duration: ${Math.floor(submission.durationTaken / 60)}m ${submission.durationTaken % 60}s`, 110, infoStartY + 18);

      // Assessment Description
      let currentY = infoStartY + 32;
      if (template?.description) {
        doc.setDrawColor(230);
        doc.line(14, 93, 196, 93);
        
        doc.setFontSize(10);
        doc.setTextColor(primaryColor);
        doc.text('SOP Overview', 14, 100);
        
        doc.setFontSize(8);
        doc.setTextColor(80);
        
        let descY = 105;
        const splitDesc = doc.splitTextToSize(`Template: ${template.description}`, 180);
        doc.text(splitDesc, 14, descY);
        descY += (splitDesc.length * 4) + 2;
        
        currentY = descY + 5;
      }

      // Summary
      doc.setFillColor(245, 247, 250);
      doc.rect(14, currentY, 182, 30, 'F');
      
      doc.setFontSize(14);
      doc.setTextColor(primaryColor);
      doc.text('Evaluation Summary', 20, currentY + 10);
      
      doc.setFontSize(12);
      doc.setTextColor(evaluation.result === 'pass' ? '#10b981' : '#ef4444');
      doc.text(`Result: ${evaluation.result.toUpperCase()}`, 20, currentY + 20);
      
      doc.setTextColor(0);
      doc.text(`Final Score: ${evaluation.finalScore.toFixed(1)}%`, 110, currentY + 20);

      // Detailed Marks
      doc.setFontSize(12);
      doc.text('Detailed SOP Results', 14, currentY + 40);

      const formatAnswer = (answer: any) => {
        if (answer === undefined || answer === null) return '-';
        if (typeof answer === 'string') return answer;
        if (Array.isArray(answer)) return answer.join(', ');
        if (typeof answer === 'object' && answer.name) return `File: ${answer.name}`;
        return String(answer);
      };

      const tableData = template?.questions.map((q, index) => {
        const score = (evaluation.questionScores || {})[q.id] || 0;
        const comment = (evaluation.questionComments || {})[q.id] || '-';
        const status = score > 0 ? 'Correct' : 'Wrong';
        const answer = submission.answers[q.id];
        
        return [
          index + 1,
          q.text,
          formatAnswer(answer),
          status,
          comment
        ];
      }) || [];

      autoTable(doc, {
        startY: currentY + 45,
        head: [['#', 'Question', 'Employee Answer', 'Status', 'Comments']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: primaryColor },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 60 },
          2: { cellWidth: 50 },
          3: { cellWidth: 25 },
          4: { cellWidth: 40 }
        }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 10;

      // Reviewer Comments
      if (finalY < 240) {
        doc.setFontSize(12);
        doc.text('Reviewer Feedback', 14, finalY);
        doc.setFontSize(10);
        doc.text(`Overall Comments: ${evaluation.overallComments || 'None'}`, 14, finalY + 8);
        doc.text(`Strengths: ${evaluation.strengths || 'None'}`, 14, finalY + 16);
        doc.text(`Areas for Improvement: ${evaluation.improvements || 'None'}`, 14, finalY + 24);
        doc.text(`Reviewer: ${trainerName}`, 14, finalY + 32);

        // Digital Signatures
        const sigY = finalY + 60;
        
        // Employee Signature
        doc.setDrawColor(200);
        doc.line(14, sigY, 90, sigY);
        doc.setFontSize(10);
        doc.setTextColor(primaryColor);
        doc.setFont('helvetica', 'italic');
        doc.text(user?.displayName || 'N/A', 14, sigY - 2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.setFontSize(8);
        doc.text('Employee Digital Signature', 14, sigY + 5);
        doc.text(`Date & Time: ${formatSignatureDate(submission.submittedAt)}`, 14, sigY + 10);
        
        // Reviewer Signature
        doc.line(110, sigY, 186, sigY);
        doc.setTextColor(primaryColor);
        doc.setFont('helvetica', 'italic');
        doc.text(trainerName, 110, sigY - 2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.setFontSize(8);
        doc.text('Reviewer Digital Signature', 110, sigY + 5);
        doc.text(`Date & Time: ${formatSignatureDate(evaluation.reviewedAt)}`, 110, sigY + 10);
      } else {
        doc.addPage();
        doc.setFontSize(12);
        doc.text('Reviewer Feedback', 14, 20);
        doc.setFontSize(10);
        doc.text(`Overall Comments: ${evaluation.overallComments || 'None'}`, 14, 28);
        doc.text(`Strengths: ${evaluation.strengths || 'None'}`, 14, 36);
        doc.text(`Areas for Improvement: ${evaluation.improvements || 'None'}`, 14, 44);
        doc.text(`Reviewer: ${trainerName}`, 14, 52);

        // Digital Signatures on new page
        const sigY = 80;
        // Employee Signature
        doc.setDrawColor(200);
        doc.line(14, sigY, 90, sigY);
        doc.setFontSize(10);
        doc.setTextColor(primaryColor);
        doc.setFont('helvetica', 'italic');
        doc.text(user?.displayName || 'N/A', 14, sigY - 2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.setFontSize(8);
        doc.text('Employee Digital Signature', 14, sigY + 5);
        doc.text(`Date & Time: ${formatSignatureDate(submission.submittedAt)}`, 14, sigY + 10);
        
        // Reviewer Signature
        doc.line(110, sigY, 186, sigY);
        doc.setTextColor(primaryColor);
        doc.setFont('helvetica', 'italic');
        doc.text(trainerName, 110, sigY - 2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.setFontSize(8);
        doc.text('Reviewer Digital Signature', 110, sigY + 5);
        doc.text(`Date & Time: ${formatSignatureDate(evaluation.reviewedAt)}`, 110, sigY + 10);
      }

      const userName = (user?.displayName || 'Unknown').replace(/\s+/g, '_');
      const templateName = (template?.name || 'Assessment').replace(/\s+/g, '_');
      doc.save(`Final_Report_${userName}_${templateName}.pdf`);
      toast.success('Report downloaded successfully.');
      await firestoreService.logActivity('Downloaded Evaluation Report', 'Assessments', { submissionId: submission.id }, user?.uid, user?.email);
    } catch (error: any) {
      console.error('Evaluation report download failed:', error);
      toast.error(error.message || 'Failed to download evaluation report.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64">Loading your data...</div>;

  return (
    <div className="space-y-12 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Learning Portal</h1>
          <p className="text-muted-foreground mt-1">Manage your assessments, view results, and track your progress.</p>
        </div>
      </div>

      {/* Active Assessments Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-2 border-b pb-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">Active Assessments</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assignments.length > 0 ? (
            assignments.map((assignment) => (
              <div key={assignment.id} className="bg-card rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
                <div className="p-6 flex-1">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <ClipboardList className="w-5 h-5 text-primary" />
                    </div>
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      assignment.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                    )}>
                      {assignment.status}
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-bold mb-2">{assignment.template?.name || 'Untitled Assessment'}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {assignment.template?.description || 'No description provided.'}
                  </p>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span>Due: {formatDate(assignment.dueDate)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{assignment.template?.questions.length || 0} Questions</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-muted/30 border-t">
                  <Link 
                    to={`/portal/${assignment.id}`}
                    className={cn(
                      "w-full py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2",
                      (assignment as any).submission ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-primary text-primary-foreground hover:opacity-90"
                    )}
                  >
                    <span>{(assignment as any).submission ? 'Resume Assessment' : 'Start Assessment'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-12 text-center bg-card rounded-2xl border border-dashed">
              <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <ClipboardList className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No assessments assigned</h3>
              <p className="text-muted-foreground mt-1">You're all caught up! Check back later for new assignments.</p>
            </div>
          )}
        </div>
      </section>

      {/* Results Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-2 border-b pb-2">
          <CheckCircle2 className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">Final Assessment Results</h2>
        </div>
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border">
            <div className="flex flex-1 w-full gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input 
                  type="text"
                  placeholder="Search by assessment name..."
                  className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  value={tempSearch}
                  onChange={(e) => setTempSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setSearchQuery(tempSearch)}
                />
              </div>
              <button 
                onClick={() => setSearchQuery(tempSearch)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <Search className="w-4 h-4" />
                <span>Search</span>
              </button>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <input 
                  type="date"
                  className="px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="text-muted-foreground">to</span>
                <input 
                  type="date"
                  className="px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <select 
                  className="px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                >
                  <option value="all">All Results</option>
                  <option value="pass">Passed</option>
                  <option value="fail">Failed</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">S.No</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Assessment</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Submitted Date</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Score</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Result</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredResults.length > 0 ? (
                    filteredResults.map((item, index) => (
                      <tr key={item.submission.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium">{item.template?.name || 'Unknown Assessment'}</div>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {formatDate(item.submission.submittedAt)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            item.submission.status === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                          )}>
                            {item.submission.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold">
                            {item.evaluation ? `${item.evaluation.finalScore.toFixed(1)}%` : 'Pending'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {item.evaluation ? (
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              item.evaluation.result === 'pass' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                            )}>
                              {item.evaluation.result}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Under Review</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => handleViewReport(item)}
                              className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                              title="View Report"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {item.evaluation && (
                              <button 
                                onClick={() => handleDownloadIndividualReport(item)}
                                disabled={exporting}
                                className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-primary disabled:opacity-50"
                                title="Download Final Report"
                              >
                                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        No results found matching your criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Result Details Modal */}
      {selectedResult && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-4">
                <BrandLogo size="md" />
                <div>
                  <h2 className="text-xl font-bold">{selectedResult.template?.name || 'Assessment Details'}</h2>
                  <p className="text-xs text-muted-foreground">Submitted on {formatDateTime(selectedResult.submission.submittedAt)}</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setSelectedResult(null);
                  setModalExtraData(null);
                }}
                className="p-2 hover:bg-accent rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 space-y-8">
              {/* Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider border-b pb-1">Employee Information</h4>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{user?.displayName || 'N/A'}</span>
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-medium">{user?.email || 'N/A'}</span>
                    <span className="text-muted-foreground">Department:</span>
                    <span className="font-medium">{modalExtraData?.deptName || 'Loading...'}</span>
                    <span className="text-muted-foreground">Designation:</span>
                    <span className="font-medium">{user?.designation || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">SOP Name:</span>
                    <span className="font-medium">{selectedResult.template?.name || 'N/A'}</span>
                    <span className="text-muted-foreground">Trainer Name:</span>
                    <span className="font-medium">{modalExtraData?.reviewerName || 'Loading...'}</span>
                    <span className="text-muted-foreground">Submitted At:</span>
                    <span className="font-medium">{formatDateTime(selectedResult.submission.submittedAt)}</span>
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="font-medium">
                      {Math.floor(selectedResult.submission.durationTaken / 60)}m {selectedResult.submission.durationTaken % 60}s
                    </span>
                  </div>
                </div>
              </div>

              {/* SOP Overview */}
              {selectedResult.template?.description && (
                <div className="bg-muted/10 p-6 rounded-xl border">
                  <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Template Details</p>
                  <p className="text-sm text-foreground">{selectedResult.template.description}</p>
                </div>
              )}

              {/* Summary Section */}
              <div className="bg-muted/30 rounded-2xl p-6 flex items-center justify-around border shadow-sm">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-2">Final Result</p>
                  <span className={cn(
                    "px-6 py-2 rounded-full text-xl font-bold shadow-sm",
                    selectedResult.evaluation?.result === 'pass' 
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200" 
                      : "bg-rose-100 text-rose-700 border border-rose-200"
                  )}>
                    {selectedResult.evaluation?.result?.toUpperCase() || 'PENDING'}
                  </span>
                </div>
                <div className="w-px h-16 bg-border" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-2">Final Score</p>
                  <span className="text-4xl font-black text-primary">
                    {selectedResult.evaluation ? `${selectedResult.evaluation.finalScore.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
              </div>

              {selectedResult.evaluation ? (
                <>
                  {/* Detailed Results Table */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-primary" />
                      Detailed SOP Results
                    </h4>
                    <div className="border rounded-xl overflow-hidden shadow-sm">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-muted/50 border-b">
                          <tr>
                            <th className="px-4 py-3 font-bold w-12 text-center">#</th>
                            <th className="px-4 py-3 font-bold">Question</th>
                            <th className="px-4 py-3 font-bold">Employee Answer</th>
                            <th className="px-4 py-3 font-bold w-32 text-center">Status</th>
                            <th className="px-4 py-3 font-bold">Comments</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {selectedResult.template?.questions.map((q, index) => {
                            const score = selectedResult.evaluation?.questionScores[q.id] || 0;
                            const isCorrect = score > 0;
                            const answer = selectedResult.submission.answers[q.id];
                            
                            const formatAnswer = (ans: any) => {
                              if (ans === undefined || ans === null) return '-';
                              if (typeof ans === 'string') return ans;
                              if (Array.isArray(ans)) return ans.join(', ');
                              if (typeof ans === 'object' && ans.name) return `File: ${ans.name}`;
                              return String(ans);
                            };

                            return (
                              <tr key={q.id} className="hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-3 text-center text-muted-foreground">{index + 1}</td>
                                <td className="px-4 py-3 font-medium">{q.text}</td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {formatAnswer(answer)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                    isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                                  )}>
                                    {isCorrect ? 'Correct' : 'Wrong'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground italic text-xs">
                                  {selectedResult.evaluation?.questionComments[q.id] || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Reviewer Feedback */}
                  <div className="space-y-6 bg-primary/5 p-6 rounded-2xl border border-primary/10">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      Reviewer Feedback
                    </h4>
                    <div className="grid grid-cols-1 gap-6">
                      <div>
                        <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Overall Comments</p>
                        <div className="p-4 bg-background rounded-xl border italic text-sm text-muted-foreground">
                          "{selectedResult.evaluation.overallComments || 'No overall comments provided.'}"
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <p className="text-xs font-bold uppercase text-emerald-600 mb-2">Key Strengths</p>
                          <div className="p-4 bg-emerald-50/50 rounded-xl text-sm text-emerald-800 border border-emerald-100">
                            {selectedResult.evaluation.strengths || 'No strengths noted.'}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase text-amber-600 mb-2">Areas for Improvement</p>
                          <div className="p-4 bg-amber-50/50 rounded-xl text-sm text-amber-800 border border-amber-100">
                            {selectedResult.evaluation.improvements || 'No improvements noted.'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="pt-6 border-t flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                            {(modalExtraData?.reviewerName || 'U').charAt(0)}
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold">Evaluated by</p>
                            <p className="text-sm font-bold">{modalExtraData?.reviewerName || 'Loading...'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold">Reviewed on</p>
                          <p className="text-sm font-medium">{selectedResult.evaluation.reviewedAt ? formatDateTime(selectedResult.evaluation.reviewedAt) : 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Re-assessment Status */}
                  <div className={cn(
                    "p-4 rounded-xl border flex items-center justify-between",
                    selectedResult.evaluation.retestRequired ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
                  )}>
                    <div className="flex items-center gap-3">
                      <RotateCcw className={cn("w-5 h-5", selectedResult.evaluation.retestRequired ? "text-amber-600" : "text-emerald-600")} />
                      <div>
                        <p className="text-sm font-bold">Re-assessment Status</p>
                        <p className="text-xs text-muted-foreground">Based on current performance evaluation</p>
                      </div>
                    </div>
                    <span className={cn(
                      "px-4 py-1 rounded-full text-xs font-bold uppercase",
                      selectedResult.evaluation.retestRequired ? "bg-amber-200 text-amber-800" : "bg-emerald-200 text-emerald-800"
                    )}>
                      {selectedResult.evaluation.retestRequired ? 'Required' : 'Not Required'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center py-20 bg-muted/30 rounded-2xl border border-dashed">
                  <Clock className="w-16 h-16 text-muted-foreground mx-auto mb-4 animate-pulse" />
                  <h3 className="text-xl font-bold">Under Review</h3>
                  <p className="text-muted-foreground mt-2 max-w-md mx-auto">Your assessment is currently being reviewed by an administrator. Please check back later for your final score and feedback.</p>
                </div>
              )}
            </div>

            <div className="p-6 bg-muted/30 border-t flex justify-between items-center">
              {selectedResult.evaluation && (
                <button 
                  onClick={() => handleDownloadIndividualReport(selectedResult)}
                  disabled={exporting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>Download Report (PDF)</span>
                </button>
              )}
              <button 
                onClick={() => {
                  setSelectedResult(null);
                  setModalExtraData(null);
                }}
                className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-primary/20"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
