import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  ChevronLeft, 
  Send,
  ShieldCheck,
  Loader2,
  Info,
  FileUp,
  FileText as FileIcon,
  X
} from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { Assignment, Template, Submission, Question, User, Department } from '../types';
import { cn, formatDateTime, formatId } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export default function AssessmentPortal() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, branding } = useAuth();
  
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [nextAssignmentId, setNextAssignmentId] = useState<string | null>(null);
  const [attemptsMade, setAttemptsMade] = useState(0);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);

  const timerRef = useRef<any>(null);
  const isQuestionAnswered = (qId: string) => {
    const ans = answers[qId];
    if (ans === undefined || ans === null) return false;
    if (typeof ans === 'string') return ans.trim() !== '';
    if (Array.isArray(ans)) return ans.length > 0;
    if (typeof ans === 'object') {
      // For file upload, check if it has data
      if (ans.hasOwnProperty('data')) return !!ans.data;
      return Object.keys(ans).length > 0;
    }
    return true;
  };

  const answeredCount = template?.questions?.filter(q => isQuestionAnswered(q.id)).length || 0;
  const totalQuestions = template?.questions?.length || 0;
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (started && !submitted && document.visibilityState === 'hidden') {
        setTabSwitchCount(prev => prev + 1);
        setShowWarning(true);
      }
    };

    const handleBlur = () => {
      if (started && !submitted) {
        setTabSwitchCount(prev => prev + 1);
        setShowWarning(true);
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (started && !submitted) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [started, submitted]);

  useEffect(() => {
    const loadData = async () => {
      if (!assignmentId) return;
      
      // Log viewing activity
      await firestoreService.logActivity('Viewed Assessment Portal', 'Assessments', { assignmentId }, user?.uid, user?.email);

      const [assign, allAssigns, allSubs, allDepts] = await Promise.all([
        firestoreService.getDocument<Assignment>('assignments', assignmentId),
        firestoreService.getCollection<Assignment>('assignments'),
        firestoreService.getCollection<Submission>('submissions'),
        firestoreService.getCollection<Department>('departments')
      ]);

      setDepartments(allDepts);

      if (assign) {
        setAssignment(assign);
        
        // Check for expiration
        const isExpired = new Date(assign.dueDate) < new Date();
        
        if (isExpired) {
          // If they already have a completed/submitted sub, we'll let the "submitted" state handle it
          const mySubs = allSubs.filter(s => s.assignmentId === assignmentId && s.employeeId === user?.uid);
          const hasFinished = mySubs.some(s => s.status === 'submitted' || s.status === 'completed' || s.status === 'under_review');
          
          if (!hasFinished) {
            toast.error("This assessment has expired and is no longer available.");
            setLoading(false);
            return;
          }
        }

        const temp = await firestoreService.getDocument<Template>('templates', assign.templateId);
        if (temp) {
          // Filter questions if selectedQuestionIds is provided
          if (assign.selectedQuestionIds && assign.selectedQuestionIds.length > 0) {
            temp.questions = temp.questions.filter(q => assign.selectedQuestionIds?.includes(q.id));
          }
          setTemplate(temp);
        }

        // Check attempts
        const mySubs = allSubs.filter(s => s.assignmentId === assignmentId && s.employeeId === user?.uid);
        setAttemptsMade(mySubs.length);

        // Check for in-progress submission
        const inProgressSub = mySubs.find(s => s.status === 'in_progress');
        if (inProgressSub) {
          setSubmissionId(inProgressSub.id);
          setAnswers(inProgressSub.answers || {});
          setCurrentQuestionIndex(inProgressSub.currentQuestionIndex || 0);
          setTimeLeft(inProgressSub.timeLeft || (temp?.duration || 0) * 60);
          setTabSwitchCount(inProgressSub.tabSwitchCount || 0);
          setStarted(true);
        }

        // Find next pending assignment for sequential flow
        const myPending = allAssigns
          .filter(a => {
            const isTarget = a.type === 'individual' ? a.targetIds.includes(user?.uid || '') : a.targetIds.includes(user?.departmentId || '');
            return isTarget && a.id !== assignmentId && a.status === 'active';
          })
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        
        if (myPending.length > 0) {
          setNextAssignmentId(myPending[0].id);
        }
      }
      setLoading(false);
    };
    loadData();
  }, [assignmentId, user]);

  useEffect(() => {
    if (started && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleSubmit(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [started, timeLeft]);

  useEffect(() => {
    if (started && !submitted && submissionId) {
      const updateDraft = async () => {
        try {
          await firestoreService.updateDocument('submissions', submissionId, {
            answers,
            currentQuestionIndex,
            timeLeft,
            tabSwitchCount,
            lastUpdatedAt: new Date().toISOString()
          });
        } catch (error) {
          console.error('Failed to update draft:', error);
        }
      };

      const timeout = setTimeout(updateDraft, 5000); // Update every 5 seconds
      return () => clearTimeout(timeout);
    }
  }, [started, submitted, submissionId, answers, currentQuestionIndex, timeLeft, tabSwitchCount]);

  const handleStart = async () => {
    if (!template || !assignmentId || !user) return;
    
    setLoading(true);
    try {
      // Create in-progress submission if it doesn't exist
      if (!submissionId) {
        const duration = template.duration || 30;
        const newSubmission: Partial<Submission> = {
          assignmentId,
          templateId: template.id,
          employeeId: user.uid,
          answers: {},
          status: 'in_progress',
          submittedAt: new Date().toISOString(),
          durationTaken: 0,
          tabSwitchCount: 0,
          currentQuestionIndex: 0,
          timeLeft: duration * 60,
          lastUpdatedAt: new Date().toISOString()
        };
        
        // Clean up any undefined fields just in case
        Object.keys(newSubmission).forEach(key => {
          if ((newSubmission as any)[key] === undefined) {
            delete (newSubmission as any)[key];
          }
        });

        const id = await firestoreService.createDocument('submissions', newSubmission);
        setSubmissionId(id);
      }
      
      const duration = template.duration || 30;
      if (timeLeft === 0) {
        setTimeLeft(duration * 60);
      }
      setStarted(true);
    } catch (error) {
      console.error('Error starting assessment:', error);
      toast.error('Failed to start assessment');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (isAutoSubmit: boolean = false) => {
    if (submitting || submitted || !submissionId) return;

    if (!isAutoSubmit && answeredCount < totalQuestions) {
      toast.error(`Please answer all questions before submitting. (${answeredCount}/${totalQuestions} answered)`);
      return;
    }

    setSubmitting(true);
    try {
      const finalSubmission: Partial<Submission> = {
        answers,
        status: 'submitted',
        submittedAt: new Date().toISOString(),
        durationTaken: (template?.duration || 0) * 60 - timeLeft,
        tabSwitchCount,
        lastUpdatedAt: new Date().toISOString()
      };
      await firestoreService.updateDocument('submissions', submissionId, finalSubmission);
      
      // Notify Reviewer & Admin if tab switching occurred
      if (tabSwitchCount > 0) {
        const adminEmail = 'ganesh123eee@gmail.com'; // From context
        const reviewer = assignment?.reviewerId ? await firestoreService.getDocument<User>('users', assignment.reviewerId) : null;
        
        const recipients = [adminEmail];
        if (reviewer?.email) recipients.push(reviewer.email);

        for (const recipient of recipients) {
          const emailData = {
            to: recipient,
            subject: `Security Alert: Tab Switching Detected - ${user?.displayName || user?.email}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fee2e2; border-radius: 12px; background-color: #fffafb;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h1 style="color: #dc2626; margin: 0;">AssessPro Security</h1>
                </div>
                <h2 style="color: #991b1b; border-bottom: 1px solid #fecaca; padding-bottom: 10px;">Tab Switching Alert</h2>
                <p>Security violation detected during an active assessment.</p>
                <div style="background-color: #ffffff; padding: 20px; border-radius: 12px; margin: 25px 0; border: 1px solid #fecaca;">
                  <p style="margin: 0; color: #475569;"><strong>Employee:</strong> ${user?.displayName || user?.email}</p>
                  <p style="margin: 10px 0 0 0; color: #475569;"><strong>Assessment:</strong> ${template?.name}</p>
                  <p style="margin: 10px 0 0 0; color: #dc2626; font-size: 18px;"><strong>Tab Switch Count: ${tabSwitchCount} times</strong></p>
                  <p style="margin: 10px 0 0 0; color: #475569;"><strong>Submission ID:</strong> ${submissionId}</p>
                </div>
                <p style="color: #64748b; font-size: 14px;">This employee attempted to switch tabs or minimize the browser window multiple times during the test.</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${window.location.origin}/reviews/${submissionId}" style="display: inline-block; background-color: #dc2626; color: white; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px;">Review Submission</a>
                </div>
              </div>
            `
          };

          await firestoreService.createDocument('mail', {
            ...emailData,
            status: 'pending',
            sentAt: null
          });

          try {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(emailData),
            });
          } catch (error) {
            console.error('Failed to trigger security email:', error);
          }
        }
      }

      // Notify Reviewer of completion (standard)
      if (assignment?.reviewerId) {
        // ... existing reviewer notification logic ...
        const reviewer = await firestoreService.getDocument<User>('users', assignment.reviewerId);
        if (reviewer?.email) {
          const reviewLink = `${window.location.origin}/reviews/${submissionId}`;
          const emailData = {
            to: reviewer.email,
            subject: `Assessment Completed: ${template?.name} - Review Required`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h1 style="color: #2563eb; margin: 0;">AssessPro</h1>
                  <p style="color: #64748b; margin: 5px 0 0 0;">Enterprise Assessment Portal</p>
                </div>
                <h2 style="color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Assessment Completed</h2>
                <p>Hello <strong>${reviewer.displayName}</strong>,</p>
                <p>An employee has completed the assessment <strong>${template?.name}</strong>.</p>
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; margin: 25px 0; border: 1px solid #f1f5f9;">
                  <p style="margin: 0; color: #475569;"><strong>Employee:</strong> ${user?.displayName || user?.email}</p>
                  <p style="margin: 10px 0 0 0; color: #475569;"><strong>Submitted At:</strong> ${formatDateTime(new Date())}</p>
                  <p style="margin: 10px 0 0 0; color: #475569;"><strong>Assessment:</strong> ${template?.name}</p>
                </div>
                <p>Please review the answers and provide your evaluation.</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${reviewLink}" style="display: inline-block; background-color: #2563eb; color: white; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">Review Now</a>
                </div>
                <p style="color: #64748b; font-size: 14px; text-align: center; margin-top: 20px;">
                  If the button doesn't work, copy and paste this link into your browser:<br>
                  <a href="${reviewLink}" style="color: #2563eb; word-break: break-all;">${reviewLink}</a>
                </p>
                <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
                  <p style="color: #94a3b8; font-size: 12px; margin: 0;">This is an automated notification from AssessPro. Please do not reply to this email.</p>
                </div>
              </div>
            `
          };

          await firestoreService.createDocument('mail', {
            ...emailData,
            status: 'pending',
            sentAt: null
          });

          try {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(emailData),
            });
          } catch (error) {
            console.error('Failed to trigger email sending to reviewer:', error);
          }
        }
      }

      await firestoreService.logActivity('Submitted Assessment', 'Assessments', { 
        assignmentId, 
        templateName: template?.name,
        employeeId: user?.uid 
      }, user?.uid, user?.email);
      setSubmitted(true);
      clearInterval(timerRef.current);
      
      // Auto-redirect if it was a timeout and there's a next assessment
      if (timeLeft === 0 && nextAssignmentId) {
        toast.info('Time is up! Redirecting to the next assessment...');
        setTimeout(() => {
          window.location.href = `/portal/${nextAssignmentId}`;
        }, 3000);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (authLoading || loading) return <div className="flex items-center justify-center h-screen">Loading assessment...</div>;

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 bg-emerald-50 p-4 overflow-y-auto">
        <div className="p-8 bg-white rounded-2xl shadow-xl border flex flex-col items-center gap-6 max-w-md w-full text-center">
          <div className="flex flex-col items-center gap-2 mb-2">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <ShieldCheck className="text-emerald-600 w-8 h-8" />
              )}
            </div>
            <span className="text-sm font-bold text-emerald-600 uppercase tracking-widest">{branding.appName}</span>
          </div>
          
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Assessment Submitted</h1>
            <p className="text-muted-foreground mt-2">Your answers have been securely recorded. The assigned reviewer will evaluate your submission shortly.</p>
          </div>
          <div className="w-full p-4 bg-muted/30 rounded-xl text-sm text-left space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs uppercase font-bold">Status:</span>
              <span className="font-medium text-emerald-600 uppercase text-[10px] px-2 py-0.5 bg-emerald-100 rounded-full">Under Review</span>
            </div>
          </div>
          
          <div className="w-full space-y-3">
            {nextAssignmentId ? (
              <button 
                onClick={() => {
                  window.location.href = `/portal/${nextAssignmentId}`;
                }}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                <span>Continue to Next Assessment</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button 
                onClick={() => navigate('/')}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
              >
                Go to Dashboard
              </button>
            )}
            
            {nextAssignmentId && (
              <button 
                onClick={() => navigate('/')}
                className="w-full py-3 border border-primary/20 text-muted-foreground rounded-xl font-semibold hover:bg-accent transition-all"
              >
                Back to Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-6 space-y-8">
        {/* Tab Switch Warning Modal */}
        {showWarning && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-card max-w-md w-full rounded-2xl border shadow-2xl p-8 text-center space-y-6 animate-in zoom-in duration-200">
              <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-10 h-10 text-rose-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-rose-600">Security Violation!</h2>
                <p className="text-muted-foreground mt-2">
                  Switching tabs or minimizing the window is strictly prohibited during the assessment.
                </p>
                <p className="text-sm font-bold text-rose-500 mt-4">
                  This incident has been logged and reported to the reviewer and administrator.
                </p>
              </div>
              <button 
                onClick={() => setShowWarning(false)}
                className="w-full py-4 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
              >
                I Understand, Continue Test
              </button>
            </div>
          </div>
        )}
        <div className="bg-card p-8 rounded-3xl border shadow-lg space-y-6">
          <div className="flex items-center justify-between border-b pb-6 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <ShieldCheck className="text-primary w-6 h-6" />
                )}
              </div>
              <span className="text-xl font-bold tracking-tight text-primary">{branding.appName}</span>
            </div>
            <span className="text-xs font-medium text-muted-foreground">{branding.companyName}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{template?.name}</h1>
              <p className="text-muted-foreground">{template?.skillCategory} Assessment</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-muted/30 rounded-2xl space-y-1">
              <p className="text-xs font-bold uppercase text-muted-foreground">Duration</p>
              <p className="text-lg font-bold">{template?.duration} Minutes</p>
            </div>
            <div className="p-4 bg-muted/30 rounded-2xl space-y-1">
              <p className="text-xs font-bold uppercase text-muted-foreground">Questions</p>
              <p className="text-lg font-bold">{template?.questions?.length} Items</p>
            </div>
            <div className="p-4 bg-muted/30 rounded-2xl space-y-1">
              <p className="text-xs font-bold uppercase text-muted-foreground">Total Weightage</p>
              <p className="text-lg font-bold">100%</p>
            </div>
            <div className="p-4 bg-muted/30 rounded-2xl space-y-1">
              <p className="text-xs font-bold uppercase text-muted-foreground">Pass Mark</p>
              <p className="text-lg font-bold text-emerald-600">80%</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" />
              Instructions
            </h3>
            <div className="prose prose-sm max-w-none text-muted-foreground bg-accent/30 p-6 rounded-2xl border">
              {template?.instructions || "No specific instructions provided."}
              <ul className="mt-4 space-y-2">
                <li>Ensure you have a stable internet connection.</li>
                <li>The assessment will auto-submit once the timer expires.</li>
                <li>Do not refresh the page during the assessment.</li>
              </ul>
            </div>
          </div>

          <button 
            onClick={handleStart}
            disabled={assignment?.attemptLimit ? attemptsMade >= assignment.attemptLimit : false}
            className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {assignment?.attemptLimit && attemptsMade >= assignment.attemptLimit 
              ? `Attempt Limit Reached (${attemptsMade}/${assignment.attemptLimit})` 
              : 'Start Assessment Now'}
          </button>
          {assignment?.attemptLimit && (
            <p className="text-center text-xs text-muted-foreground">
              Attempts: {attemptsMade} of {assignment.attemptLimit} allowed
            </p>
          )}
        </div>
      </div>
    );
  }

  const currentQuestion = template?.questions?.[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Tab Switch Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-card max-w-md w-full rounded-2xl border shadow-2xl p-8 text-center space-y-6 animate-in zoom-in duration-200">
            <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10 text-rose-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-rose-600">Security Violation!</h2>
              <p className="text-muted-foreground mt-2">
                Switching tabs or minimizing the window is strictly prohibited during the assessment.
              </p>
              <p className="text-sm font-bold text-rose-500 mt-4">
                This incident has been logged and reported to the reviewer and administrator.
              </p>
            </div>
            <button 
              onClick={() => setShowWarning(false)}
              className="w-full py-4 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
            >
              I Understand, Continue Test
            </button>
          </div>
        </div>
      )}
      {/* Assessment Header */}
      <header className="h-20 bg-white border-b px-8 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center overflow-hidden">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <FileIcon className="w-5 h-5 text-primary" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{branding.appName}</span>
              <span className="w-1 h-1 bg-muted-foreground/30 rounded-full" />
              <h2 className="font-bold truncate max-w-[200px] md:max-w-md">{template?.name}</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-500" 
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className={cn(
                "text-[10px] font-bold uppercase",
                answeredCount < totalQuestions ? "text-rose-500" : "text-muted-foreground"
              )}>
                {answeredCount} of {totalQuestions} Answered
              </span>
            </div>
          </div>
        </div>

        <div className={cn(
          "flex items-center gap-3 px-6 py-2 rounded-2xl font-mono font-bold text-lg border-2 transition-colors",
          timeLeft < 300 ? "bg-rose-50 text-rose-600 border-rose-200 animate-pulse" : "bg-slate-50 text-slate-700 border-slate-200"
        )}>
          <Clock className="w-5 h-5" />
          {formatTime(timeLeft)}
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-8 space-y-8">
        {template?.questions?.map((question, idx) => (
          <div key={question.id} className="bg-white p-10 rounded-3xl shadow-xl border flex flex-col space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                    {idx + 1}
                  </span>
                  <span className="px-3 py-1 bg-accent text-accent-foreground rounded-full text-[10px] font-bold uppercase tracking-widest">
                    {question.type.replace('_', ' ')}
                  </span>
                  {!isQuestionAnswered(question.id) && (
                    <span className="px-3 py-1 bg-rose-100 text-rose-600 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Required
                    </span>
                  )}
                </div>
                <span className="text-sm font-bold text-muted-foreground">{question.marks}% Weightage</span>
              </div>
              <h3 className="text-2xl font-bold leading-tight">{question.text}</h3>
            </div>

            <div className="space-y-4">
              {question.type === 'mcq' && (
                <div className="grid grid-cols-1 gap-3">
                  {question.options?.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setAnswers({...answers, [question.id]: opt})}
                      className={cn(
                        "flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all group",
                        answers[question.id] === opt 
                          ? "border-primary bg-primary/5 ring-4 ring-primary/10" 
                          : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold transition-colors",
                        answers[question.id] === opt ? "border-primary bg-primary text-white" : "border-slate-200 text-slate-400 group-hover:border-slate-400"
                      )}>
                        {String.fromCharCode(65 + i)}
                      </div>
                      <span className="font-medium">{opt}</span>
                    </button>
                  ))}
                </div>
              )}

              {(question.type === 'short_answer' || question.type === 'descriptive') && (
                <textarea
                  value={answers[question.id] || ''}
                  onChange={(e) => setAnswers({...answers, [question.id]: e.target.value})}
                  placeholder="Type your answer here..."
                  className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-primary focus:bg-white transition-all min-h-[200px] text-lg"
                />
              )}

              {question.type === 'true_false' && (
                <div className="flex gap-4">
                  {['True', 'False'].map(val => (
                    <button
                      key={val}
                      onClick={() => setAnswers({...answers, [question.id]: val})}
                      className={cn(
                        "flex-1 py-6 rounded-3xl border-2 font-bold text-xl transition-all",
                        answers[question.id] === val 
                          ? "border-primary bg-primary/5 text-primary" 
                          : "border-slate-100 hover:border-slate-300"
                      )}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              )}

              {question.type === 'file_upload' && (
                <div className="space-y-4">
                  <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-200 rounded-3xl cursor-pointer hover:bg-slate-50 transition-all group">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        <FileUp className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold">Click to upload your file</p>
                        <p className="text-xs text-muted-foreground mt-1">Supported formats: PDF, DOC, DOCX (Max 1MB)</p>
                      </div>
                    </div>
                    <input 
                      type="file" 
                      accept=".pdf,.doc,.docx"
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 1024 * 1024) {
                            toast.error("File size exceeds 1MB limit. Please upload a smaller file.");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setAnswers({
                              ...answers, 
                              [question.id]: {
                                name: file.name,
                                type: file.type,
                                data: ev.target?.result as string
                              }
                            });
                          };
                          reader.readAsDataURL(file);
                        }
                      }} 
                    />
                  </label>
                  {answers[question.id] && (
                    <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                      <FileIcon className="w-5 h-5 text-emerald-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{answers[question.id].name}</p>
                        <p className="text-[10px] text-emerald-600 uppercase font-bold">File Attached Successfully</p>
                      </div>
                      <button 
                        onClick={() => {
                          const newAnswers = { ...answers };
                          delete newAnswers[question.id];
                          setAnswers(newAnswers);
                        }}
                        className="p-2 hover:bg-emerald-100 rounded-lg transition-colors text-emerald-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-center py-12">
          <button
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className={cn(
              "flex items-center gap-2 px-16 py-5 rounded-3xl font-bold shadow-xl transition-all disabled:opacity-50",
              answeredCount < totalQuestions 
                ? "bg-slate-400 text-white cursor-not-allowed shadow-slate-200" 
                : "bg-emerald-600 text-white shadow-emerald-200 hover:scale-[1.05] active:scale-[0.95]"
            )}
          >
            {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
            {answeredCount < totalQuestions ? `Answer All Questions (${answeredCount}/${totalQuestions})` : 'Submit Assessment'}
          </button>
        </div>
      </main>
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
