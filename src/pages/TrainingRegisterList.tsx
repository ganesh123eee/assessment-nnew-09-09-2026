import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Eye, 
  Trash2, 
  Calendar, 
  User, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  FileCheck,
  BookOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { firestoreService } from '../services/firestoreService';
import { TrainingRegister } from '../types';
import { formatDate, cn } from '../lib/utils';
import { trainingRegisterService } from '../services/trainingRegisterService';

export default function TrainingRegisterList() {
  const { user: currentUser, branding, isAdmin, isHR, isQM, hasPermission } = useAuth();
  const [registers, setRegisters] = useState<TrainingRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [registerToDelete, setRegisterToDelete] = useState<TrainingRegister | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = firestoreService.subscribeToCollection<TrainingRegister>(
      'training_registers',
      [],
      (data) => {
        // Guarantee every item has a valid id and sort descending by creation date
        const mapped = data.map((item) => ({
          ...item,
          id: item.id || (item as any)._id || ''
        }));

        setRegisters(
          mapped.sort(
            (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          )
        );
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleDelete = async (reg: TrainingRegister) => {
    if (!reg || !reg.id) {
      toast.error('Unable to delete: Register ID is missing');
      return;
    }

    setIsDeleting(true);
    const toastId = toast.loading(`Deleting register "${reg.trainingTitle || 'Training Register'}"...`);

    try {
      await firestoreService.deleteDocument('training_registers', reg.id);
      await firestoreService.logActivity(
        'Delete Training Register',
        'Training Registers',
        { id: reg.id, title: reg.trainingTitle },
        currentUser?.uid,
        currentUser?.email
      );
      toast.success('Training Register deleted successfully', { id: toastId });
      setRegisterToDelete(null);
    } catch (err) {
      console.error('Failed to delete register:', err);
      toast.error('Failed to delete training register', { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async (register: TrainingRegister) => {
    setDownloadingId(register.id);
    try {
      await trainingRegisterService.generateTrainingRegisterPDF(register, branding);
      toast.success('Downloaded Training Register PDF');
    } catch (err) {
      console.error('Failed to download PDF:', err);
      toast.error('Failed to generate PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const filteredRegisters = registers.filter((r) => {
    const matchesSearch =
      r.trainingTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.trainerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.date?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || r.workflowStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Training Registers</h1>
          <p className="text-muted-foreground mt-1">
            Manage SOP attendance registers, monitor sequential signatures, and download verified compliance records.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/training-registers/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-xs text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Training Register</span>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-card p-4 rounded-2xl border shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by training title, trainer, date..."
            className="w-full pl-9 pr-4 py-2 bg-background border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-background border rounded-xl text-sm outline-none cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In Progress (Signing)</option>
            <option value="awaiting_trainer">Awaiting Trainer</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Registers List Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredRegisters.length === 0 ? (
        <div className="bg-card border rounded-2xl p-12 text-center space-y-4">
          <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto" />
          <div>
            <h3 className="font-bold text-lg text-foreground">No Training Registers Found</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
              {searchTerm || statusFilter !== 'all'
                ? 'No registers match your search criteria.'
                : 'Create your first digital training register session with attendance tracking and digital signatures.'}
            </p>
          </div>
          <Link
            to="/training-registers/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Create Training Register
          </Link>
        </div>
      ) : (
        <div className="bg-card border rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Training Title</th>
                  <th className="py-3 px-4">Date &amp; Time</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Trainer</th>
                  <th className="py-3 px-4">Attendees Signed</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRegisters.map((reg) => {
                  const signedCount = (reg.attendees || []).filter((a) => a.status === 'signed' || a.signatureData).length;
                  const totalAttendees = (reg.attendees || []).length;
                  const isCompleted = reg.workflowStatus === 'completed';

                  return (
                    <tr key={reg.id} className="hover:bg-muted/30 transition-colors">
                      {/* Title */}
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        <Link
                          to={`/training-registers/${reg.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {reg.trainingTitle || 'Untitled Register'}
                        </Link>
                        <span className="block text-xs font-normal text-muted-foreground">
                          {reg.templateDocCode} {reg.templateVersion}
                        </span>
                      </td>

                      {/* Date & Time */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs font-bold block">{reg.date}</span>
                        <span className="text-xs text-muted-foreground">
                          {reg.startTime} - {reg.endTime}
                        </span>
                      </td>

                      {/* Mode */}
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 bg-accent rounded-md text-xs font-medium">
                          {reg.modeOfTraining}
                        </span>
                      </td>

                      {/* Trainer */}
                      <td className="py-3.5 px-4 font-medium">
                        {reg.trainerName}
                        {reg.trainerSignatureData && (
                          <span className="text-[10px] text-emerald-600 block font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Signed
                          </span>
                        )}
                      </td>

                      {/* Attendees Signatures */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold">
                            {signedCount} / {totalAttendees}
                          </span>
                          <div className="w-20 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-primary h-full rounded-full transition-all"
                              style={{
                                width: totalAttendees ? `${(signedCount / totalAttendees) * 100}%` : '0%'
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={cn(
                            'px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider',
                            isCompleted
                              ? 'bg-emerald-100 text-emerald-800'
                              : reg.workflowStatus === 'in_progress'
                              ? 'bg-blue-100 text-blue-800'
                              : reg.workflowStatus === 'awaiting_trainer'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {reg.workflowStatus.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* View button */}
                          <Link
                            to={`/training-registers/${reg.id}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg hover:bg-accent text-foreground transition-colors text-xs font-semibold shadow-2xs"
                            title="View / Sign Register"
                          >
                            <Eye className="w-3.5 h-3.5 text-primary" />
                            <span>View</span>
                          </Link>

                          {/* Download PDF button */}
                          <button
                            type="button"
                            disabled={downloadingId === reg.id}
                            onClick={() => handleDownload(reg)}
                            className={cn(
                              'p-1.5 rounded-lg transition-colors border',
                              isCompleted
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                            )}
                            title={isCompleted ? 'Download Verified Register PDF' : 'Download Draft PDF'}
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {/* Delete button */}
                          {(isAdmin || isHR || isQM || hasPermission('manage_training_registers') || (currentUser && reg.createdBy === currentUser.uid)) && (
                            <button
                              type="button"
                              onClick={() => setRegisterToDelete(reg)}
                              className="p-1.5 border rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete Register"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {registerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-card p-6 rounded-2xl shadow-xl border max-w-sm w-full space-y-4">
            <h3 className="text-base font-bold text-foreground">Confirm Deletion</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong className="text-foreground font-semibold">"{registerToDelete.trainingTitle || 'Untitled Register'}"</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setRegisterToDelete(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleDelete(registerToDelete)}
                className="px-4 py-2 text-sm bg-destructive text-destructive-foreground font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
