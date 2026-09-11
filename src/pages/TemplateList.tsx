import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, MoreVertical, Edit2, Trash2, Copy, FileUp, FileText, AlertCircle, X, Eye, Clock, Award, BookOpen, Settings, Mail, Calendar, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { firestoreService } from '../services/firestoreService';
import { where } from 'firebase/firestore';
import { toast } from 'sonner';
import { Template, Department, TrainingRegisterTemplateConfig } from '../types';
import { formatDate, cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { trainingRegisterService, DEFAULT_TEMPLATE_CONFIG } from '../services/trainingRegisterService';
import { TrainingRegisterTemplateEditorModal } from '../components/TrainingRegisterTemplateEditorModal';
import { BrandLogo } from '../components/BrandLogo';

export default function TemplateList() {
  const { user, branding, isAdmin, isHR } = useAuth();
  const [activeTab, setActiveTab] = useState<'assessments' | 'training_register'>('assessments');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Training Register template state
  const [trainingConfig, setTrainingConfig] = useState<TrainingRegisterTemplateConfig>(DEFAULT_TEMPLATE_CONFIG);
  const [isRegisterEditorOpen, setIsRegisterEditorOpen] = useState(false);

  useEffect(() => {
    // Log viewing activity
    firestoreService.logActivity('Viewed Templates', 'Templates', {}, user?.uid, user?.email);

    const loadData = async () => {
      try {
        const [depts, regConfig] = await Promise.all([
          firestoreService.getCollection<Department>('departments'),
          trainingRegisterService.getTemplateConfig()
        ]);
        setDepartments(depts);
        setTrainingConfig(regConfig);
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };
    loadData();

    const unsubscribe = firestoreService.subscribeToCollection<Template>('templates', [], (data) => {
      setTemplates(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.skillCategory.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    const template = templates.find(t => t.id === id);
    try {
      setError(null);
      
      // Delete related assignments and their submissions
      const assignments = await firestoreService.getCollection<any>('assignments', [
        where('templateId', '==', id)
      ]);
      
      for (const assign of assignments) {
        const submissions = await firestoreService.getCollection<any>('submissions', [
          where('assignmentId', '==', assign.id)
        ]);
        for (const sub of submissions) {
          await firestoreService.deleteDocument('submissions', sub.id);
        }
        await firestoreService.deleteDocument('assignments', assign.id);
      }

      await firestoreService.deleteDocument('templates', id);
      await firestoreService.logActivity('Deleted Template', 'Templates', { 
        templateId: id, 
        templateName: template?.name,
        deletedAssignmentsCount: assignments.length
      }, user?.uid, user?.email);
      setDeleteConfirmId(null);
      toast.success(`Template and ${assignments.length} related assignments deleted successfully`);
    } catch (error: any) {
      console.error('Error deleting template:', error);
      setError('Failed to delete template. You might not have permission.');
      setDeleteConfirmId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Templates Management</h1>
          <p className="text-muted-foreground mt-1">Design assessment questionnaires and configure standard SOP training register specifications.</p>
        </div>
        {activeTab === 'assessments' && (
          <div className="flex gap-3">
            <Link 
              to="/templates/new"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              <span>Create Template</span>
            </Link>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b">
        <button
          type="button"
          onClick={() => setActiveTab('assessments')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all',
            activeTab === 'assessments'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <FileText className="w-4 h-4" />
          <span>Assessment Questionnaires ({templates.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('training_register')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all',
            activeTab === 'training_register'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <BookOpen className="w-4 h-4" />
          <span>Training Register Template ({trainingConfig.documentCode})</span>
        </button>
      </div>

      {activeTab === 'training_register' ? (
        <div className="space-y-6">
          {/* Training Register Template Specification Card */}
          <div className="bg-card border rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 bg-primary/10 text-primary font-bold text-xs rounded-md">
                    SOP Compliance Template
                  </span>
                  <span className="text-xs font-mono font-bold text-muted-foreground">
                    Ref: {trainingConfig.documentCode} {trainingConfig.version}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-foreground">Standard Training Register Template</h2>
                <p className="text-sm text-muted-foreground">
                  Controls the master header, logo, default metadata, dropdown training modes, footer versioning, and post-completion notification routing.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsRegisterEditorOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-xs"
                >
                  <Settings className="w-4 h-4" /> Edit Template Settings
                </button>
                <Link
                  to="/training-registers"
                  className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium hover:bg-accent transition-colors"
                >
                  <BookOpen className="w-4 h-4" /> View Registers
                </Link>
              </div>
            </div>

            {/* Template Properties Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-muted/40 rounded-xl border">
                <span className="text-xs text-muted-foreground block font-medium">Document Code</span>
                <span className="text-base font-bold text-foreground font-mono">{trainingConfig.documentCode}</span>
              </div>
              <div className="p-4 bg-muted/40 rounded-xl border">
                <span className="text-xs text-muted-foreground block font-medium">Template Version</span>
                <span className="text-base font-bold text-foreground font-mono">{trainingConfig.version}</span>
              </div>
              <div className="p-4 bg-muted/40 rounded-xl border">
                <span className="text-xs text-muted-foreground block font-medium">Effective Date</span>
                <span className="text-base font-bold text-foreground font-mono">{trainingConfig.effectiveDate}</span>
              </div>
              <div className="p-4 bg-muted/40 rounded-xl border">
                <span className="text-xs text-muted-foreground block font-medium">Confidentiality</span>
                <span className="text-base font-bold text-foreground">{trainingConfig.confidentialText}</span>
              </div>
            </div>

            {/* Training Modes Config */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Configured Modes of Training (Dropdown Options)
              </h3>
              <div className="flex flex-wrap gap-2">
                {trainingConfig.availableModes.map((mode) => (
                  <span
                    key={mode}
                    className="px-3 py-1.5 bg-accent rounded-lg text-xs font-semibold border text-foreground"
                  >
                    {mode}
                  </span>
                ))}
              </div>
            </div>

            {/* Notification routing */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-emerald-600" /> Quality Team Notification List
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {trainingConfig.qualityTeamEmails.map((e) => (
                    <span key={e} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-md border border-emerald-200">
                      {e}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-600" /> IT Team Notification List
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {trainingConfig.itTeamEmails.map((e) => (
                    <span key={e} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-md border border-blue-200">
                      {e}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Document Preview Mock */}
            <div className="space-y-2 pt-4 border-t">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                Standard Register Header &amp; Footer Layout:
              </span>
              <div className="p-4 bg-muted/20 border-2 border-dashed rounded-xl space-y-3 text-xs">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span className="font-bold text-foreground">[Company Logo - Top Left]</span>
                  <span className="text-xs">Training Register Template</span>
                </div>
                <div className="text-center font-bold text-sm text-foreground underline">
                  Training Register
                </div>
                <div className="border border-muted-foreground/30 p-2 text-center text-muted-foreground italic rounded">
                  Training Title | Date (DD-MMM-YYYY) | Mode of Training | Start &amp; End Time | Trainer Signature &amp; Date | Assessment Conducted
                </div>
                <div className="border border-muted-foreground/30 p-2 text-center text-muted-foreground italic rounded">
                  Attendees List (S.No, Trainee Name, Date and Digital Signature)
                </div>
                <div className="flex justify-between items-center text-[11px] text-muted-foreground font-mono pt-2 border-t">
                  <span>{trainingConfig.documentCode} {trainingConfig.version} | Date: {trainingConfig.effectiveDate}</span>
                  <span className="font-bold">{trainingConfig.confidentialText}</span>
                  <span>Page 1 of 1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                type="text"
                placeholder="Search templates by name or category..."
                className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-accent transition-colors">
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </button>
          </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-xl border border-destructive/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-destructive/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <div key={template.id} className="bg-card p-6 rounded-2xl border shadow-sm hover:shadow-md transition-all group relative">
              <div className="flex items-start justify-between mb-4">
                <div className={cn(
                  "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                  template.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                )}>
                  {template.status}
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => setPreviewTemplate(template)}
                    className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-primary" 
                    title="Preview Template"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <Link to={`/templates/edit/${template.id}`} className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground" title="Edit Template">
                    <Edit2 className="w-4 h-4" />
                  </Link>
                  <button 
                    onClick={() => setDeleteConfirmId(template.id)}
                    className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-destructive" 
                    title="Delete Template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <h3 className="text-lg font-bold group-hover:text-primary transition-colors">{template.name}</h3>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{template.description}</p>
              
              <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {template.questions?.length || 0} Questions
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600 font-bold">
                    <Award className="w-3 h-3" />
                    100% (80% Pass)
                  </span>
                  <span className="bg-accent px-2 py-0.5 rounded-full">{template.skillCategory}</span>
                </div>
                <span>{formatDate(template.createdAt)}</span>
              </div>
            </div>
          ))}

          {filteredTemplates.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 bg-muted/30 rounded-3xl border-2 border-dashed">
              <FileText className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No templates found</h3>
              <p className="text-muted-foreground">Start by creating your first assessment template.</p>
              <Link to="/templates/new" className="mt-4 text-primary font-semibold hover:underline">Create now</Link>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-8 h-8 text-destructive" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Delete Template</h2>
                <p className="text-muted-foreground mt-1">Are you sure you want to delete this template? This action cannot be undone.</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-2 border rounded-lg font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDelete(deleteConfirmId)}
                  className="flex-1 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-3xl max-h-[90vh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b flex items-center justify-between bg-muted/30">
              <div>
                <h2 className="text-xl font-bold">{previewTemplate.name}</h2>
                <p className="text-sm text-muted-foreground">{previewTemplate.skillCategory} • {previewTemplate.difficulty} • {previewTemplate.duration} mins</p>
              </div>
              <button onClick={() => setPreviewTemplate(null)} className="p-2 hover:bg-accent rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto space-y-8">
              <div className="flex items-center justify-between border-b pb-6">
                <BrandLogo 
                  size="md" 
                  showAppName 
                  appNameClassName="text-lg font-bold tracking-tight text-primary leading-tight" 
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>Duration: <span className="text-foreground font-medium">{previewTemplate.duration} Minutes</span></span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Award className="w-4 h-4" />
                    <span>Total Weightage: <span className="text-foreground font-medium">100.0%</span></span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    <span>Questions: <span className="text-foreground font-medium">{previewTemplate.questions.length}</span></span>
                  </div>
                </div>
                
                <div className="p-4 bg-accent/20 rounded-xl border">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Instructions</h4>
                  <p className="text-sm whitespace-pre-wrap">{previewTemplate.instructions || 'No special instructions provided.'}</p>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="font-bold text-lg border-b pb-2">Assessment Content</h3>
                {previewTemplate.questions.map((q, idx) => (
                  <div key={q.id} className="space-y-3 p-4 rounded-xl border bg-muted/10">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        <p className="font-medium">{q.text}</p>
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
                            {opt}
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
                onClick={() => setPreviewTemplate(null)}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-bold hover:opacity-90 transition-all"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* Training Register Template Specification Editor Modal */}
      {isRegisterEditorOpen && (
        <TrainingRegisterTemplateEditorModal
          isOpen={isRegisterEditorOpen}
          onClose={() => setIsRegisterEditorOpen(false)}
          config={trainingConfig}
          onSaved={(updated) => setTrainingConfig(updated)}
          userId={user?.uid}
        />
      )}
    </div>
  );
}
