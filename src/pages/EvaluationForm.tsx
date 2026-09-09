import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Save, 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  MessageSquare, 
  Award,
  Loader2,
  ChevronRight,
  Info,
  Download,
  FileText
} from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { Submission, Template, Evaluation, User, Question, Assignment, Department } from '../types';
import { cn, formatDateTime, formatId } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export default function EvaluationForm() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const { user: reviewer } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [employee, setEmployee] = useState<User | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isReadOnly, setIsReadOnly] = useState(false);
  
  const [evaluation, setEvaluation] = useState<Partial<Evaluation>>({
    questionScores: {},
    questionComments: {},
    overallComments: '',
    strengths: '',
    improvements: '',
    result: 'pass',
    retestRequired: false
  });

  useEffect(() => {
    const loadData = async () => {
      if (!submissionId) return;
      
      // Log viewing activity
      await firestoreService.logActivity('Viewed Evaluation Form', 'Reviews', { submissionId }, reviewer?.uid, reviewer?.email);

      const sub = await firestoreService.getDocument<Submission>('submissions', submissionId);
      if (sub) {
        setSubmission(sub);
        if (sub.status === 'completed') {
          setIsReadOnly(true);
        }

        const assign = await firestoreService.getDocument<Assignment>('assignments', sub.assignmentId);
        const [temp, emp, existingEval, depts] = await Promise.all([
          firestoreService.getDocument<Template>('templates', assign.templateId),
          firestoreService.getDocument<User>('users', sub.employeeId),
          firestoreService.getCollection<Evaluation>('reviews', []),
          firestoreService.getCollection<Department>('departments')
        ]);
        
        setDepartments(depts);
        
        if (temp && assign.selectedQuestionIds && assign.selectedQuestionIds.length > 0) {
          temp.questions = temp.questions.filter(q => assign.selectedQuestionIds?.includes(q.id));
        }
        
        setTemplate(temp);
        setEmployee(emp);
        
        const myEval = existingEval.find(e => e.submissionId === submissionId);
        if (myEval) setEvaluation(myEval);
      }
      setLoading(false);
    };
    loadData();
  }, [submissionId]);

  const handleScoreChange = (qId: string, isCorrect: boolean) => {
    setEvaluation(prev => {
      const newScores = { ...prev.questionScores, [qId]: isCorrect ? 1 : 0 };
      const correctCount = Object.values(newScores).filter(v => v === 1).length;
      const totalQuestions = template?.questions.length || 1;
      const percentage = (correctCount / totalQuestions) * 100;
      
      const passThreshold = 80;
      // Force one decimal place for the comparison as well
      const fixedPercentage = parseFloat(percentage.toFixed(1));
      const result = fixedPercentage >= passThreshold ? 'pass' : 'fail';
      
      return {
        ...prev,
        questionScores: newScores,
        result,
        retestRequired: result === 'fail' // Automatically set retest if failed
      };
    });
  };

  const calculateCorrectCount = () => {
    const scores = evaluation.questionScores || {};
    return Object.values(scores).filter(v => v === 1).length;
  };

  const calculatePercentage = () => {
    const correctCount = calculateCorrectCount();
    const totalQuestions = template?.questions.length || 1;
    return (correctCount / totalQuestions) * 100;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const finalScore = calculatePercentage();
      const data = {
        ...evaluation,
        submissionId,
        reviewerId: reviewer?.uid,
        finalScore,
        reviewedAt: new Date().toISOString()
      };

      await Promise.all([
        firestoreService.createDocument('reviews', data),
        firestoreService.updateDocument('submissions', submissionId!, { status: 'completed' }),
        firestoreService.logActivity('Completed Review', 'Reviews', { 
          submissionId, 
          employeeName: employee?.displayName,
          templateName: template?.name,
          score: finalScore,
          result: evaluation.result 
        }, reviewer?.uid, reviewer?.email)
      ]);

      // Notify Employee
      if (employee?.email) {
        const emailData = {
          to: employee.email,
          subject: `Assessment Result: ${template?.name}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="color: #2563eb; margin: 0;">AssessPro</h1>
                <p style="color: #64748b; margin: 5px 0 0 0;">Enterprise Assessment Portal</p>
              </div>
              <h2 style="color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Assessment Result</h2>
              <p>Hello <strong>${employee.displayName}</strong>,</p>
              <p>Your assessment <strong>${template?.name}</strong> has been reviewed.</p>
              <div style="background-color: ${evaluation.result === 'pass' ? '#f0fdf4' : '#fef2f2'}; padding: 20px; border-radius: 12px; margin: 25px 0; border: 1px solid ${evaluation.result === 'pass' ? '#bbf7d0' : '#fecaca'};">
                <p style="margin: 0; color: #475569;"><strong>Result:</strong> <span style="color: ${evaluation.result === 'pass' ? '#16a34a' : '#dc2626'}; font-weight: bold; text-transform: uppercase;">${evaluation.result}</span></p>
                <p style="margin: 10px 0 0 0; color: #475569;"><strong>Score:</strong> ${finalScore.toFixed(1)}%</p>
                <p style="margin: 10px 0 0 0; color: #475569;"><strong>Re-assessment Required:</strong> ${evaluation.retestRequired ? 'Yes' : 'No'}</p>
              </div>
              <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; margin: 25px 0; border: 1px solid #f1f5f9;">
                <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #0f172a;">Reviewer Comments:</h3>
                <p style="margin: 0; color: #475569; font-style: italic;">"${evaluation.overallComments || 'No overall comments provided.'}"</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${window.location.origin}/my-assessments" style="display: inline-block; background-color: #2563eb; color: white; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px;">View Details</a>
              </div>
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
          console.error('Failed to trigger email sending to employee:', error);
        }
      }
      
      navigate('/submissions');
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Loading evaluation...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-sm py-4 z-10 border-b">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/submissions')} className="p-2 hover:bg-accent rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Evaluation: {employee?.displayName}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{template?.name}</span>
              <span>•</span>
              <span>Submitted {formatDateTime(submission?.submittedAt || '')}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs font-bold uppercase text-muted-foreground">Current Score</p>
            <p className="text-2xl font-black text-primary">{calculatePercentage().toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground">({calculateCorrectCount()} / {template?.questions.length} Questions Correct)</p>
          </div>
          <button 
            onClick={handleSubmit}
            disabled={submitting || isReadOnly}
            className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-2xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            <span>{isReadOnly ? 'Review Completed' : 'Submit Review'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Questions & Answers */}
        <div className="lg:col-span-2 space-y-6">
          {template?.questions.map((q, i) => (
            <div key={q.id} className="bg-card rounded-2xl border shadow-sm overflow-hidden">
              <div className="p-4 bg-muted/30 border-b flex items-center justify-between">
                <span className="text-sm font-bold text-muted-foreground">Question {i + 1}</span>
                <span className="text-xs font-medium bg-accent px-2 py-0.5 rounded-full capitalize">{q.type.replace('_', ' ')}</span>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <h4 className="text-lg font-semibold leading-tight">{q.text}</h4>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Employee Answer:</p>
                    {q.type === 'file_upload' ? (
                      submission?.answers[q.id] ? (
                        <div className="flex items-center justify-between p-3 bg-white border rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold truncate max-w-[200px]">{submission.answers[q.id].name}</p>
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">Uploaded File</p>
                            </div>
                          </div>
                          <a 
                            href={submission.answers[q.id].data} 
                            download={submission.answers[q.id].name}
                            className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-bold hover:bg-accent/80 transition-all"
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </a>
                        </div>
                      ) : (
                        <span className="text-rose-400 italic">No file uploaded</span>
                      )
                    ) : (
                      <p className="text-sm font-medium">{submission?.answers[q.id] || <span className="text-rose-400 italic">No answer provided</span>}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-4 border-t">
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Evaluation</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => !isReadOnly && handleScoreChange(q.id, true)}
                        disabled={isReadOnly}
                        className={cn(
                          "flex-1 py-2 rounded-xl border-2 font-bold transition-all flex items-center justify-center gap-2 text-sm",
                          evaluation.questionScores?.[q.id] === 1 
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700" 
                            : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                          isReadOnly && "cursor-not-allowed"
                        )}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Right
                      </button>
                      <button 
                        onClick={() => !isReadOnly && handleScoreChange(q.id, false)}
                        disabled={isReadOnly}
                        className={cn(
                          "flex-1 py-2 rounded-xl border-2 font-bold transition-all flex items-center justify-center gap-2 text-sm",
                          evaluation.questionScores?.[q.id] === 0 && evaluation.questionScores?.hasOwnProperty(q.id)
                            ? "border-rose-500 bg-rose-50 text-rose-700" 
                            : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                          isReadOnly && "cursor-not-allowed"
                        )}
                      >
                        <XCircle className="w-4 h-4" />
                        Wrong
                      </button>
                    </div>
                  </div>
                  <div className="flex-[2] space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Question Comments</label>
                    <input 
                      type="text" 
                      value={evaluation.questionComments?.[q.id] || ''}
                      readOnly={isReadOnly}
                      onChange={(e) => setEvaluation(prev => ({
                        ...prev,
                        questionComments: { ...prev.questionComments, [q.id]: e.target.value }
                      }))}
                      placeholder={isReadOnly ? "No comments" : "Add specific feedback..."}
                      className={cn(
                        "w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20",
                        isReadOnly && "bg-muted cursor-not-allowed"
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary & Result */}
        <div className="space-y-6">
          <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-6 sticky top-24">
            <h3 className="font-bold border-b pb-2 flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" />
              Final Evaluation
            </h3>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground flex justify-between">
                  <span>Overall Result</span>
                  <span className="text-[10px] font-normal text-primary lowercase italic">(Auto-calculated)</span>
                </label>
                <div className="flex gap-2">
                  <div 
                    className={cn(
                      "flex-1 py-3 rounded-xl border-2 font-bold transition-all flex items-center justify-center gap-2",
                      evaluation.result === 'pass' ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-transparent bg-muted/20 text-muted-foreground opacity-30"
                    )}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Pass
                  </div>
                  <div 
                    className={cn(
                      "flex-1 py-3 rounded-xl border-2 font-bold transition-all flex items-center justify-center gap-2",
                      evaluation.result === 'fail' ? "border-rose-500 bg-rose-50 text-rose-700" : "border-transparent bg-muted/20 text-muted-foreground opacity-30"
                    )}
                  >
                    <XCircle className="w-4 h-4" />
                    Fail
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground flex justify-between">
                  <span>Re-assessment Required?</span>
                  <span className="text-[10px] font-normal text-primary lowercase italic">(Auto-calculated)</span>
                </label>
                <div 
                  className={cn(
                    "w-full py-3 rounded-xl border-2 font-bold flex items-center justify-center gap-2 transition-all",
                    evaluation.retestRequired 
                      ? "border-amber-500 bg-amber-50 text-amber-700" 
                      : "border-emerald-500 bg-emerald-50 text-emerald-700"
                  )}
                >
                  {evaluation.retestRequired ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  {evaluation.retestRequired ? 'Re-assessment Required' : 'No Re-assessment Needed'}
                </div>
                <div className="p-3 bg-muted/30 rounded-lg border border-dashed text-[10px] text-muted-foreground font-medium leading-relaxed">
                  <p className="flex items-center gap-1.5 mb-1 text-primary">
                    <Info className="w-3 h-3" />
                    <span>Evaluation Rule:</span>
                  </p>
                  <p>• Pass (≥80.0%): Re-assessment is automatically disabled.</p>
                  <p>• Fail (&lt;80.0%): Re-assessment is automatically enabled.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Strengths</label>
                <textarea 
                  value={evaluation.strengths}
                  readOnly={isReadOnly}
                  onChange={e => setEvaluation({...evaluation, strengths: e.target.value})}
                  className={cn(
                    "w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px] text-sm",
                    isReadOnly && "bg-muted cursor-not-allowed"
                  )}
                  placeholder={isReadOnly ? "" : "What did the employee do well?"}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Areas for Improvement</label>
                <textarea 
                  value={evaluation.improvements}
                  readOnly={isReadOnly}
                  onChange={e => setEvaluation({...evaluation, improvements: e.target.value})}
                  className={cn(
                    "w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px] text-sm",
                    isReadOnly && "bg-muted cursor-not-allowed"
                  )}
                  placeholder={isReadOnly ? "" : "Where can they grow?"}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Overall Comments</label>
                <textarea 
                  value={evaluation.overallComments}
                  readOnly={isReadOnly}
                  onChange={e => setEvaluation({...evaluation, overallComments: e.target.value})}
                  className={cn(
                    "w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px] text-sm",
                    isReadOnly && "bg-muted cursor-not-allowed"
                  )}
                  placeholder={isReadOnly ? "" : "Final feedback for the employee..."}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
