import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Save, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  ChevronDown,
  ChevronUp,
  GripVertical,
  X,
  Loader2,
  FileUp,
  Sparkles,
  Eye,
  Clock,
  Award,
  FileText
} from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { Template, Question, Department } from '../types';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [newDept, setNewDept] = useState({ name: '', description: '' });
  
  const [template, setTemplate] = useState<Partial<Template>>({
    name: '',
    description: '',
    departmentId: '',
    skillCategory: '',
    difficulty: 'medium',
    duration: 30,
    passMark: 80,
    totalMarks: 100,
    instructions: '',
    questions: [],
    status: 'draft'
  });

  useEffect(() => {
    const loadData = async () => {
      if (id) {
        setLoading(true);
        const data = await firestoreService.getDocument<Template>('templates', id);
        if (data) setTemplate(data);
        setLoading(false);
      }
      const depts = await firestoreService.getCollection<Department>('departments');
      setDepartments(depts);
    };
    loadData();
  }, [id]);

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDept.name) return;
    try {
      const deptId = await firestoreService.createDocument('departments', newDept);
      const depts = await firestoreService.getCollection<Department>('departments');
      setDepartments(depts);
      setTemplate(prev => ({ ...prev, departmentId: deptId }));
      setIsDeptModalOpen(false);
      setNewDept({ name: '', description: '' });
    } catch (error) {
      console.error(error);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!template.name) {
      toast.error('Template Name is required');
      return;
    }
    if (!template.departmentId) {
      toast.error('Department is required');
      return;
    }
    if (!template.skillCategory) {
      toast.error('Category / Skill is required');
      return;
    }
    if (!template.questions || template.questions.length === 0) {
      toast.error('At least one question is required');
      return;
    }
    
    // Validate each question
    for (let i = 0; i < template.questions.length; i++) {
      const q = template.questions[i];
      if (!q.text) {
        toast.error(`Question ${i + 1} text is required`);
        return;
      }
      if (q.type === 'mcq') {
        if (!q.options || q.options.some(opt => !opt)) {
          toast.error(`All options for Question ${i + 1} must be filled`);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const { id: _, ...rest } = template;
      const data = {
        ...rest,
        createdBy: user?.uid,
        updatedAt: new Date().toISOString()
      };
      
      if (id) {
        // Force 100/80 on updates too
        data.totalMarks = 100;
        data.passMark = 80;
        await firestoreService.updateDocument('templates', id, data);
        await firestoreService.logActivity('Updated Template', 'Templates', { templateId: id, templateName: data.name }, user?.uid, user?.email);
      } else {
        // Force 100/80 on new templates just in case
        data.totalMarks = 100;
        data.passMark = 80;
        const newId = await firestoreService.createDocument('templates', data);
        await firestoreService.logActivity('Created Template', 'Templates', { templateId: newId, templateName: data.name }, user?.uid, user?.email);
      }
      navigate('/templates');
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template. Check your permissions.');
    } finally {
      setLoading(false);
    }
  };

  const distributeMarks = (questions: Question[]) => {
    if (questions.length === 0) return [];
    const baseMark = Math.floor(100 / questions.length);
    const remainder = 100 % questions.length;
    
    return questions.map((q, i) => ({
      ...q,
      marks: i === questions.length - 1 ? baseMark + remainder : baseMark
    }));
  };

  const addQuestion = () => {
    const newQuestion: Question = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'mcq',
      text: '',
      options: ['', '', '', ''],
      marks: 0
    };
    setTemplate(prev => {
      const newQuestions = distributeMarks([...(prev.questions || []), newQuestion]);
      return { ...prev, questions: newQuestions, totalMarks: 100 };
    });
  };

  const removeQuestion = (qId: string) => {
    setTemplate(prev => {
      const filtered = prev.questions?.filter(q => q.id !== qId) || [];
      const newQuestions = distributeMarks(filtered);
      return { ...prev, questions: newQuestions, totalMarks: 100 };
    });
  };

  const updateQuestion = (qId: string, updates: Partial<Question>) => {
    setTemplate(prev => {
      const newQuestions = prev.questions?.map(q => q.id === qId ? { ...q, ...updates } : q) || [];
      // If marks were manually updated, we might want to keep them, 
      // but the requirement says "total 100% only".
      // For now, let's allow manual adjustment but show a warning if total != 100
      return { ...prev, questions: newQuestions };
    });
  };

  if (loading && id) return <div className="flex items-center justify-center h-full">Loading template...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-sm py-4 z-10 border-b">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/templates')} className="p-2 hover:bg-accent rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">{id ? 'Edit Template' : 'New Assessment Template'}</h1>
            <p className="text-sm text-muted-foreground">Configure your assessment structure and questions.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsPreviewOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg font-semibold hover:bg-accent transition-all"
          >
            <Eye className="w-4 h-4" />
            <span>Preview</span>
          </button>
          <button 
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Template</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Basic Info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2">Basic Configuration</h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Template Name</label>
                <input 
                  type="text" 
                  value={template.name}
                  onChange={e => setTemplate({...template, name: e.target.value})}
                  placeholder="e.g. Senior Frontend Engineer Test"
                  className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Description</label>
                <textarea 
                  value={template.description}
                  onChange={e => setTemplate({...template, description: e.target.value})}
                  placeholder="Brief description of the assessment..."
                  className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Instructions</label>
                <textarea 
                  value={template.instructions}
                  onChange={e => setTemplate({...template, instructions: e.target.value})}
                  placeholder="Specific instructions for the candidate..."
                  className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Department</label>
                <div className="flex gap-2">
                  <select 
                    value={template.departmentId}
                    onChange={e => setTemplate({...template, departmentId: e.target.value})}
                    className="flex-1 px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Select Department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <button 
                    type="button"
                    onClick={() => setIsDeptModalOpen(true)}
                    className="p-2 border rounded-lg hover:bg-accent transition-colors"
                    title="Add Department"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Category / Skill</label>
                <input 
                  type="text" 
                  value={template.skillCategory}
                  onChange={e => setTemplate({...template, skillCategory: e.target.value})}
                  placeholder="e.g. React, Management, Sales"
                  className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Duration (Min)</label>
                  <input 
                    type="number" 
                    value={template.duration}
                    onChange={e => setTemplate({...template, duration: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Difficulty</label>
                  <select 
                    value={template.difficulty}
                    onChange={e => setTemplate({...template, difficulty: e.target.value as any})}
                    className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Total Weightage</label>
                  <input 
                    type="number" 
                    value={template.totalMarks}
                    readOnly
                    className="w-full px-3 py-2 bg-muted border rounded-lg outline-none cursor-not-allowed font-bold text-primary"
                  />
                  <p className="text-[10px] text-muted-foreground">Fixed at 100%</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Pass Mark (%)</label>
                  <input 
                    type="number" 
                    value={template.passMark}
                    readOnly
                    className="w-full px-3 py-2 bg-muted border rounded-lg outline-none cursor-not-allowed font-bold text-emerald-600"
                  />
                  <p className="text-[10px] text-muted-foreground">Fixed at 80%</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Status</label>
                  <select 
                    value={template.status}
                    onChange={e => setTemplate({...template, status: e.target.value as any})}
                    className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Questions List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h3 className="text-xl font-bold">Questions ({template.questions?.length || 0})</h3>
              <p className="text-xs text-muted-foreground">
                Current Total: <span className={cn(
                  "font-bold",
                  (template.questions?.reduce((sum, q) => sum + (q.marks || 0), 0) || 0) === 100 ? "text-emerald-600" : "text-rose-600"
                )}>
                  {template.questions?.reduce((sum, q) => sum + (q.marks || 0), 0) || 0} / 100
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setTemplate(prev => ({ ...prev, questions: distributeMarks(prev.questions || []) }))}
                className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-all"
                title="Equally distribute 100 marks across all questions"
              >
                <Sparkles className="w-4 h-4" />
                <span>Auto-Balance</span>
              </button>
              <button 
                onClick={addQuestion}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/80 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Add Question</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {template.questions?.map((q, index) => (
              <div key={q.id} className="bg-card rounded-2xl border shadow-sm overflow-hidden group">
                <div className="p-4 bg-muted/30 border-b flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab" />
                    <span className="text-sm font-bold text-muted-foreground">Q{index + 1}</span>
                    <select 
                      value={q.type}
                      onChange={e => updateQuestion(q.id, { type: e.target.value as any })}
                      className="bg-background border rounded px-2 py-1 text-xs font-medium outline-none"
                    >
                      <option value="mcq">Multiple Choice</option>
                      <option value="true_false">True / False</option>
                      <option value="short_answer">Short Answer</option>
                      <option value="descriptive">Descriptive</option>
                      <option value="rating">Rating Scale</option>
                      <option value="file_upload">File Upload</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Weightage:</span>
                      <div className="w-12 bg-muted border rounded px-1 py-0.5 text-xs text-center font-bold">
                        {q.marks}%
                      </div>
                    </div>
                    <button onClick={() => removeQuestion(q.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <textarea 
                    value={q.text}
                    onChange={e => updateQuestion(q.id, { text: e.target.value })}
                    placeholder="Enter question text here..."
                    className="w-full bg-transparent border-none outline-none text-lg font-medium resize-none focus:ring-0 placeholder:text-muted-foreground/30"
                    rows={2}
                  />
                  
                  {q.type === 'mcq' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {q.options?.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                            {String.fromCharCode(65 + i)}
                          </div>
                          <input 
                            type="text" 
                            value={opt}
                            onChange={e => {
                              const newOpts = [...(q.options || [])];
                              newOpts[i] = e.target.value;
                              updateQuestion(q.id, { options: newOpts });
                            }}
                            placeholder={`Option ${i + 1}`}
                            className="flex-1 bg-muted/50 border-none rounded-lg px-3 py-2 text-sm outline-none focus:bg-accent transition-all"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {q.type === 'true_false' && (
                    <div className="flex gap-4">
                      {['True', 'False'].map(val => (
                        <button 
                          key={val}
                          onClick={() => updateQuestion(q.id, { correctAnswer: val })}
                          className={cn(
                            "px-6 py-2 rounded-lg border text-sm font-medium transition-all",
                            q.correctAnswer === val ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                          )}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  )}

                  {q.type === 'file_upload' && (
                    <div className="p-4 bg-accent/20 rounded-xl border border-dashed flex flex-col items-center gap-2">
                      <FileUp className="w-6 h-6 text-muted-foreground" />
                      <span className="text-sm font-medium">Candidate will be asked to upload a file (PDF, DOC, DOCX)</span>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-muted-foreground">Allowed formats:</span>
                        <div className="flex gap-1">
                          {['PDF', 'DOC', 'DOCX'].map(ext => (
                            <span key={ext} className="px-2 py-0.5 bg-background border rounded text-[10px] font-bold uppercase">{ext}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {template.questions?.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 bg-muted/30 rounded-3xl border-2 border-dashed">
                <Sparkles className="w-12 h-12 text-primary/30 mb-4" />
                <h3 className="text-lg font-medium">Add your first question</h3>
                <p className="text-muted-foreground">Use the AI extractor or add manually.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Department Modal */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between bg-muted/30">
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
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <span>Create Department</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-3xl max-h-[90vh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b flex items-center justify-between bg-muted/30">
              <div>
                <h2 className="text-xl font-bold">{template.name || 'Untitled Template'}</h2>
                <p className="text-sm text-muted-foreground">{template.skillCategory || 'No Category'} • {template.difficulty} • {template.duration} mins</p>
              </div>
              <button onClick={() => setIsPreviewOpen(false)} className="p-2 hover:bg-accent rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>Duration: <span className="text-foreground font-medium">{template.duration} Minutes</span></span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Award className="w-4 h-4" />
                    <span>Total Weightage: <span className="text-foreground font-medium">{template.totalMarks.toFixed(1)}%</span></span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    <span>Questions: <span className="text-foreground font-medium">{template.questions?.length || 0}</span></span>
                  </div>
                </div>
                
                <div className="p-4 bg-accent/20 rounded-xl border">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Instructions</h4>
                  <p className="text-sm whitespace-pre-wrap">{template.instructions || 'No special instructions provided.'}</p>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="font-bold text-lg border-b pb-2">Assessment Content</h3>
                {template.questions?.map((q, idx) => (
                  <div key={q.id} className="space-y-3 p-4 rounded-xl border bg-muted/10">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        <p className="font-medium">{q.text || 'Empty question text'}</p>
                      </div>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-accent rounded whitespace-nowrap">
                        {q.marks.toFixed(1)}% Weightage
                      </span>
                    </div>

                    {q.type === 'mcq' && q.options && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 ml-9">
                        {q.options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 rounded-lg border bg-background text-sm">
                            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                              {String.fromCharCode(65 + i)}
                            </span>
                            {opt || `Option ${i + 1}`}
                          </div>
                        ))}
                      </div>
                    )}

                    {q.type === 'true_false' && (
                      <div className="flex gap-3 ml-9">
                        {['True', 'False'].map(val => (
                          <div key={val} className="px-4 py-1.5 rounded-lg border bg-background text-sm font-medium">
                            {val}
                          </div>
                        ))}
                      </div>
                    )}

                    {q.type === 'short_answer' && (
                      <div className="ml-9 h-10 w-full max-w-md border-b-2 border-dashed border-muted-foreground/30" />
                    )}

                    {q.type === 'descriptive' && (
                      <div className="ml-9 space-y-2">
                        <div className="h-4 w-full border-b border-dashed border-muted-foreground/20" />
                        <div className="h-4 w-full border-b border-dashed border-muted-foreground/20" />
                        <div className="h-4 w-3/4 border-b border-dashed border-muted-foreground/20" />
                      </div>
                    )}

                    {q.type === 'file_upload' && (
                      <div className="ml-9 p-4 border border-dashed rounded-xl flex flex-col items-center gap-2 text-muted-foreground">
                        <FileUp className="w-5 h-5" />
                        <span className="text-xs">File upload area</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t bg-muted/30 flex justify-end">
              <button 
                onClick={() => setIsPreviewOpen(false)}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-bold hover:opacity-90 transition-all"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
