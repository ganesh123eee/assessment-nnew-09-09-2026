import React, { useState, useEffect } from 'react';
import { 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Search,
  Filter,
  Loader2,
  Eye,
  X,
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  User,
  Award,
  Calendar,
  Layers,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDate, formatDateTime, formatSignatureDate, formatId } from '../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import { firestoreService, where } from '../services/firestoreService';
import { Submission, Evaluation, Template, Assignment, User as UserType, Department, TrainingRegister } from '../types';
import { drawPdfBrandingHeader } from '../utils/pdfBranding';

export default function Reports() {
  const { user: currentUser, branding } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [previewData, setPreviewData] = useState<{ title: string; headers: string[]; rows: any[] } | null>(null);
  const [selectedIndividualReport, setSelectedIndividualReport] = useState<any>(null);
  
  // Tab navigation
  const [activeReportTab, setActiveReportTab] = useState<'summary' | 'custom'>('summary');

  // User Summary Report State
  const [summaryUserId, setSummaryUserId] = useState<string>('all');
  const [summaryUserFilterText, setSummaryUserFilterText] = useState<string>('');
  const [summaryDateRange, setSummaryDateRange] = useState<string>('all');
  const [summaryStartDate, setSummaryStartDate] = useState<string>('');
  const [summaryEndDate, setSummaryEndDate] = useState<string>('');
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const [summaryReportData, setSummaryReportData] = useState<{
    userName: string;
    employeeId: string;
    email: string;
    departmentName: string;
    totalAssigned: number;
    totalCompleted: number;
    totalPass: number;
    totalFail: number;
    totalPending: number;
    passRate: string;
    items: Array<{
      sNo: number;
      title: string;
      type: string;
      assignedDate: string;
      completedDate: string;
      score: string;
      status: 'Pass' | 'Fail' | 'Pending Review' | 'In Progress' | 'Not Started';
      reviewer: string;
      employeeName?: string;
    }>;
  } | null>(null);

  const [filters, setFilters] = useState({
    dateRange: 'all',
    startDate: '',
    endDate: '',
    departmentId: 'all',
    templateId: 'all',
    userId: 'all',
    status: 'all'
  });

  useEffect(() => {
    const loadFilters = async () => {
      const [depts, temps, allUsers] = await Promise.all([
        firestoreService.getCollection<Department>('departments'),
        firestoreService.getCollection<Template>('templates'),
        firestoreService.getCollection<UserType>('users')
      ]);
      setDepartments(depts);
      setTemplates(temps);
      setUsers(allUsers);
      handleGenerateSummaryReport(allUsers, depts, temps);
    };
    loadFilters();
  }, []);

  const applyFilters = (subs: Submission[], evals: Evaluation[], allUsers: UserType[], assigns: Assignment[]) => {
    let filteredSubs = [...subs];
    let filteredEvals = [...evals];

    // Filter by User
    if (filters.userId !== 'all') {
      filteredSubs = filteredSubs.filter(s => s.employeeId === filters.userId);
    }

    // Filter by Department
    if (filters.departmentId !== 'all') {
      const deptUsers = allUsers.filter(u => u.departmentId === filters.departmentId).map(u => u.uid);
      filteredSubs = filteredSubs.filter(s => deptUsers.includes(s.employeeId));
    }

    // Filter by Template
    if (filters.templateId !== 'all') {
      const templateAssigns = assigns.filter(a => a.templateId === filters.templateId).map(a => a.id);
      filteredSubs = filteredSubs.filter(s => templateAssigns.includes(s.assignmentId));
    }

    // Filter by Status
    if (filters.status !== 'all') {
      if (filters.status === 'pass' || filters.status === 'fail') {
        filteredEvals = filteredEvals.filter(e => e.result === filters.status);
        filteredSubs = filteredSubs.filter(s => filteredEvals.some(e => e.submissionId === s.id));
      } else if (filters.status === 'retest') {
        filteredEvals = filteredEvals.filter(e => e.retestRequired);
        filteredSubs = filteredSubs.filter(s => filteredEvals.some(e => e.submissionId === s.id));
      }
    }

    // Filter by Date
    if (filters.dateRange !== 'all' && filters.dateRange !== 'custom') {
      const now = new Date();
      let startDate = new Date();
      if (filters.dateRange === '30') startDate.setDate(now.getDate() - 30);
      else if (filters.dateRange === '90') startDate.setDate(now.getDate() - 90);
      else if (filters.dateRange === '365') startDate.setDate(now.getDate() - 365);
      
      filteredSubs = filteredSubs.filter(s => new Date(s.submittedAt) >= startDate);
    } else if (filters.dateRange === 'custom' && filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      filteredSubs = filteredSubs.filter(s => {
        const date = new Date(s.submittedAt);
        return date >= start && date <= end;
      });
    }

    return { filteredSubs, filteredEvals };
  };

  const handleView = async (reportType: string) => {
    setExporting(true);
    try {
      const [subs, evals, allUsers, depts, temps, assigns] = await Promise.all([
        firestoreService.getCollection<Submission>('submissions'),
        firestoreService.getCollection<Evaluation>('reviews'),
        firestoreService.getCollection<UserType>('users'),
        firestoreService.getCollection<Department>('departments'),
        firestoreService.getCollection<Template>('templates'),
        firestoreService.getCollection<Assignment>('assignments')
      ]);

      let { filteredSubs, filteredEvals } = applyFilters(subs, evals, allUsers, assigns);

      // Sort by date descending (Date-wise)
      filteredSubs.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      let data: any[] = [];
      let headers: string[] = [];

      if (reportType === 'Employee Report' || reportType === 'Custom Report') {
        headers = ['S.No', 'Employee ID', 'Employee Name', 'Department', 'Assessment', 'Submitted At', 'Score', 'Result', 'Reviewer', 'Actions'];
        data = filteredSubs.map((s, index) => {
          const user = allUsers.find(u => u.uid === s.employeeId);
          const dept = depts.find(d => d.id === user?.departmentId);
          const evalData = filteredEvals.find(e => e.submissionId === s.id);
          const assign = assigns.find(a => a.id === s.assignmentId);
          const template = temps.find(t => t.id === (s.templateId || assign?.templateId));
          const reviewer = allUsers.find(u => u.uid === evalData?.reviewerId);
          
          return [
            index + 1,
            user?.employeeId || 'N/A',
            user?.displayName || 'Unknown',
            dept?.name || 'N/A',
            template?.name || 'Unknown',
            formatDate(s.submittedAt),
            evalData ? evalData.finalScore.toFixed(1) : '-',
            evalData?.result || 'Pending',
            reviewer?.displayName === 'System Admin' ? (user?.displayName || 'Super Admin') : (reviewer?.displayName || '-'),
            { type: 'action', submissionId: s.id, disabled: !evalData }
          ];
        });
      } else if (reportType === 'Department Report') {
        headers = ['S.No', 'Department', 'Total Assessments', 'Completed', 'Pass Rate (%)', 'Avg Score'];
        data = depts.map((d, index) => {
          const deptUsers = allUsers.filter(u => u.departmentId === d.id).map(u => u.uid);
          const deptSubs = filteredSubs.filter(s => deptUsers.includes(s.employeeId));
          const deptEvals = filteredEvals.filter(e => deptSubs.some(s => s.id === e.submissionId));
          
          const total = deptSubs.length;
          const completed = deptSubs.filter(s => s.status === 'completed').length;
          const passes = deptEvals.filter(e => e.result === 'pass').length;
          const avgScore = deptEvals.length > 0 
            ? (deptEvals.reduce((sum, e) => sum + e.finalScore, 0) / deptEvals.length).toFixed(1)
            : '0';
          
          return [
            index + 1,
            d.name,
            total,
            completed,
            total > 0 ? ((passes / total) * 100).toFixed(1) : '0',
            avgScore
          ];
        });
      } else if (reportType === 'Assessment Report') {
        headers = ['S.No', 'Assessment Name', 'Trainer Name', 'Difficulty', 'Total Attempts', 'Avg Score', 'Pass Rate (%)'];
        data = temps.map((t, index) => {
          const templateAssigns = assigns.filter(a => a.templateId === t.id).map(a => a.id);
          const templateSubs = filteredSubs.filter(s => templateAssigns.includes(s.assignmentId));
          const templateEvals = filteredEvals.filter(e => templateSubs.some(s => s.id === e.submissionId));
          
          const total = templateSubs.length;
          const passes = templateEvals.filter(e => e.result === 'pass').length;
          const avgScore = templateEvals.length > 0 
            ? (templateEvals.reduce((sum, e) => sum + e.finalScore, 0) / templateEvals.length).toFixed(1)
            : '0';
 
          const reviewerId = templateEvals[0]?.reviewerId || (assigns.find(a => a.templateId === t.id)?.reviewerId);
          const reviewer = allUsers.find(u => u.uid === reviewerId);
          const trainerName = reviewer?.displayName || 'N/A';
 
          return [
            index + 1,
            t.name,
            trainerName,
            t.difficulty,
            total,
            avgScore,
            total > 0 ? ((passes / total) * 100).toFixed(1) : '0'
          ];
        });
      } else {
        headers = ['S.No', 'Reviewer', 'Pending Reviews', 'Completed Reviews', 'Avg Score Given'];
        const reviewers = allUsers.filter(u => u.role === 'reviewer' || u.role === 'hr_admin');
        data = reviewers.map((r, index) => {
          const reviewerEvals = filteredEvals.filter(e => e.reviewerId === r.uid);
          const pending = filteredSubs.filter(s => {
            const assign = assigns.find(a => a.id === s.assignmentId);
            return assign?.reviewerId === r.uid && s.status === 'submitted';
          }).length;
 
          const avgScore = reviewerEvals.length > 0
            ? (reviewerEvals.reduce((sum, e) => sum + e.finalScore, 0) / reviewerEvals.length).toFixed(1)
            : '0';
 
          return [
            index + 1,
            r.displayName,
            pending,
            reviewerEvals.length,
            avgScore
          ];
        });
      }

      setPreviewData({ title: reportType, headers, rows: data });
      await firestoreService.logActivity('Viewed Report', 'Reports', { reportType }, currentUser?.uid, currentUser?.email);
    } catch (error) {
      console.error('View failed:', error);
      toast.error('Failed to load report preview.');
    } finally {
      setExporting(false);
    }
  };

  const fetchIndividualReportData = async (submissionId: string) => {
    if (!submissionId) {
      throw new Error('Invalid submission ID provided.');
    }
    console.log('Fetching data for submission:', submissionId);
    const submission = await firestoreService.getDocument<Submission>('submissions', submissionId);
    if (!submission) {
      throw new Error('Submission not found.');
    }

    const evaluations = await firestoreService.getCollection<Evaluation>('reviews', [
      where('submissionId', '==', submissionId)
    ]);

    const evaluation = evaluations[0];
    if (!evaluation) {
      throw new Error('Evaluation report not found for this submission.');
    }

    const [user, assignment] = await Promise.all([
      submission.employeeId ? firestoreService.getDocument<UserType>('users', submission.employeeId) : Promise.resolve(null),
      submission.assignmentId ? firestoreService.getDocument<Assignment>('assignments', submission.assignmentId) : Promise.resolve(null)
    ]);

    const templateId = submission.templateId || assignment?.templateId;
    if (!templateId) {
      console.error('Missing template ID. Submission:', submission, 'Assignment:', assignment);
      throw new Error('Template ID not found in submission or assignment.');
    }

    const template = await firestoreService.getDocument<Template>('templates', templateId);
    if (!template) {
      throw new Error('Assessment template not found.');
    }

    const reviewer = await firestoreService.getDocument<UserType>('users', evaluation.reviewerId);
    const dept = user?.departmentId ? await firestoreService.getDocument<Department>('departments', user.departmentId) : null;

    return { submission, evaluation, user, assignment, template, reviewer, dept };
  };

  const viewIndividualReport = async (submissionId: string) => {
    setExporting(true);
    try {
      const data = await fetchIndividualReportData(submissionId);
      setSelectedIndividualReport(data);
      await firestoreService.logActivity('Viewed Evaluation Report', 'Reports', { submissionId }, currentUser?.uid, currentUser?.email);
    } catch (error: any) {
      console.error('Evaluation report view failed:', error);
      toast.error(error.message || 'Failed to load evaluation report.');
    } finally {
      setExporting(false);
    }
  };

  const downloadIndividualReport = async (submissionId: string) => {
    setExporting(true);
    try {
      const { submission, evaluation, user, assignment, template, reviewer, dept } = await fetchIndividualReportData(submissionId);

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
      doc.text(`Employee Information`, 14, infoHeaderY);
      doc.text(`SOP Information`, 110, infoHeaderY);

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
        doc.text(`Reviewer: ${reviewer?.displayName === 'System Admin' ? (user?.displayName || 'Super Admin') : (reviewer?.displayName || 'Unknown')}`, 14, finalY + 32);
        
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
        const reviewerDisplay = reviewer?.displayName === 'System Admin' ? (user?.displayName || 'Super Admin') : (reviewer?.displayName || 'Unknown');
        doc.line(110, sigY, 186, sigY);
        doc.setTextColor(primaryColor);
        doc.setFont('helvetica', 'italic');
        doc.text(reviewerDisplay, 110, sigY - 2);
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
        doc.text(`Reviewer: ${reviewer?.displayName === 'System Admin' ? (user?.displayName || 'Super Admin') : (reviewer?.displayName || 'Unknown')}`, 14, 52);

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
        const reviewerDisplay = reviewer?.displayName === 'System Admin' ? (user?.displayName || 'Super Admin') : (reviewer?.displayName || 'Unknown');
        doc.line(110, sigY, 186, sigY);
        doc.setTextColor(primaryColor);
        doc.setFont('helvetica', 'italic');
        doc.text(reviewerDisplay, 110, sigY - 2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.setFontSize(8);
        doc.text('Reviewer Digital Signature', 110, sigY + 5);
        doc.text(`Date & Time: ${formatSignatureDate(evaluation.reviewedAt)}`, 110, sigY + 10);
      }

      const userName = (user?.displayName || 'Unknown').replace(/\s+/g, '_');
      const templateName = (template?.name || 'Assessment').replace(/\s+/g, '_');
      doc.save(`Report_${userName}_${templateName}.pdf`);
      await firestoreService.logActivity('Downloaded Evaluation Report', 'Reports', { submissionId }, currentUser?.uid, currentUser?.email);

    } catch (error: any) {
      console.error('Evaluation report download failed:', error);
      toast.error(error.message || 'Failed to download evaluation report.');
    } finally {
      setExporting(false);
    }
  };

  const handleExport = async (reportType: string, format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      const [subs, evals, allUsers, depts, temps, assigns] = await Promise.all([
        firestoreService.getCollection<Submission>('submissions'),
        firestoreService.getCollection<Evaluation>('reviews'),
        firestoreService.getCollection<UserType>('users'),
        firestoreService.getCollection<Department>('departments'),
        firestoreService.getCollection<Template>('templates'),
        firestoreService.getCollection<Assignment>('assignments')
      ]);

      let { filteredSubs, filteredEvals } = applyFilters(subs, evals, allUsers, assigns);

      // Sort by date descending (Date-wise)
      filteredSubs.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      let data: any[] = [];
      let headers: string[] = [];
      let filename = `${reportType.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;

      if (reportType === 'Employee Report' || reportType === 'Custom Report') {
        headers = ['S.No', 'Employee ID', 'Employee Name', 'Department', 'Assessment', 'Submitted At', 'Reviewed On', 'Score', 'Result', 'Reviewer'];
        data = filteredSubs.map((s, index) => {
          const user = allUsers.find(u => u.uid === s.employeeId);
          const dept = depts.find(d => d.id === user?.departmentId);
          const evalData = filteredEvals.find(e => e.submissionId === s.id);
          const assign = assigns.find(a => a.id === s.assignmentId);
          const template = temps.find(t => t.id === (s.templateId || assign?.templateId));
          const reviewer = allUsers.find(u => u.uid === evalData?.reviewerId);
          
          return [
            index + 1,
            user?.employeeId || 'N/A',
            user?.displayName || 'Unknown',
            dept?.name || 'N/A',
            template?.name || 'Unknown',
            formatDate(s.submittedAt),
            evalData ? formatDate(evalData.reviewedAt) : '-',
            evalData ? evalData.finalScore.toFixed(1) : '-',
            evalData?.result || 'Pending',
            reviewer?.displayName === 'System Admin' ? (user?.displayName || 'Super Admin') : (reviewer?.displayName || '-')
          ];
        });
      } else if (reportType === 'Department Report') {
        headers = ['S.No', 'Department', 'Total Assessments', 'Completed', 'Pass Rate (%)', 'Avg Score'];
        data = depts.map((d, index) => {
          const deptUsers = allUsers.filter(u => u.departmentId === d.id).map(u => u.uid);
          const deptSubs = filteredSubs.filter(s => deptUsers.includes(s.employeeId));
          const deptEvals = filteredEvals.filter(e => deptSubs.some(s => s.id === e.submissionId));
          
          const total = deptSubs.length;
          const completed = deptSubs.filter(s => s.status === 'completed').length;
          const passes = deptEvals.filter(e => e.result === 'pass').length;
          const avgScore = deptEvals.length > 0 
            ? (deptEvals.reduce((sum, e) => sum + e.finalScore, 0) / deptEvals.length).toFixed(1)
            : '0';
          
          return [
            index + 1,
            d.name,
            total,
            completed,
            total > 0 ? ((passes / total) * 100).toFixed(1) : '0',
            avgScore
          ];
        });
      } else if (reportType === 'Assessment Report') {
        headers = ['S.No', 'Assessment Name', 'Trainer Name', 'Difficulty', 'Total Attempts', 'Avg Score', 'Pass Rate (%)'];
        data = temps.map((t, index) => {
          const templateAssigns = assigns.filter(a => a.templateId === t.id).map(a => a.id);
          const templateSubs = filteredSubs.filter(s => templateAssigns.includes(s.assignmentId));
          const templateEvals = filteredEvals.filter(e => templateSubs.some(s => s.id === e.submissionId));
          
          const total = templateSubs.length;
          const passes = templateEvals.filter(e => e.result === 'pass').length;
          const avgScore = templateEvals.length > 0 
            ? (templateEvals.reduce((sum, e) => sum + e.finalScore, 0) / templateEvals.length).toFixed(1)
            : '0';
 
          const reviewerId = templateEvals[0]?.reviewerId || (assigns.find(a => a.templateId === t.id)?.reviewerId);
          const reviewer = allUsers.find(u => u.uid === reviewerId);
          const trainerName = reviewer?.displayName || 'N/A';
 
          return [
            index + 1,
            t.name,
            trainerName,
            t.difficulty,
            total,
            avgScore,
            total > 0 ? ((passes / total) * 100).toFixed(1) : '0'
          ];
        });
      } else {
        // Fallback for Reviewer Report
        headers = ['S.No', 'Reviewer', 'Pending Reviews', 'Completed Reviews', 'Avg Score Given'];
        const reviewers = allUsers.filter(u => u.role === 'reviewer' || u.role === 'hr_admin');
        data = reviewers.map((r, index) => {
          const reviewerEvals = filteredEvals.filter(e => e.reviewerId === r.uid);
          const pending = filteredSubs.filter(s => {
            const assign = assigns.find(a => a.id === s.assignmentId);
            return assign?.reviewerId === r.uid && s.status === 'submitted';
          }).length;
 
          const avgScore = reviewerEvals.length > 0
            ? (reviewerEvals.reduce((sum, e) => sum + e.finalScore, 0) / reviewerEvals.length).toFixed(1)
            : '0';
 
          return [
            index + 1,
            r.displayName,
            pending,
            reviewerEvals.length,
            avgScore
          ];
        });
      }

      if (format === 'excel') {
        const wsData = [
          [branding.companyName || branding.appName],
          [reportType],
          [`Generated on: ${formatDateTime(new Date())}`],
          [],
          headers,
          ...data
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        XLSX.writeFile(wb, `${filename}.xlsx`);
      } else {
        const doc = new jsPDF();
        
        // Add consistent Branding preserving aspect ratio
        const { nextY } = await drawPdfBrandingHeader(doc, branding, {
          margin: 14,
          topY: 10,
          rightHeaderText: 'Summary Report',
          showDivider: true
        });

        doc.setFontSize(13);
        doc.setTextColor(branding.primaryColor || '#0f172a');
        doc.text(reportType, 14, nextY + 3);

        doc.setFontSize(8.5);
        doc.setTextColor(120);
        doc.text(`Generated on: ${formatDateTime(new Date())}`, 14, nextY + 8);

        autoTable(doc, {
          head: [headers],
          body: data,
          startY: nextY + 12,
          theme: 'grid',
          styles: { fontSize: 8 }
        });
        doc.save(`${filename}.pdf`);
      }
      await firestoreService.logActivity('Exported Report', 'Reports', { reportType, format }, currentUser?.uid, currentUser?.email);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to generate report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleGenerateSummaryReport = async (
    overrideUsers?: UserType[],
    overrideDepts?: Department[],
    overrideTemps?: Template[]
  ) => {
    setSummaryLoading(true);
    try {
      const [allUsers, depts, temps, assigns, subs, evals, regList] = await Promise.all([
        overrideUsers ? Promise.resolve(overrideUsers) : firestoreService.getCollection<UserType>('users'),
        overrideDepts ? Promise.resolve(overrideDepts) : firestoreService.getCollection<Department>('departments'),
        overrideTemps ? Promise.resolve(overrideTemps) : firestoreService.getCollection<Template>('templates'),
        firestoreService.getCollection<Assignment>('assignments'),
        firestoreService.getCollection<Submission>('submissions'),
        firestoreService.getCollection<Evaluation>('reviews'),
        firestoreService.getCollection<TrainingRegister>('training_registers')
      ]);

      const selectedUser = summaryUserId !== 'all' ? allUsers.find(u => u.uid === summaryUserId) : null;
      const targetUsers = selectedUser ? [selectedUser] : allUsers.filter(u => u.status === 'active' || !u.status);
      const userDept = depts.find(d => d.id === selectedUser?.departmentId);

      // Date filtering calculation
      let filterStartDate: Date | null = null;
      let filterEndDate: Date | null = null;
      const now = new Date();

      if (summaryDateRange === '30') {
        filterStartDate = new Date();
        filterStartDate.setDate(now.getDate() - 30);
      } else if (summaryDateRange === '90') {
        filterStartDate = new Date();
        filterStartDate.setDate(now.getDate() - 90);
      } else if (summaryDateRange === '365') {
        filterStartDate = new Date();
        filterStartDate.setDate(now.getDate() - 365);
      } else if (summaryDateRange === 'custom' && summaryStartDate && summaryEndDate) {
        filterStartDate = new Date(summaryStartDate);
        filterEndDate = new Date(summaryEndDate);
        filterEndDate.setHours(23, 59, 59, 999);
      }

      const isDateInRange = (dateStr?: string) => {
        if (!dateStr || !filterStartDate) return true;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return true;
        if (filterStartDate && d < filterStartDate) return false;
        if (filterEndDate && d > filterEndDate) return false;
        return true;
      };

      let items: Array<{
        sNo: number;
        title: string;
        type: string;
        assignedDate: string;
        completedDate: string;
        score: string;
        status: 'Pass' | 'Fail' | 'Pending Review' | 'In Progress' | 'Not Started';
        reviewer: string;
        employeeName?: string;
      }> = [];

      let totalAssigned = 0;
      let totalCompleted = 0;
      let totalPass = 0;
      let totalFail = 0;
      let totalPending = 0;

      for (const u of targetUsers) {
        // 1. Process Assessment Assignments
        const userAssigns = assigns.filter(a => {
          if (a.type === 'individual' && a.targetIds?.includes(u.uid)) return true;
          if (a.type === 'department' && u.departmentId && a.targetIds?.includes(u.departmentId)) return true;
          if (a.targetIds?.includes(u.uid)) return true;
          return false;
        });

        for (const assign of userAssigns) {
          if (!isDateInRange(assign.createdAt || assign.startDate)) continue;

          totalAssigned++;
          const template = temps.find(t => t.id === assign.templateId);
          const reviewer = allUsers.find(ru => ru.uid === assign.reviewerId);
          const userSub = subs.find(s => s.assignmentId === assign.id && s.employeeId === u.uid);
          const evaluation = userSub ? evals.find(e => e.submissionId === userSub.id) : null;

          let status: 'Pass' | 'Fail' | 'Pending Review' | 'In Progress' | 'Not Started' = 'Not Started';
          let scoreStr = '-';
          let completedDateStr = '-';

          if (evaluation) {
            if (evaluation.result === 'pass') {
              status = 'Pass';
              totalPass++;
              totalCompleted++;
            } else {
              status = 'Fail';
              totalFail++;
              totalCompleted++;
            }
            scoreStr = `${evaluation.finalScore !== undefined ? evaluation.finalScore.toFixed(1) : 0}%`;
            completedDateStr = formatDate(evaluation.reviewedAt || userSub?.submittedAt);
          } else if (userSub) {
            if (userSub.status === 'submitted' || userSub.status === 'under_review') {
              status = 'Pending Review';
              totalPending++;
              completedDateStr = formatDate(userSub.submittedAt);
            } else if (userSub.status === 'in_progress') {
              status = 'In Progress';
              totalPending++;
            } else {
              status = 'Not Started';
              totalPending++;
            }
          } else {
            status = 'Not Started';
            totalPending++;
          }

          items.push({
            sNo: items.length + 1,
            title: template?.name || 'Assessment Test',
            type: 'Assessment Test',
            assignedDate: formatDate(assign.createdAt || assign.startDate),
            completedDate: completedDateStr,
            score: scoreStr,
            status,
            reviewer: reviewer?.displayName || 'Assigned Reviewer',
            employeeName: u.displayName
          });
        }

        // 2. Process Training Registers
        for (const reg of regList) {
          const attendee = reg.attendees?.find(
            att => (att.employeeId && (att.employeeId === u.uid || att.employeeId === u.employeeId)) ||
                   (att.email && att.email.toLowerCase().trim() === u.email?.toLowerCase().trim())
          );

          if (attendee) {
            if (!isDateInRange(reg.date || reg.createdAt)) continue;

            totalAssigned++;
            const isSigned = attendee.status === 'signed' || Boolean(attendee.signatureData);
            let status: 'Pass' | 'Fail' | 'Pending Review' | 'In Progress' | 'Not Started' = 'Not Started';

            if (isSigned) {
              status = 'Pass';
              totalPass++;
              totalCompleted++;
            } else if (reg.workflowStatus === 'in_progress') {
              status = 'In Progress';
              totalPending++;
            } else {
              status = 'Not Started';
              totalPending++;
            }

            items.push({
              sNo: items.length + 1,
              title: reg.trainingTitle || 'Training Register Session',
              type: 'Training Register',
              assignedDate: reg.date || formatDate(reg.createdAt),
              completedDate: isSigned ? (attendee.signedDate || formatDate(attendee.signedAt || reg.date)) : '-',
              score: isSigned ? 'Completed' : '-',
              status,
              reviewer: reg.trainerName || 'Trainer',
              employeeName: u.displayName
            });
          }
        }
      }

      const passRate = totalCompleted > 0 ? ((totalPass / totalCompleted) * 100).toFixed(1) : '0';

      setSummaryReportData({
        userName: selectedUser ? selectedUser.displayName : 'All Employees (Organization-wide)',
        employeeId: selectedUser?.employeeId || (selectedUser ? 'N/A' : 'ALL'),
        email: selectedUser?.email || 'All Accounts',
        departmentName: userDept?.name || (selectedUser ? 'General' : 'All Departments'),
        totalAssigned,
        totalCompleted,
        totalPass,
        totalFail,
        totalPending,
        passRate,
        items
      });
      await firestoreService.logActivity('Generated Summary Report', 'Reports', { userId: summaryUserId, dateRange: summaryDateRange }, currentUser?.uid, currentUser?.email);
    } catch (err) {
      console.error('Failed to generate summary report:', err);
      toast.error('Failed to load user summary report.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleExportSummary = async (format: 'pdf' | 'excel') => {
    if (!summaryReportData) {
      toast.error('No summary data to export. Please run search first.');
      return;
    }
    setExporting(true);
    try {
      const filename = `User_Summary_${summaryReportData.userName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
      const headers = ['S.No', 'Training / Assessment Title', 'Type', 'Assigned Date', 'Completed Date', 'Score', 'Result / Status', 'Trainer / Reviewer'];
      const rows = summaryReportData.items.map(item => [
        item.sNo,
        item.title,
        item.type,
        item.assignedDate,
        item.completedDate,
        item.score,
        item.status,
        item.reviewer
      ]);

      if (format === 'excel') {
        const wsData = [
          [branding.companyName || branding.appName],
          ['User Training & Assessment Performance Summary Report'],
          [`Employee: ${summaryReportData.userName} (ID: ${summaryReportData.employeeId})`],
          [`Department: ${summaryReportData.departmentName} | Email: ${summaryReportData.email}`],
          [`Generated on: ${formatDateTime(new Date())}`],
          [],
          ['METRICS SUMMARY'],
          ['Total Assigned', summaryReportData.totalAssigned],
          ['Total Completed', summaryReportData.totalCompleted],
          ['Total Passed', summaryReportData.totalPass],
          ['Total Failed', summaryReportData.totalFail],
          ['Total Pending', summaryReportData.totalPending],
          ['Pass Rate', `${summaryReportData.passRate}%`],
          [],
          headers,
          ...rows
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Summary');
        XLSX.writeFile(wb, `${filename}.xlsx`);
        toast.success('Summary report exported to Excel');
      } else {
        const doc = new jsPDF();
        const { nextY } = await drawPdfBrandingHeader(doc, branding, {
          margin: 14,
          topY: 10,
          rightHeaderText: 'User Training Summary Report',
          showDivider: true
        });

        doc.setFontSize(13);
        doc.setTextColor(branding.primaryColor || '#0f172a');
        doc.setFont('helvetica', 'bold');
        doc.text('User Training Performance Summary', 14, nextY + 3);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80);
        doc.text(`Employee: ${summaryReportData.userName}  |  Emp ID: ${summaryReportData.employeeId}  |  Dept: ${summaryReportData.departmentName}`, 14, nextY + 8);
        doc.text(`Generated on: ${formatDateTime(new Date())}`, 14, nextY + 12);

        // Metric summary row table in PDF
        autoTable(doc, {
          startY: nextY + 15,
          head: [['Total Assigned', 'Total Completed', 'Total Passed', 'Total Failed', 'Total Pending', 'Pass Rate']],
          body: [[
            summaryReportData.totalAssigned,
            summaryReportData.totalCompleted,
            summaryReportData.totalPass,
            summaryReportData.totalFail,
            summaryReportData.totalPending,
            `${summaryReportData.passRate}%`
          ]],
          theme: 'grid',
          styles: { halign: 'center', fontStyle: 'bold', fontSize: 9 }
        });

        const currentY = (doc as any).lastAutoTable?.finalY || (nextY + 35);
        autoTable(doc, {
          startY: currentY + 6,
          head: [headers],
          body: rows,
          theme: 'grid',
          styles: { fontSize: 8 }
        });

        doc.save(`${filename}.pdf`);
        toast.success('Summary report exported to PDF');
      }
      await firestoreService.logActivity('Exported Summary Report', 'Reports', { format, userId: summaryUserId }, currentUser?.uid, currentUser?.email);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Failed to export summary report.');
    } finally {
      setExporting(false);
    }
  };

  const filteredUsersForSummary = users.filter(u => {
    if (!summaryUserFilterText.trim()) return true;
    const q = summaryUserFilterText.toLowerCase().trim();
    return (
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.employeeId?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reporting & Analytics</h1>
          <p className="text-muted-foreground mt-1">Generate and download detailed performance reports for audits and management.</p>
        </div>
        {branding.logoUrl && (
          <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border shadow-sm">
            <img 
              src={branding.logoUrl} 
              alt="Company Logo" 
              className="h-12 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="text-right">
              <p className="text-sm font-bold text-primary">{branding.companyName || branding.appName}</p>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Official Report Portal</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-3 border-b pb-4">
        <button
          type="button"
          onClick={() => setActiveReportTab('summary')}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm',
            activeReportTab === 'summary'
              ? 'bg-primary text-primary-foreground shadow-primary/20'
              : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <BarChart3 className="w-4 h-4" />
          <span>User Training Summary Report</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveReportTab('custom')}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm',
            activeReportTab === 'custom'
              ? 'bg-primary text-primary-foreground shadow-primary/20'
              : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Layers className="w-4 h-4" />
          <span>Custom Report Builder</span>
        </button>
      </div>

      {activeReportTab === 'summary' ? (
        <div className="space-y-6">
          {/* Controls: User selection, date filter, search button, export buttons */}
          <div className="bg-card rounded-2xl border shadow-sm p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b">
              <div>
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  User Training Performance Summary
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select an employee and date range to view training assigned, completed, passed, failed, and pending status.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleGenerateSummaryReport()}
                  disabled={summaryLoading}
                  className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {summaryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>Search Report</span>
                </button>
                <button 
                  onClick={() => handleExportSummary('excel')}
                  disabled={!summaryReportData || summaryLoading}
                  className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Excel</span>
                </button>
                <button 
                  onClick={() => handleExportSummary('pdf')}
                  disabled={!summaryReportData || summaryLoading}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  <span>PDF</span>
                </button>
              </div>
            </div>

            <div className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Employee Selection */}
              <div className="space-y-1.5 lg:col-span-2">
                <label className="text-xs font-bold uppercase text-muted-foreground flex items-center justify-between">
                  <span>Select Employee</span>
                  {summaryUserId !== 'all' && (
                    <button
                      onClick={() => setSummaryUserId('all')}
                      className="text-[11px] text-primary hover:underline lowercase font-normal"
                    >
                      clear selection
                    </button>
                  )}
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative sm:w-1/2">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={summaryUserFilterText}
                      onChange={(e) => setSummaryUserFilterText(e.target.value)}
                      placeholder="Search employee name/ID..."
                      className="w-full pl-8 pr-3 py-2 bg-background border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <select
                    value={summaryUserId}
                    onChange={(e) => setSummaryUserId(e.target.value)}
                    className="w-full sm:w-1/2 px-3 py-2 bg-background border rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="all">All Employees (Organization-wide)</option>
                    {filteredUsersForSummary.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.displayName} {u.employeeId ? `[ID: ${u.employeeId}]` : ''} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Date Filter</label>
                <select 
                  value={summaryDateRange}
                  onChange={e => setSummaryDateRange(e.target.value)}
                  className="w-full px-3 py-2 bg-background border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All Time</option>
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last Quarter (90 Days)</option>
                  <option value="365">Year to Date (365 Days)</option>
                  <option value="custom">Custom Date Range</option>
                </select>
              </div>

              {summaryDateRange === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase text-muted-foreground">From</label>
                    <input 
                      type="date"
                      value={summaryStartDate}
                      onChange={e => setSummaryStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-background border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase text-muted-foreground">To</label>
                    <input 
                      type="date"
                      value={summaryEndDate}
                      onChange={e => setSummaryEndDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-background border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* User Details & 5 Metric Summary Cards */}
          {summaryReportData && (
            <div className="space-y-6">
              {/* Selected User Banner */}
              <div className="bg-muted/30 p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground text-base flex items-center gap-2">
                      <span>{summaryReportData.userName}</span>
                      {summaryReportData.employeeId && summaryReportData.employeeId !== 'ALL' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono font-bold">
                          ID: {summaryReportData.employeeId}
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {summaryReportData.departmentName} • {summaryReportData.email}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground font-medium">Overall Pass Rate</p>
                  <p className="text-xl font-extrabold text-foreground">{summaryReportData.passRate}%</p>
                </div>
              </div>

              {/* 5 Distinct Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {/* 1. Total Assigned */}
                <div className="bg-card p-4 rounded-xl border border-blue-200/80 bg-blue-50/20 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Total Assigned</span>
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                      <ClipboardList className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl lg:text-3xl font-extrabold text-blue-950 font-mono">
                      {summaryReportData.totalAssigned}
                    </span>
                    <p className="text-[11px] text-blue-700/80 mt-0.5">Trainings & assessments</p>
                  </div>
                </div>

                {/* 2. Total Completed */}
                <div className="bg-card p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/20 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Completed</span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl lg:text-3xl font-extrabold text-emerald-950 font-mono">
                      {summaryReportData.totalCompleted}
                    </span>
                    <p className="text-[11px] text-emerald-700/80 mt-0.5">Finished sessions</p>
                  </div>
                </div>

                {/* 3. Total Pass */}
                <div className="bg-card p-4 rounded-xl border border-green-200/80 bg-green-50/20 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-green-700 uppercase tracking-wider">Passed</span>
                    <div className="w-8 h-8 rounded-lg bg-green-100 text-green-700 flex items-center justify-center">
                      <Award className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl lg:text-3xl font-extrabold text-green-950 font-mono">
                      {summaryReportData.totalPass}
                    </span>
                    <p className="text-[11px] text-green-700/80 mt-0.5">Cleared criteria</p>
                  </div>
                </div>

                {/* 4. Total Fail */}
                <div className="bg-card p-4 rounded-xl border border-red-200/80 bg-red-50/20 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-700 uppercase tracking-wider">Failed</span>
                    <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center">
                      <XCircle className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl lg:text-3xl font-extrabold text-red-950 font-mono">
                      {summaryReportData.totalFail}
                    </span>
                    <p className="text-[11px] text-red-700/80 mt-0.5">Needs re-assessment</p>
                  </div>
                </div>

                {/* 5. Total Pending */}
                <div className="bg-card p-4 rounded-xl border border-amber-200/80 bg-amber-50/20 shadow-sm col-span-2 md:col-span-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Pending</span>
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl lg:text-3xl font-extrabold text-amber-950 font-mono">
                      {summaryReportData.totalPending}
                    </span>
                    <p className="text-[11px] text-amber-700/80 mt-0.5">Incomplete / in review</p>
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown List Table */}
              <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
                <div className="p-5 border-b bg-muted/20 flex items-center justify-between">
                  <h4 className="font-bold text-base text-foreground flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    Training & Assessment Records
                    <span className="text-xs font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
                      {summaryReportData.items.length} records
                    </span>
                  </h4>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-muted/50 border-b text-xs uppercase font-bold text-muted-foreground">
                      <tr>
                        <th className="py-3 px-4 w-12 text-center">#</th>
                        {summaryUserId === 'all' && <th className="py-3 px-4">Employee</th>}
                        <th className="py-3 px-4">Training Title</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Assigned Date</th>
                        <th className="py-3 px-4">Completed Date</th>
                        <th className="py-3 px-4 text-center">Score</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4">Reviewer / Trainer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-xs">
                      {summaryReportData.items.length > 0 ? (
                        summaryReportData.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-4 text-center font-mono text-muted-foreground">{item.sNo}</td>
                            {summaryUserId === 'all' && (
                              <td className="py-3 px-4 font-semibold text-foreground">{item.employeeName || '-'}</td>
                            )}
                            <td className="py-3 px-4 font-medium text-foreground">{item.title}</td>
                            <td className="py-3 px-4 text-muted-foreground">
                              <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium">
                                {item.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground font-mono">{item.assignedDate}</td>
                            <td className="py-3 px-4 text-muted-foreground font-mono">{item.completedDate}</td>
                            <td className="py-3 px-4 text-center font-bold font-mono text-foreground">{item.score}</td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={cn(
                                  'px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide inline-block',
                                  item.status === 'Pass' && 'bg-emerald-100 text-emerald-800 border border-emerald-200',
                                  item.status === 'Fail' && 'bg-red-100 text-red-800 border border-red-200',
                                  item.status === 'Pending Review' && 'bg-amber-100 text-amber-800 border border-amber-200',
                                  item.status === 'In Progress' && 'bg-blue-100 text-blue-800 border border-blue-200',
                                  item.status === 'Not Started' && 'bg-slate-100 text-slate-700 border border-slate-200'
                                )}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">{item.reviewer}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={summaryUserId === 'all' ? 9 : 8} className="py-12 text-center text-muted-foreground">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <ClipboardList className="w-8 h-8 text-muted-foreground/40" />
                              <p className="font-semibold">No training or assessment records found.</p>
                              <p className="text-xs text-muted-foreground">Try adjusting the employee selection or date filter.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-6 border-b flex items-center justify-between bg-muted/30">
            <h3 className="font-bold text-lg">Custom Report Builder</h3>
            <div className="flex gap-2">
              <button 
                onClick={() => handleView('Custom Report')}
                className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                <span>View Report</span>
              </button>
              <button 
                onClick={() => handleExport('Custom Report', 'excel')}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Excel</span>
              </button>
              <button 
                onClick={() => handleExport('Custom Report', 'pdf')}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                <span>PDF</span>
              </button>
            </div>
          </div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Date Range</label>
              <select 
                value={filters.dateRange}
                onChange={e => setFilters({...filters, dateRange: e.target.value})}
                className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">All Time</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last Quarter</option>
                <option value="365">Year to Date</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            {filters.dateRange === 'custom' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Start Date</label>
                  <input 
                    type="date"
                    value={filters.startDate}
                    onChange={e => setFilters({...filters, startDate: e.target.value})}
                    className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">End Date</label>
                  <input 
                    type="date"
                    value={filters.endDate}
                    onChange={e => setFilters({...filters, endDate: e.target.value})}
                    className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Employee</label>
              <select 
                value={filters.userId}
                onChange={e => setFilters({...filters, userId: e.target.value})}
                className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">All Employees</option>
                {users.map(u => (
                  <option key={u.uid} value={u.uid}>{u.displayName}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Department</label>
              <select 
                value={filters.departmentId}
                onChange={e => setFilters({...filters, departmentId: e.target.value})}
                className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Assessment</label>
              <select 
                value={filters.templateId}
                onChange={e => setFilters({...filters, templateId: e.target.value})}
                className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">All Templates</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Result Status</label>
              <select 
                value={filters.status}
                onChange={e => setFilters({...filters, status: e.target.value})}
                className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">All Results</option>
                <option value="pass">Pass Only</option>
                <option value="fail">Fail Only</option>
                <option value="retest">Re-assessment Required</option>
              </select>
            </div>
          </div>
        </div>
      )}
      {previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-6xl max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col">
            <div className="p-6 border-b flex items-center justify-between bg-muted/10">
              <div className="flex items-center gap-4">
                {branding.logoUrl && (
                  <img 
                    src={branding.logoUrl} 
                    alt="Company Logo" 
                    className="h-12 w-auto object-contain"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div>
                  <h3 className="text-xl font-bold">{branding.companyName || branding.appName}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">{previewData.title}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-sm text-muted-foreground">Showing {previewData.rows.length} records</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setPreviewData(null)}
                className="p-2 hover:bg-accent rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      {previewData.headers.map((header, i) => (
                        <th key={i} className="px-4 py-3 font-bold">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewData.rows.length > 0 ? (
                      previewData.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                          {row.map((cell: any, j: number) => (
                            <td key={j} className="px-4 py-3">
                              {typeof cell === 'object' && cell?.type === 'action' ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => viewIndividualReport(cell.submissionId)}
                                    disabled={cell.disabled}
                                    className="p-2 hover:bg-primary/10 rounded-lg text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title="View Individual Report"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => downloadIndividualReport(cell.submissionId)}
                                    disabled={cell.disabled}
                                    className="p-2 hover:bg-primary/10 rounded-lg text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title="Download Individual Report"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : cell}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={previewData.headers.length} className="px-4 py-12 text-center text-muted-foreground italic">
                          No data found matching the selected criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-6 border-t bg-muted/10 flex justify-end gap-3">
              <button 
                onClick={() => setPreviewData(null)}
                className="px-6 py-2 border rounded-lg font-bold hover:bg-accent transition-colors"
              >
                Close
              </button>
              <button 
                onClick={() => {
                  const title = previewData.title;
                  setPreviewData(null);
                  handleExport(title, 'pdf');
                }}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-bold hover:opacity-90 transition-all flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedIndividualReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-4xl max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col">
            <div className="p-6 border-b flex items-center justify-between bg-muted/10">
              <div className="flex items-center gap-4">
                {branding.logoUrl && (
                  <img 
                    src={branding.logoUrl} 
                    alt="Company Logo" 
                    className="h-12 w-auto object-contain"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div>
                  <h3 className="text-xl font-bold">{branding.companyName || branding.appName}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">Evaluation Report</span>
                    <span className="text-muted-foreground">•</span>
                    <p className="text-sm text-muted-foreground">
                      {selectedIndividualReport.user?.displayName} - {selectedIndividualReport.template?.name}
                    </p>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedIndividualReport(null)}
                className="p-2 hover:bg-accent rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 space-y-8">
              {/* Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-bold text-sm uppercase text-muted-foreground tracking-wider">Employee Details</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{selectedIndividualReport.user?.displayName}</span>
                    <span className="text-muted-foreground">Employee ID:</span>
                    <span className="font-medium font-mono text-primary font-semibold">{selectedIndividualReport.user?.employeeId || 'N/A'}</span>
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-medium">{selectedIndividualReport.user?.email}</span>
                    <span className="text-muted-foreground">Department:</span>
                    <span className="font-medium">{selectedIndividualReport.dept?.name || 'N/A'}</span>
                    <span className="text-muted-foreground">Designation:</span>
                    <span className="font-medium">{selectedIndividualReport.user?.designation || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">SOP Name:</span>
                    <span className="font-medium">{selectedIndividualReport.template?.name}</span>
                    <span className="text-muted-foreground">Trainer Name:</span>
                    <span className="font-medium">
                      {selectedIndividualReport.reviewer?.displayName === 'System Admin' 
                        ? (selectedIndividualReport.user?.displayName || 'Super Admin') 
                        : (selectedIndividualReport.reviewer?.displayName || 'N/A')}
                    </span>
                    <span className="text-muted-foreground">Submitted At:</span>
                    <span className="font-medium">{formatDateTime(selectedIndividualReport.submission.submittedAt)}</span>
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="font-medium">
                      {Math.floor(selectedIndividualReport.submission.durationTaken / 60)}m {selectedIndividualReport.submission.durationTaken % 60}s
                    </span>
                  </div>
                </div>
              </div>

              {/* SOP Overview */}
              {selectedIndividualReport.template?.description && (
                <div className="bg-muted/10 p-6 rounded-xl border">
                  <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Template Details</p>
                  <p className="text-sm text-foreground">{selectedIndividualReport.template.description}</p>
                </div>
              )}

              {/* Summary Card */}
              <div className="bg-muted/30 rounded-xl p-6 flex items-center justify-around border">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground uppercase font-bold mb-1">Result</p>
                  <span className={cn(
                    "px-4 py-1 rounded-full text-lg font-bold",
                    selectedIndividualReport.evaluation.result === 'pass' 
                      ? "bg-emerald-100 text-emerald-700" 
                      : "bg-red-100 text-red-700"
                  )}>
                    {selectedIndividualReport.evaluation.result.toUpperCase()}
                  </span>
                </div>
                <div className="w-px h-12 bg-border" />
                <div className="text-center">
                  <p className="text-sm text-muted-foreground uppercase font-bold mb-1">Final Score</p>
                  <span className="text-3xl font-bold text-primary">
                    {selectedIndividualReport.evaluation.finalScore.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Detailed Results */}
              <div className="space-y-4">
                <h4 className="font-bold text-lg">Detailed SOP Results</h4>
                <div className="border rounded-xl overflow-hidden">
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
                      {selectedIndividualReport.template.questions.map((q: any, index: number) => {
                        const score = selectedIndividualReport.evaluation.questionScores[q.id] || 0;
                        const isCorrect = score > 0;
                        const answer = selectedIndividualReport.submission.answers[q.id];
                        
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
                                isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                              )}>
                                {isCorrect ? 'Correct' : 'Wrong'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground italic text-xs">
                              {selectedIndividualReport.evaluation.questionComments[q.id] || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Reviewer Feedback */}
              <div className="space-y-4 bg-primary/5 p-6 rounded-xl border border-primary/10">
                <h4 className="font-bold text-lg flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-primary" />
                  Reviewer Feedback
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Overall Comments</p>
                    <p className="text-sm">{selectedIndividualReport.evaluation.overallComments || 'No overall comments provided.'}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase text-emerald-600 mb-1">Strengths</p>
                      <p className="text-sm">{selectedIndividualReport.evaluation.strengths || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-amber-600 mb-1">Areas for Improvement</p>
                      <p className="text-sm">{selectedIndividualReport.evaluation.improvements || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="pt-4 border-t flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        {(selectedIndividualReport.reviewer?.displayName === 'System Admin' ? (selectedIndividualReport.user?.displayName || 'Super Admin') : (selectedIndividualReport.reviewer?.displayName || 'Unknown Reviewer')).charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Evaluated by</p>
                        <p className="text-sm font-bold">{selectedIndividualReport.reviewer?.displayName === 'System Admin' ? (selectedIndividualReport.user?.displayName || 'Super Admin') : (selectedIndividualReport.reviewer?.displayName || 'Unknown Reviewer')}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      Reviewed on {formatDateTime(selectedIndividualReport.evaluation.reviewedAt)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t bg-muted/10 flex justify-end gap-3">
              <button 
                onClick={() => setSelectedIndividualReport(null)}
                className="px-6 py-2 border rounded-lg font-bold hover:bg-accent transition-colors"
              >
                Close
              </button>
              <button 
                onClick={() => {
                  const subId = selectedIndividualReport.submission.id;
                  downloadIndividualReport(subId);
                }}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-bold hover:opacity-90 transition-all flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {exporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className="bg-card p-6 rounded-2xl border shadow-2xl flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="font-bold text-lg">Generating Report...</p>
            <p className="text-sm text-muted-foreground">This may take a few moments depending on data size.</p>
          </div>
        </div>
      )}
    </div>
  );
}
