import React, { useState } from 'react';
import { X, Save, Plus, Trash2, FileCheck, Mail, Calendar, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { TrainingRegisterTemplateConfig } from '../types';
import { trainingRegisterService } from '../services/trainingRegisterService';

interface TrainingRegisterTemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TrainingRegisterTemplateConfig;
  onSaved: (updatedConfig: TrainingRegisterTemplateConfig) => void;
  userId?: string;
}

export const TrainingRegisterTemplateEditorModal: React.FC<TrainingRegisterTemplateEditorModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaved,
  userId
}) => {
  const [formData, setFormData] = useState<TrainingRegisterTemplateConfig>({ ...config });
  const [newMode, setNewMode] = useState('');
  const [newQaEmail, setNewQaEmail] = useState('');
  const [newItEmail, setNewItEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleAddMode = () => {
    if (!newMode.trim()) return;
    if (formData.availableModes.includes(newMode.trim())) {
      toast.error('Training mode already exists');
      return;
    }
    setFormData({
      ...formData,
      availableModes: [...formData.availableModes, newMode.trim()]
    });
    setNewMode('');
  };

  const handleRemoveMode = (mode: string) => {
    if (formData.availableModes.length <= 1) {
      toast.error('At least one training mode is required');
      return;
    }
    setFormData({
      ...formData,
      availableModes: formData.availableModes.filter((m) => m !== mode)
    });
  };

  const handleAddQaEmail = () => {
    if (!newQaEmail.trim() || !newQaEmail.includes('@')) {
      toast.error('Please provide a valid email address');
      return;
    }
    if (formData.qualityTeamEmails.includes(newQaEmail.trim())) return;
    setFormData({
      ...formData,
      qualityTeamEmails: [...formData.qualityTeamEmails, newQaEmail.trim()]
    });
    setNewQaEmail('');
  };

  const handleRemoveQaEmail = (email: string) => {
    setFormData({
      ...formData,
      qualityTeamEmails: formData.qualityTeamEmails.filter((e) => e !== email)
    });
  };

  const handleAddItEmail = () => {
    if (!newItEmail.trim() || !newItEmail.includes('@')) {
      toast.error('Please provide a valid email address');
      return;
    }
    if (formData.itTeamEmails.includes(newItEmail.trim())) return;
    setFormData({
      ...formData,
      itTeamEmails: [...formData.itTeamEmails, newItEmail.trim()]
    });
    setNewItEmail('');
  };

  const handleRemoveItEmail = (email: string) => {
    setFormData({
      ...formData,
      itTeamEmails: formData.itTeamEmails.filter((e) => e !== email)
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.documentCode.trim()) {
      toast.error('Document Code is required (e.g. OPS-TRG-REG)');
      return;
    }
    if (!formData.version.trim()) {
      toast.error('Template Version is required (e.g. V1.1.3)');
      return;
    }
    if (!formData.effectiveDate.trim()) {
      toast.error('Effective Date is required (e.g. 27-Jul-2026)');
      return;
    }

    setIsSaving(true);
    try {
      await trainingRegisterService.saveTemplateConfig(formData, userId);
      toast.success('Training Register Template specifications updated successfully');
      onSaved(formData);
      onClose();
    } catch (err) {
      console.error('Failed to save template config:', err);
      toast.error('Failed to update template configuration');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl border flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Configure Training Register Template</h3>
              <p className="text-xs text-muted-foreground">Standardized header, footer, metadata &amp; recipient workflows</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Template Identification */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> SOP Template Metadata &amp; Footer Specifications
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Document Code <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={formData.documentCode}
                  onChange={(e) => setFormData({ ...formData, documentCode: e.target.value })}
                  placeholder="e.g. OPS-TRG-REG"
                  className="w-full px-3 py-2 bg-background border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Template Version <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  placeholder="e.g. V1.1.3"
                  className="w-full px-3 py-2 bg-background border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Effective Date (DD-MMM-YYYY) <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.effectiveDate}
                    onChange={(e) => setFormData({ ...formData, effectiveDate: e.target.value })}
                    placeholder="e.g. 27-Jul-2026"
                    className="w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Footer Confidentiality Text
              </label>
              <input
                type="text"
                value={formData.confidentialText}
                onChange={(e) => setFormData({ ...formData, confidentialText: e.target.value })}
                placeholder="e.g. Confidential"
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Live Footer Preview */}
            <div className="bg-muted/40 p-3 rounded-xl border border-dashed text-xs text-muted-foreground flex items-center justify-between font-mono">
              <span>{formData.documentCode || 'OPS-TRG-REG'} {formData.version || 'V1.1.3'} | Date: {formData.effectiveDate || '27-Jul-2026'}</span>
              <span>{formData.confidentialText || 'Confidential'}</span>
              <span>Page 1 of 1</span>
            </div>
          </div>

          {/* Available Training Modes */}
          <div className="space-y-3 pt-3 border-t">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Dropdown Modes of Training
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMode}
                onChange={(e) => setNewMode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMode();
                  }
                }}
                placeholder="Add new mode (e.g. Workshop Training)..."
                className="flex-1 px-3 py-2 bg-background border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={handleAddMode}
                className="flex items-center gap-1 px-3.5 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Mode
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {formData.availableModes.map((mode) => (
                <div
                  key={mode}
                  className="flex items-center gap-2 px-3 py-1.5 bg-accent rounded-lg text-xs font-medium border"
                >
                  <span>{mode}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMode(mode)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Workflow Notification Recipients */}
          <div className="space-y-4 pt-3 border-t">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" /> Post-Completion Notification Distribution
            </h4>
            <p className="text-xs text-muted-foreground">
              When all attendee signatures and the trainer signature are fully captured, completion notifications and registers are automatically dispatched to these teams:
            </p>

            {/* Quality Team Emails */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-foreground">Quality Team Email List:</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newQaEmail}
                  onChange={(e) => setNewQaEmail(e.target.value)}
                  placeholder="quality@company.com"
                  className="flex-1 px-3 py-1.5 bg-background border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={handleAddQaEmail}
                  className="px-3 py-1.5 bg-accent hover:bg-accent/80 text-xs font-medium rounded-lg"
                >
                  Add Email
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.qualityTeamEmails.map((email) => (
                  <span key={email} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-md border border-emerald-200">
                    {email}
                    <button type="button" onClick={() => handleRemoveQaEmail(email)}>
                      <X className="w-3 h-3 hover:text-destructive" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* IT Team Emails */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-foreground">IT Team Email List:</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newItEmail}
                  onChange={(e) => setNewItEmail(e.target.value)}
                  placeholder="it@company.com"
                  className="flex-1 px-3 py-1.5 bg-background border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={handleAddItEmail}
                  className="px-3 py-1.5 bg-accent hover:bg-accent/80 text-xs font-medium rounded-lg"
                >
                  Add Email
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.itTeamEmails.map((email) => (
                  <span key={email} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-md border border-blue-200">
                    {email}
                    <button type="button" onClick={() => handleRemoveItEmail(email)}>
                      <X className="w-3 h-3 hover:text-destructive" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Template Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};
