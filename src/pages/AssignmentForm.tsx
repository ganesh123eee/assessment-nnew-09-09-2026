import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Save, 
  ArrowLeft, 
  Users, 
  Building2, 
  Calendar, 
  Clock, 
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  ListFilter,
  Info,
  Loader2,
  RotateCcw
} from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { Template, User, Department, Assignment } from '../types';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export default function AssignmentForm() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [formData, setFormData] = useState<any>({
    templateSelections: {}, // { [templateId]: string[] }
    type: 'individual',
    targetIds: [],
    reviewerId: '',
    startDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    attemptLimit: 1,
    duration: 30,
    instructions: '',
    allowRetest: false,
    randomizeQuestions: false,
    autoSubmitOnTimeout: true,
    notificationEnabled: true,
    status: 'active'
  });

  const [expandedDepts, setExpandedDepts] = useState<string[]>([]);
  const [expandedTemplates, setExpandedTemplates] = useState<string[]>([]);

  const toggleDept = (deptId: string) => {
    setExpandedDepts(prev => 
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    );
  };

  const toggleTemplateQuestions = (templateId: string) => {
    setExpandedTemplates(prev => 
      prev.includes(templateId) ? prev.filter(id => id !== templateId) : [...prev, templateId]
    );
  };

  useEffect(() => {
    const loadData = async () => {
      const [t, u, d] = await Promise.all([
        firestoreService.getCollection<Template>('templates', []),
        firestoreService.getCollection<User>('users', []),
        firestoreService.getCollection<Department>('departments', [])
      ]);
      setTemplates(t.filter(item => item.status === 'active' || item.status === 'draft'));
      setUsers(u);
      setDepartments(d);
    };
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedTemplateIds = Object.keys(formData.templateSelections);
    
    if (selectedTemplateIds.length === 0) {
      toast.error('Please select at least one assessment template');
      return;
    }
    
    if (formData.targetIds?.length === 0) {
      toast.error(formData.type === 'individual' ? 'Please select at least one employee' : 'Please select at least one department');
      return;
    }
    
    if (!formData.reviewerId) {
      toast.error('Please select an assigned reviewer');
      return;
    }

    if (!formData.dueDate) {
      toast.error('Please select a due date');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    if (formData.dueDate < today) {
      toast.error('Due date cannot be in the past');
      return;
    }

    setLoading(true);
    try {
      const createdAssignments = [];
      
      for (const templateId of selectedTemplateIds) {
        const template = templates.find(t => t.id === templateId);
        const selectedQuestionIds = formData.templateSelections[templateId];
        
        // Remove templateSelections from the data being saved to Firestore
        const { templateSelections, ...assignmentData } = formData;
        
        const newId = await firestoreService.createDocument('assignments', {
          ...assignmentData,
          templateId,
          selectedQuestionIds: selectedQuestionIds.length > 0 ? selectedQuestionIds : [],
          assignedBy: currentUser?.uid,
          linkExpiryDate: formData.dueDate,
          duration: selectedTemplateIds.length === 1 ? formData.duration : (template?.duration || 30)
        });
        
        createdAssignments.push({ id: newId, template });
      }

      if (formData.notificationEnabled && createdAssignments.length > 0) {
        let recipients: User[] = [];
        const targetIds = formData.targetIds || [];
        
        if (formData.type === 'individual') {
          recipients = users.filter(u => targetIds.includes(u.uid));
        } else {
          recipients = users.filter(u => u.departmentId && targetIds.includes(u.departmentId));
        }

        for (const recipient of recipients) {
          if (!recipient.email) continue;
          
          const assessmentListHtml = createdAssignments.map(item => {
            const assessmentLink = `${window.location.origin}/portal/${item.id}`;
            return `
              <div style="background-color: #f8fafc; padding: 15px; border-radius: 10px; margin-bottom: 15px; border: 1px solid #f1f5f9;">
                <p style="margin: 0; color: #0f172a; font-weight: bold;">${item.template?.name}</p>
                <p style="margin: 5px 0; color: #64748b; font-size: 13px;">Duration: ${item.template?.duration || 30} minutes</p>
                <div style="margin-top: 10px;">
                  <a href="${assessmentLink}" style="display: inline-block; background-color: #2563eb; color: white; padding: 8px 16px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Start Assessment</a>
                </div>
              </div>
            `;
          }).join('');

          const emailData = {
            to: recipient.email,
            subject: createdAssignments.length === 1 
              ? `New Assessment Assigned: ${createdAssignments[0].template?.name}`
              : `Multiple New Assessments Assigned (${createdAssignments.length})`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h1 style="color: #2563eb; margin: 0;">AssessPro</h1>
                  <p style="color: #64748b; margin: 5px 0 0 0;">Enterprise Assessment Portal</p>
                </div>
                <h2 style="color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                  ${createdAssignments.length === 1 ? 'New Assessment Assigned' : 'New Assessments Assigned'}
                </h2>
                <p>Hello <strong>${recipient.displayName}</strong>,</p>
                <p>
                  ${createdAssignments.length === 1 
                    ? `A new assessment has been assigned to you by your HR/Manager.`
                    : `Multiple new assessments have been assigned to you by your HR/Manager.`}
                </p>
                
                <div style="margin: 25px 0;">
                  ${assessmentListHtml}
                </div>

                <div style="background-color: #f1f5f9; padding: 15px; border-radius: 10px; margin-top: 20px;">
                  <p style="margin: 0; color: #475569; font-size: 13px;"><strong>Due Date:</strong> ${formData.dueDate}</p>
                  <p style="margin: 5px 0 0 0; color: #475569; font-size: 13px;"><strong>Instructions:</strong> ${formData.instructions || 'Follow the on-screen guidelines.'}</p>
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
            console.error('Failed to trigger email sending:', error);
          }
        }
      }

      await firestoreService.logActivity('Created Multiple Assignments', 'Assignments', { 
        count: createdAssignments.length,
        templateNames: createdAssignments.map(a => a.template?.name).join(', '),
        targetCount: formData.targetIds?.length,
        type: formData.type
      }, currentUser?.uid, currentUser?.email);

      toast.success(`${createdAssignments.length} Assessment(s) assigned successfully!`);
      navigate('/assignments');
    } catch (error: any) {
      console.error('Error creating assignment:', error);
      toast.error(`Failed to create assignment: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const reviewers = users.filter(u => {
    const roles = u.roles || (u.role ? [u.role] : []);
    return roles.some(r => ['reviewer', 'hr_admin', 'super_admin', 'quality_management'].includes(r));
  });
  const employees = users;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/assignments')} className="p-2 hover:bg-accent rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">New Assessment Assignment</h1>
            <p className="text-sm text-muted-foreground">Assign assessments to individuals or departments.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          {/* Main Config */}
          <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Select Assessment Templates & Questions</label>
                <div className="space-y-2 max-h-[400px] overflow-y-auto p-4 bg-muted/30 rounded-xl border">
                  {departments.map(dept => {
                    const deptTemplates = templates.filter(t => t.departmentId === dept.id);
                    if (deptTemplates.length === 0) return null;

                    const isExpanded = expandedDepts.includes(dept.id);

                    return (
                      <div key={dept.id} className="border rounded-lg bg-background overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleDept(dept.id)}
                          className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-primary" />
                            <span className="font-semibold text-sm">{dept.name}</span>
                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              {deptTemplates.length} Templates
                            </span>
                          </div>
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>

                        {isExpanded && (
                          <div className="p-2 space-y-2 bg-muted/10 border-t">
                            {deptTemplates.map(t => {
                              const isSelected = !!formData.templateSelections[t.id];
                              const isTemplateExpanded = expandedTemplates.includes(t.id);
                              const selectedQuestions = formData.templateSelections[t.id] || [];

                              return (
                                <div key={t.id} className="border rounded-lg bg-background">
                                  <div className="flex items-center gap-2 p-2">
                                    <input 
                                      type="checkbox" 
                                      checked={isSelected}
                                      onChange={e => {
                                        const newSelections = { ...formData.templateSelections };
                                        if (e.target.checked) {
                                          newSelections[t.id] = []; // Default to all questions
                                        } else {
                                          delete newSelections[t.id];
                                        }
                                        
                                        const selectedIds = Object.keys(newSelections);
                                        const updates: any = { templateSelections: newSelections };
                                        if (selectedIds.length === 1) {
                                          const selected = templates.find(item => item.id === selectedIds[0]);
                                          updates.duration = selected?.duration || 30;
                                        } else {
                                          updates.duration = 0; 
                                        }
                                        setFormData({...formData, ...updates});
                                      }}
                                      className="rounded border-muted text-primary focus:ring-primary"
                                    />
                                    <div className="flex-1 flex items-center justify-between">
                                      <div className="flex flex-col">
                                        <span className="text-sm font-medium">{t.name}</span>
                                        <span className="text-[10px] text-muted-foreground">{t.skillCategory} • {t.duration}m</span>
                                      </div>
                                      {isSelected && (
                                        <button
                                          type="button"
                                          onClick={() => toggleTemplateQuestions(t.id)}
                                          className="text-[10px] flex items-center gap-1 text-primary hover:underline"
                                        >
                                          <ListFilter className="w-3 h-3" />
                                          {selectedQuestions.length > 0 
                                            ? `${selectedQuestions.length}/${t.questions.length} Questions` 
                                            : "All Questions Selected"}
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {isSelected && isTemplateExpanded && (
                                    <div className="p-3 border-t bg-muted/5 space-y-2">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Select Specific Questions</span>
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const newSelections = { ...formData.templateSelections };
                                              newSelections[t.id] = [];
                                              setFormData({ ...formData, templateSelections: newSelections });
                                            }}
                                            className="text-[10px] text-primary hover:underline"
                                          >
                                            Select All
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const newSelections = { ...formData.templateSelections };
                                              newSelections[t.id] = t.questions.map(q => q.id);
                                              setFormData({ ...formData, templateSelections: newSelections });
                                            }}
                                            className="text-[10px] text-primary hover:underline"
                                          >
                                            Clear All
                                          </button>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto pr-2">
                                        {t.questions.map((q, idx) => {
                                          const isQSelected = selectedQuestions.length === 0 || selectedQuestions.includes(q.id);
                                          return (
                                            <label key={q.id} className="flex items-start gap-2 p-1.5 hover:bg-background rounded transition-colors cursor-pointer group">
                                              <input
                                                type="checkbox"
                                                checked={isQSelected}
                                                onChange={e => {
                                                  const newSelections = { ...formData.templateSelections };
                                                  let currentSelected = [...selectedQuestions];
                                                  
                                                  // If it was "all selected" (empty array), populate it first
                                                  if (currentSelected.length === 0) {
                                                    currentSelected = t.questions.map(item => item.id);
                                                  }

                                                  if (e.target.checked) {
                                                    currentSelected.push(q.id);
                                                  } else {
                                                    currentSelected = currentSelected.filter(id => id !== q.id);
                                                  }

                                                  // If all are selected, keep it empty for "all"
                                                  if (currentSelected.length === t.questions.length) {
                                                    newSelections[t.id] = [];
                                                  } else {
                                                    newSelections[t.id] = currentSelected;
                                                  }
                                                  
                                                  setFormData({ ...formData, templateSelections: newSelections });
                                                }}
                                                className="mt-1 rounded border-muted text-primary focus:ring-primary"
                                              />
                                              <div className="flex-1">
                                                <p className="text-xs font-medium group-hover:text-primary transition-colors">
                                                  Q{idx + 1}: {q.text}
                                                </p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                  <span className="text-[9px] px-1.5 py-0.5 bg-muted rounded uppercase font-bold text-muted-foreground">
                                                    {q.type.replace('_', ' ')}
                                                  </span>
                                                  <span className="text-[9px] text-muted-foreground">{q.marks}% Weightage</span>
                                                </div>
                                              </div>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Uncategorized Templates */}
                  {templates.filter(t => !t.departmentId).length > 0 && (
                    <div className="border rounded-lg bg-background overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleDept('uncategorized')}
                        className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Info className="w-4 h-4 text-muted-foreground" />
                          <span className="font-semibold text-sm">Uncategorized</span>
                        </div>
                        {expandedDepts.includes('uncategorized') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      {expandedDepts.includes('uncategorized') && (
                        <div className="p-2 space-y-2 bg-muted/10 border-t">
                          {templates.filter(t => !t.departmentId).map(t => {
                            const isSelected = !!formData.templateSelections[t.id];
                            const isTemplateExpanded = expandedTemplates.includes(t.id);
                            const selectedQuestions = formData.templateSelections[t.id] || [];

                            return (
                              <div key={t.id} className="border rounded-lg bg-background">
                                <div className="flex items-center gap-2 p-2">
                                  <input 
                                    type="checkbox" 
                                    checked={isSelected}
                                    onChange={e => {
                                      const newSelections = { ...formData.templateSelections };
                                      if (e.target.checked) {
                                        newSelections[t.id] = [];
                                      } else {
                                        delete newSelections[t.id];
                                      }
                                      
                                      const selectedIds = Object.keys(newSelections);
                                      const updates: any = { templateSelections: newSelections };
                                      if (selectedIds.length === 1) {
                                        const selected = templates.find(item => item.id === selectedIds[0]);
                                        updates.duration = selected?.duration || 30;
                                      } else {
                                        updates.duration = 0;
                                      }
                                      setFormData({...formData, ...updates});
                                    }}
                                    className="rounded border-muted text-primary focus:ring-primary"
                                  />
                                  <div className="flex-1 flex items-center justify-between">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium">{t.name}</span>
                                      <span className="text-[10px] text-muted-foreground">{t.skillCategory}</span>
                                    </div>
                                    {isSelected && (
                                      <button
                                        type="button"
                                        onClick={() => toggleTemplateQuestions(t.id)}
                                        className="text-[10px] flex items-center gap-1 text-primary hover:underline"
                                      >
                                        <ListFilter className="w-3 h-3" />
                                        {selectedQuestions.length > 0 ? `${selectedQuestions.length} Qs` : "All Qs"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {isSelected && isTemplateExpanded && (
                                  <div className="p-3 border-t bg-muted/5 space-y-2">
                                    {/* Question selection logic same as above */}
                                    <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto pr-2">
                                      {t.questions.map((q, idx) => (
                                        <label key={q.id} className="flex items-start gap-2 p-1.5 hover:bg-background rounded transition-colors cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={selectedQuestions.length === 0 || selectedQuestions.includes(q.id)}
                                            onChange={e => {
                                              const newSelections = { ...formData.templateSelections };
                                              let currentSelected = [...selectedQuestions];
                                              if (currentSelected.length === 0) currentSelected = t.questions.map(item => item.id);
                                              if (e.target.checked) currentSelected.push(q.id);
                                              else currentSelected = currentSelected.filter(id => id !== q.id);
                                              newSelections[t.id] = currentSelected.length === t.questions.length ? [] : currentSelected;
                                              setFormData({ ...formData, templateSelections: newSelections });
                                            }}
                                            className="mt-1 rounded border-muted text-primary focus:ring-primary"
                                          />
                                          <span className="text-xs">Q{idx + 1}: {q.text}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {templates.length === 0 && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    No active or draft templates found. Please create a template first.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Assignment Type</label>
                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, type: 'individual', targetIds: []})}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all",
                      formData.type === 'individual' ? "border-primary bg-primary/5 text-primary" : "border-transparent bg-muted/50 text-muted-foreground"
                    )}
                  >
                    <Users className="w-5 h-5" />
                    <span className="font-semibold">Individual</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, type: 'department', targetIds: []})}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all",
                      formData.type === 'department' ? "border-primary bg-primary/5 text-primary" : "border-transparent bg-muted/50 text-muted-foreground"
                    )}
                  >
                    <Building2 className="w-5 h-5" />
                    <span className="font-semibold">Department</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  {formData.type === 'individual' ? 'Select Employees' : 'Select Departments'}
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-4 bg-muted/30 rounded-xl border">
                  {formData.type === 'individual' ? (
                    employees.map(emp => (
                      <label key={emp.uid} className="flex items-center gap-2 p-2 hover:bg-background rounded-lg cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={formData.targetIds?.includes(emp.uid)}
                          onChange={e => {
                            const ids = e.target.checked 
                              ? [...(formData.targetIds || []), emp.uid]
                              : formData.targetIds?.filter(id => id !== emp.uid);
                            setFormData({...formData, targetIds: ids});
                          }}
                          className="rounded border-muted text-primary focus:ring-primary"
                        />
                        <span className="text-sm">{emp.displayName}</span>
                      </label>
                    ))
                  ) : (
                    departments.map(dept => (
                      <label key={dept.id} className="flex items-center gap-2 p-2 hover:bg-background rounded-lg cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={formData.targetIds?.includes(dept.id)}
                          onChange={e => {
                            const ids = e.target.checked 
                              ? [...(formData.targetIds || []), dept.id]
                              : formData.targetIds?.filter(id => id !== dept.id);
                            setFormData({...formData, targetIds: ids});
                          }}
                          className="rounded border-muted text-primary focus:ring-primary"
                        />
                        <span className="text-sm">{dept.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2">Instructions for Employees</h3>
            <textarea 
              value={formData.instructions}
              onChange={e => setFormData({...formData, instructions: e.target.value})}
              placeholder="Enter special instructions or guidelines..."
              className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 min-h-[120px]"
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-6">
            <h3 className="font-semibold border-b pb-2">Reviewer & Rules</h3>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Assigned Reviewer</label>
                <select 
                  required
                  value={formData.reviewerId}
                  onChange={e => setFormData({...formData, reviewerId: e.target.value})}
                  className="w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select Reviewer...</option>
                  {reviewers.map(rev => (
                    <option key={rev.uid} value={rev.uid}>{rev.displayName}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Due Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input 
                    type="date" 
                    min={new Date().toISOString().split('T')[0]}
                    value={formData.dueDate}
                    onChange={e => setFormData({...formData, dueDate: e.target.value})}
                    className="w-full pl-10 pr-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Time Limit (Min)</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input 
                    type="text" 
                    readOnly
                    value={Object.keys(formData.templateSelections).length > 1 ? "Varies by template" : `${formData.duration} Minutes`}
                    className="w-full pl-10 pr-3 py-2 bg-muted border rounded-lg outline-none cursor-not-allowed text-muted-foreground"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">Time limit is fixed based on the selected assessment template.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Attempt Limit</label>
                <div className="relative">
                  <RotateCcw className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input 
                    type="number" 
                    min="1"
                    max="10"
                    value={formData.attemptLimit}
                    onChange={e => setFormData({...formData, attemptLimit: parseInt(e.target.value)})}
                    className="w-full pl-10 pr-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">Number of times the employee can attempt this test.</p>
              </div>

              <div className="pt-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={formData.allowRetest}
                    onChange={e => setFormData({...formData, allowRetest: e.target.checked})}
                    className="rounded border-muted text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium group-hover:text-primary transition-colors">Allow Re-assessment</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={formData.randomizeQuestions}
                    onChange={e => setFormData({...formData, randomizeQuestions: e.target.checked})}
                    className="rounded border-muted text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium group-hover:text-primary transition-colors">Randomize Questions</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={formData.notificationEnabled}
                    onChange={e => setFormData({...formData, notificationEnabled: e.target.checked})}
                    className="rounded border-muted text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium group-hover:text-primary transition-colors">Email Notifications</span>
                </label>
              </div>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
            <span>Confirm Assignment</span>
          </button>
        </div>
      </form>
    </div>
  );
}
