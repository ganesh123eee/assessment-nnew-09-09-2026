import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Save, 
  Send, 
  Download, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  UserCheck, 
  PenTool, 
  Calendar,
  Sparkles,
  Mail,
  FileText,
  Search,
  ChevronDown,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { firestoreService } from '../services/firestoreService';
import { 
  TrainingRegister, 
  TrainingAttendee, 
  TrainingRegisterTemplateConfig, 
  User as UserType,
  Template
} from '../types';
import { formatDate, cn } from '../lib/utils';
import { trainingRegisterService, DEFAULT_TEMPLATE_CONFIG } from '../services/trainingRegisterService';
import { SignaturePadModal } from '../components/SignaturePadModal';

export default function TrainingRegisterDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user: currentUser, branding, isAdmin, isHR, isQM, hasPermission } = useAuth();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [users, setUsers] = useState<UserType[]>([]);
  const [templateConfig, setTemplateConfig] = useState<TrainingRegisterTemplateConfig>(DEFAULT_TEMPLATE_CONFIG);
  const [isCustomTrainer, setIsCustomTrainer] = useState(false);
  const [autoPrompted, setAutoPrompted] = useState(false);

  // Template dropdown and search state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);

  // Role restriction for download
  const canDownloadRegister = Boolean(
    isAdmin ||
    isHR ||
    isQM ||
    currentUser?.roles?.some((r) => ['super_admin', 'hr_admin', 'quality_management'].includes(r as any)) ||
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'hr_admin' ||
    currentUser?.role === 'quality_management'
  );

  // Role restriction for delete - strictly restricted to Admin and Quality Team members
  const canDeleteRegister = Boolean(
    isAdmin ||
    isHR ||
    isQM ||
    currentUser?.roles?.some((r) => ['super_admin', 'hr_admin', 'quality_management'].includes(r as any)) ||
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'hr_admin' ||
    currentUser?.role === 'quality_management'
  );

  // Realtime subscription to templates so future created templates appear automatically
  useEffect(() => {
    const unsub = firestoreService.subscribeToCollection<Template>(
      'templates',
      [],
      (data) => {
        setTemplates(data || []);
      }
    );
    return () => {
      unsub();
    };
  }, []);

  // Signature modal state
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [activeSignerTarget, setActiveSignerTarget] = useState<{
    type: 'trainer' | 'trainee';
    attendeeIndex?: number;
    signerName: string;
    roleDescription: string;
  } | null>(null);

  // Main Form state
  const [formData, setFormData] = useState<TrainingRegister>({
    id: '',
    trainingTitle: '',
    date: formatDate(new Date()), // strict DD-MMM-YYYY
    modeOfTraining: 'Classroom Training',
    startTime: '04:30 PM',
    endTime: '05:00 PM',
    trainerName: currentUser?.displayName || '',
    trainerId: currentUser?.uid || '',
    trainerEmail: currentUser?.email || '',
    trainerSignatureData: '',
    trainerSignedDate: '',
    assessmentConducted: 'Yes',
    assessmentComment: '',
    attendees: [],
    workflowStatus: 'draft',
    currentSignerIndex: 0,
    templateDocCode: DEFAULT_TEMPLATE_CONFIG.documentCode,
    templateVersion: DEFAULT_TEMPLATE_CONFIG.version,
    templateEffectiveDate: DEFAULT_TEMPLATE_CONFIG.effectiveDate,
    confidentialText: DEFAULT_TEMPLATE_CONFIG.confidentialText,
    createdAt: new Date().toISOString(),
    createdBy: currentUser?.uid || '',
    createdByName: currentUser?.displayName || '',
    updatedAt: new Date().toISOString()
  });

  // Custom mode state
  const [showCustomModeInput, setShowCustomModeInput] = useState(false);
  const [customModeValue, setCustomModeValue] = useState('');

  // Initial load
  useEffect(() => {
    const init = async () => {
      try {
        const [loadedConfig, allUsers] = await Promise.all([
          trainingRegisterService.getTemplateConfig(),
          firestoreService.getCollection<UserType>('users')
        ]);
        setTemplateConfig(loadedConfig);
        setUsers(allUsers.filter((u) => u.status === 'active'));

        if (!isNew && id) {
          const doc = await firestoreService.getDocument<TrainingRegister>('training_registers', id);
          if (doc) {
            setFormData({
              ...doc,
              id: doc.id || id
            });
            if (doc.trainerName && !allUsers.some((u) => u.uid === doc.trainerId)) {
              setIsCustomTrainer(true);
            }
          } else {
            toast.error('Training Register not found');
            navigate('/training-registers');
          }
        } else {
          // Initialize 10 rows initially as requested!
          const initialAttendees: TrainingAttendee[] = Array.from({ length: 10 }, (_, index) => ({
            id: `row-${Date.now()}-${index + 1}`,
            slNo: index + 1,
            traineeName: '',
            email: '',
            status: 'waiting'
          }));

          setFormData((prev) => ({
            ...prev,
            date: formatDate(new Date()),
            templateDocCode: loadedConfig.documentCode,
            templateVersion: loadedConfig.version,
            templateEffectiveDate: loadedConfig.effectiveDate,
            confidentialText: loadedConfig.confidentialText,
            modeOfTraining: loadedConfig.availableModes[0] || 'Classroom Training',
            attendees: initialAttendees
          }));
        }
      } catch (err) {
        console.error('Failed to initialize training register:', err);
        toast.error('Failed to load training register');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [id, isNew, navigate]);

  // Add attendee row (no limit, one by one)
  const handleAddRow = () => {
    const nextSlNo = formData.attendees.length + 1;
    const newAttendee: TrainingAttendee = {
      id: `row-${Date.now()}-${nextSlNo}`,
      slNo: nextSlNo,
      traineeName: '',
      email: '',
      status: formData.workflowStatus === 'in_progress' ? 'waiting' : 'waiting'
    };
    setFormData((prev) => ({
      ...prev,
      attendees: [...prev.attendees, newAttendee]
    }));
  };

  // Remove attendee row
  const handleRemoveRow = (index: number) => {
    if (formData.workflowStatus !== 'draft') {
      toast.error('Cannot remove attendees once signing workflow has begun');
      return;
    }
    const updated = formData.attendees.filter((_, i) => i !== index);
    // Recalculate slNo
    const renumbered = updated.map((a, i) => ({ ...a, slNo: i + 1 }));
    setFormData((prev) => ({ ...prev, attendees: renumbered }));
  };

  // Trainee field change (supports selecting from registered user dropdown or custom input)
  const handleTraineeSelect = (index: number, selectedUserId: string) => {
    const selectedUser = users.find((u) => u.uid === selectedUserId);
    const updated = [...formData.attendees];
    if (selectedUser) {
      updated[index] = {
        ...updated[index],
        employeeId: selectedUser.employeeId || selectedUser.uid,
        traineeName: selectedUser.displayName,
        email: selectedUser.email,
        designation: selectedUser.designation,
        department: selectedUser.departmentId
      };
    } else {
      updated[index] = {
        ...updated[index],
        employeeId: undefined,
        traineeName: '',
        email: ''
      };
    }
    setFormData((prev) => ({ ...prev, attendees: updated }));
  };

  const handleTraineeCustomChange = (index: number, field: 'traineeName' | 'email' | 'employeeId', value: string) => {
    const updated = [...formData.attendees];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setFormData((prev) => ({ ...prev, attendees: updated }));
  };

  // Helper to accurately resolve Employee ID for display and verification
  const getAttendeeEmployeeId = (attendee: TrainingAttendee) => {
    if (attendee.employeeId && !attendee.employeeId.includes('@') && attendee.employeeId.length < 25) {
      return attendee.employeeId;
    }
    const matchedUser = users.find(
      (u) =>
        u.uid === attendee.employeeId ||
        (attendee.email && u.email?.toLowerCase().trim() === attendee.email.toLowerCase().trim()) ||
        (attendee.traineeName && u.displayName?.toLowerCase().trim() === attendee.traineeName.toLowerCase().trim()) ||
        u.employeeId === attendee.employeeId
    );
    return matchedUser?.employeeId || attendee.employeeId || '—';
  };

  // Trainer dropdown change (select from registered users or custom)
  const handleTrainerSelect = (val: string) => {
    if (val === '__custom__') {
      setIsCustomTrainer(true);
      return;
    }
    setIsCustomTrainer(false);
    const selected = users.find((u) => u.uid === val);
    if (selected) {
      setFormData((prev) => ({
        ...prev,
        trainerId: selected.uid,
        trainerName: selected.displayName,
        trainerEmail: selected.email
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        trainerId: '',
        trainerName: '',
        trainerEmail: ''
      }));
    }
  };

  // Save register (Draft or In-Progress update)
  const handleSave = async (shouldLaunchWorkflow: boolean = false) => {
    if (!formData.trainingTitle.trim()) {
      toast.error('Training Title is required');
      return;
    }
    if (!formData.trainerName.trim()) {
      toast.error('Trainer Name is required');
      return;
    }

    // Auto-link trainer email and ID from registered users if available
    let trainerIdToSave = formData.trainerId;
    let trainerEmailToSave = formData.trainerEmail;
    if (!trainerEmailToSave && formData.trainerName) {
      const match = users.find(
        (u) => u.displayName.toLowerCase().trim() === formData.trainerName.toLowerCase().trim()
      );
      if (match) {
        trainerIdToSave = match.uid;
        trainerEmailToSave = match.email;
      }
    }

    // Filter out completely blank trailing rows if user left them empty
    const validAttendees = formData.attendees.filter((a) => a.traineeName.trim() !== '');
    if (validAttendees.length === 0) {
      toast.error('Please enter at least one trainee in the Attendees List');
      return;
    }

    setSaving(true);
    try {
      let nextStatus = formData.workflowStatus;
      let nextCurrentSignerIndex = formData.currentSignerIndex;
      let preparedAttendees = [...validAttendees];

      // Re-number rows
      preparedAttendees = preparedAttendees.map((a, i) => ({
        ...a,
        slNo: i + 1
      }));

      if (shouldLaunchWorkflow && formData.workflowStatus === 'draft') {
        nextStatus = 'in_progress';
        nextCurrentSignerIndex = 0;
        // First attendee becomes pending; rest waiting
        preparedAttendees = preparedAttendees.map((a, i) => ({
          ...a,
          status: i === 0 ? 'pending' : 'waiting'
        }));
      }

      const payload: Partial<TrainingRegister> = {
        ...formData,
        trainerId: trainerIdToSave,
        trainerEmail: trainerEmailToSave,
        attendees: preparedAttendees,
        workflowStatus: nextStatus,
        currentSignerIndex: nextCurrentSignerIndex,
        updatedAt: new Date().toISOString()
      };

      let docId = formData.id;
      if (isNew || !docId) {
        // Exclude empty id from initial create payload
        const { id: _unused, ...dataToCreate } = payload;
        docId = await firestoreService.createDocument('training_registers', dataToCreate);
        payload.id = docId;
        // Ensure id is stored in document
        await firestoreService.updateDocument('training_registers', docId, { id: docId });
      } else {
        await firestoreService.updateDocument('training_registers', docId, { ...payload, id: docId });
      }

      const updatedRegister = { ...formData, ...payload, id: docId } as TrainingRegister;
      setFormData(updatedRegister);

      // If workflow was initiated, send email to Attendee 0
      if (shouldLaunchWorkflow && preparedAttendees[0]?.email) {
        await trainingRegisterService.notifyAttendeeToSign(updatedRegister, preparedAttendees[0]);
        toast.success(`Workflow started! Email invitation dispatched to ${preparedAttendees[0].traineeName}.`);
      } else {
        toast.success('Training Register saved successfully');
      }

      if (isNew) {
        navigate(`/training-registers/${docId}`, { replace: true });
      }
    } catch (err) {
      console.error('Error saving training register:', err);
      toast.error('Failed to save training register');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRegister = async () => {
    if (!formData.id) return;
    if (!canDeleteRegister) {
      toast.error('Access Denied: Deleting training registers is restricted to Admin and Quality Team members.');
      return;
    }
    setIsDeleting(true);
    const toastId = toast.loading(`Deleting register "${formData.trainingTitle || 'Training Register'}"...`);
    try {
      await firestoreService.deleteDocument('training_registers', formData.id);
      await firestoreService.logActivity(
        'Delete Training Register',
        'Training Registers',
        { id: formData.id, title: formData.trainingTitle },
        currentUser?.uid,
        currentUser?.email
      );
      toast.success('Training Register deleted successfully', { id: toastId });
      setShowDeleteModal(false);
      navigate('/training-registers');
    } catch (err) {
      console.error('Failed to delete training register:', err);
      toast.error('Failed to delete training register', { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  // Open Signature Modal with strict authorization check
  const openSignatureModal = (
    type: 'trainer' | 'trainee',
    attendeeIndex?: number,
    signerName: string = ''
  ) => {
    if (type === 'trainee') {
      const idx = attendeeIndex ?? formData.currentSignerIndex;
      const attendee = formData.attendees[idx];
      if (!attendee) {
        toast.error('Attendee record not found');
        return;
      }

      // STRICT USER INTENT: "attendiees only allow own signature only dont allow to others signature"
      const isOwn = Boolean(
        currentUser && (
          (attendee.employeeId && currentUser.uid === attendee.employeeId) ||
          (attendee.email && currentUser.email?.toLowerCase().trim() === attendee.email.toLowerCase().trim())
        )
      );

      if (!isOwn) {
        toast.error(`Permission Denied: Only ${attendee.traineeName || 'the assigned attendee'} can provide their own signature.`);
        return;
      }
    }

    if (type === 'trainer') {
      const isTrainer = Boolean(
        currentUser && (
          (formData.trainerId && currentUser.uid === formData.trainerId) ||
          (formData.trainerEmail && currentUser.email?.toLowerCase().trim() === formData.trainerEmail.toLowerCase().trim()) ||
          (currentUser.displayName && formData.trainerName && currentUser.displayName.toLowerCase().trim() === formData.trainerName.toLowerCase().trim()) ||
          isAdmin
        )
      );

      if (!isTrainer) {
        toast.error(`Permission Denied: Only the designated trainer (${formData.trainerName}) can sign as Trainer.`);
        return;
      }
    }

    setActiveSignerTarget({
      type,
      attendeeIndex,
      signerName,
      roleDescription:
        type === 'trainer'
          ? 'Trainer Official Verification & Course Completion Sign-off'
          : `Trainee Attendance Sign-off for Attendee #${(attendeeIndex ?? 0) + 1}`
    });
    setSignatureModalOpen(true);
  };

  // Handle Signature Save (Sequential logic with strict authorization)
  const handleSignatureCaptured = async (signatureDataUrl: string, formattedDate: string) => {
    if (!activeSignerTarget) return;

    if (activeSignerTarget.type === 'trainer') {
      const isTrainer = Boolean(
        currentUser && (
          (formData.trainerId && currentUser.uid === formData.trainerId) ||
          (formData.trainerEmail && currentUser.email?.toLowerCase().trim() === formData.trainerEmail.toLowerCase().trim()) ||
          (currentUser.displayName && formData.trainerName && currentUser.displayName.toLowerCase().trim() === formData.trainerName.toLowerCase().trim()) ||
          isAdmin
        )
      );

      if (!isTrainer) {
        toast.error('Unauthorized: Only the designated trainer can sign this sign-off.');
        return;
      }

      // Trainer signs!
      const updatedRegister: TrainingRegister = {
        ...formData,
        trainerSignatureData: signatureDataUrl,
        trainerSignedDate: formattedDate,
        trainerSignedAt: new Date().toISOString(),
        workflowStatus: 'completed',
        updatedAt: new Date().toISOString()
      };

      setFormData(updatedRegister);
      await firestoreService.updateDocument('training_registers', updatedRegister.id, updatedRegister);

      toast.success('Trainer signature recorded! Training Register is now COMPLETED.');

      // Notify Quality & IT teams!
      try {
        await trainingRegisterService.notifyQualityAndIT(updatedRegister, templateConfig);
        toast.success('Automated notifications dispatched to Quality and IT teams.');
      } catch (err) {
        console.error('Error sending QA/IT notifications:', err);
      }
      return;
    }

    // Trainee signs
    const idx = activeSignerTarget.attendeeIndex;
    if (idx === undefined || idx === null) return;

    const attendee = formData.attendees[idx];
    const isOwn = Boolean(
      currentUser && (
        (attendee.employeeId && currentUser.uid === attendee.employeeId) ||
        (attendee.email && currentUser.email?.toLowerCase().trim() === attendee.email.toLowerCase().trim())
      )
    );

    if (!isOwn) {
      toast.error('Unauthorized: Attendees are only allowed to provide their own signature.');
      return;
    }

    const updatedAttendees = [...formData.attendees];
    updatedAttendees[idx] = {
      ...updatedAttendees[idx],
      signatureData: signatureDataUrl,
      signedDate: formattedDate,
      signedAt: new Date().toISOString(),
      status: 'signed'
    };

    // Sequential check: Find next attendee who needs to sign
    const nextIndex = idx + 1;
    let nextStatus = formData.workflowStatus;
    let nextSignerIdx = nextIndex;

    if (nextIndex < updatedAttendees.length) {
      // Update next attendee to 'pending'
      updatedAttendees[nextIndex] = {
        ...updatedAttendees[nextIndex],
        status: 'pending'
      };
      nextStatus = 'in_progress';
      toast.success(`Signature verified for ${updatedAttendees[idx].traineeName}!`);
    } else {
      // All attendees have signed! Transition to 'awaiting_trainer'
      nextStatus = 'awaiting_trainer';
      toast.success('All attendee signatures captured! Awaiting Trainer signature.');
    }

    const updatedRegister: TrainingRegister = {
      ...formData,
      attendees: updatedAttendees,
      workflowStatus: nextStatus,
      currentSignerIndex: nextSignerIdx,
      updatedAt: new Date().toISOString()
    };

    setFormData(updatedRegister);
    await firestoreService.updateDocument('training_registers', updatedRegister.id, updatedRegister);

    // Send email to next attendee or to trainer
    if (nextIndex < updatedAttendees.length) {
      const nextAttendee = updatedAttendees[nextIndex];
      if (nextAttendee.email) {
        await trainingRegisterService.notifyAttendeeToSign(updatedRegister, nextAttendee);
        toast.info(`Email invitation dispatched to next attendee: ${nextAttendee.traineeName}`);
      }
    } else {
      // All attendees finished -> trigger email to Trainer!
      if (updatedRegister.trainerEmail) {
        await trainingRegisterService.notifyTrainerToSign(updatedRegister);
        toast.info(`Email invitation sent to Trainer: ${updatedRegister.trainerName}`);
      }
    }
  };

  // Download PDF - restricted to Admin and Quality Team
  const handleDownloadPDF = async () => {
    if (!canDownloadRegister) {
      toast.error('Access Denied: Training register download is restricted to Admin and Quality Team members.');
      return;
    }
    setDownloading(true);
    try {
      await trainingRegisterService.generateTrainingRegisterPDF(formData, branding);
      toast.success('Training Register PDF downloaded');
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  // Check if current user is the current eligible signer
  const currentAttendee = formData.attendees[formData.currentSignerIndex];
  const isAttendeeSelf = Boolean(
    currentUser && currentAttendee && (
      (currentAttendee.employeeId && currentUser.uid === currentAttendee.employeeId) ||
      (currentAttendee.email && currentUser.email?.toLowerCase().trim() === currentAttendee.email.toLowerCase().trim())
    )
  );

  // STRICT: Only attendee's OWN account can sign attendee row! Admin/HR cannot sign for attendees.
  const isCurrentSigner =
    formData.workflowStatus === 'in_progress' &&
    currentAttendee?.status === 'pending' &&
    isAttendeeSelf;

  const isTrainerSelf = Boolean(
    currentUser && (
      (formData.trainerId && currentUser.uid === formData.trainerId) ||
      (formData.trainerEmail && currentUser.email?.toLowerCase().trim() === formData.trainerEmail.toLowerCase().trim()) ||
      (currentUser.displayName && formData.trainerName && currentUser.displayName.toLowerCase().trim() === formData.trainerName.toLowerCase().trim()) ||
      isAdmin
    )
  );

  const isTrainerSigner =
    formData.workflowStatus === 'awaiting_trainer' &&
    isTrainerSelf;

  // Auto-open signature modal if landing via notification or email link (?sign=...)
  useEffect(() => {
    if (loading || !formData.id || autoPrompted || signatureModalOpen) return;

    const signParam = searchParams.get('sign');
    if (!signParam) return;

    if (signParam === 'trainee' || signParam === '1' || signParam === 'true') {
      if (isCurrentSigner && currentAttendee) {
        setAutoPrompted(true);
        openSignatureModal('trainee', formData.currentSignerIndex, currentAttendee.traineeName);
      } else if (formData.workflowStatus === 'in_progress' && !isCurrentSigner) {
        toast.info(
          `Currently awaiting Attendee #${formData.currentSignerIndex + 1}: ${
            currentAttendee?.traineeName || 'Pending'
          }. You will be invited when it is your turn.`
        );
      }
    } else if (signParam === 'trainer') {
      if (isTrainerSigner) {
        setAutoPrompted(true);
        openSignatureModal('trainer', undefined, formData.trainerName);
      } else if (formData.workflowStatus !== 'awaiting_trainer') {
        toast.info('Training register is not yet ready for trainer sign-off (attendees are still signing).');
      }
    }
  }, [loading, formData.id, formData.workflowStatus, formData.currentSignerIndex, isCurrentSigner, isTrainerSigner, searchParams, autoPrompted, signatureModalOpen, currentAttendee]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading Training Register...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Top action navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/training-registers"
            className="p-2 border rounded-xl hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title="Back to Registers List"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {isNew ? 'New Training Register' : formData.trainingTitle || 'Training Register'}
              </h1>
              <span
                className={cn(
                  'px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider',
                  formData.workflowStatus === 'completed'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : formData.workflowStatus === 'in_progress'
                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                    : formData.workflowStatus === 'awaiting_trainer'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-muted text-muted-foreground border'
                )}
              >
                {formData.workflowStatus.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ref: {formData.templateDocCode} {formData.templateVersion} | Effective: {formData.templateEffectiveDate}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {formData.workflowStatus === 'draft' && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave(false)}
                className="flex items-center gap-2 px-4 py-2 border rounded-xl hover:bg-accent text-sm font-medium transition-colors"
              >
                <Save className="w-4 h-4" /> Save Draft
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90 text-sm font-semibold transition-opacity shadow-xs"
              >
                <Send className="w-4 h-4" /> Start Signing Workflow
              </button>
            </>
          )}

          {formData.workflowStatus !== 'draft' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(false)}
              className="flex items-center gap-2 px-3.5 py-2 border rounded-xl hover:bg-accent text-xs font-medium transition-colors"
            >
              <Save className="w-3.5 h-3.5" /> Save Changes
            </button>
          )}

          {/* Download PDF button - restricted to Admin and Quality team */}
          {canDownloadRegister && (
            <button
              type="button"
              disabled={downloading}
              onClick={handleDownloadPDF}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-xs',
                formData.workflowStatus === 'completed'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/30'
                  : 'border hover:bg-accent text-foreground'
              )}
              title={formData.workflowStatus === 'completed' ? 'Official Completed PDF Ready' : 'Download Current State'}
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Generating PDF...' : 'Download Register PDF'}
            </button>
          )}

          {/* Delete Register button - strictly restricted to Admin and Quality Team */}
          {!isNew && canDeleteRegister && (
            <button
              type="button"
              disabled={saving || downloading || isDeleting}
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-destructive/30 rounded-xl hover:bg-destructive/10 text-destructive text-sm font-semibold transition-colors"
              title="Delete Register"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Workflow Status Banner */}
      {formData.workflowStatus === 'in_progress' && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="text-xs">
              <p className="font-bold text-sm text-blue-950">
                Sequential Signing In Progress: Currently Awaiting Attendee #{formData.currentSignerIndex + 1}
              </p>
              <p className="text-blue-800">
                Only{' '}
                <strong>
                  {formData.attendees[formData.currentSignerIndex]?.traineeName || `Attendee #${formData.currentSignerIndex + 1}`}
                </strong>{' '}
                can sign right now. Once completed, the notification will automatically trigger for the next attendee.
              </p>
            </div>
          </div>
          {isCurrentSigner && (
            <button
              type="button"
              onClick={() =>
                openSignatureModal(
                  'trainee',
                  formData.currentSignerIndex,
                  formData.attendees[formData.currentSignerIndex]?.traineeName || currentUser?.displayName || ''
                )
              }
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl whitespace-nowrap shadow-xs transition-colors"
            >
              Sign Now (Your Turn)
            </button>
          )}
        </div>
      )}

      {formData.workflowStatus === 'awaiting_trainer' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <UserCheck className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-xs">
              <p className="font-bold text-sm text-amber-950">
                All Attendees Signed! Awaiting Trainer Signature.
              </p>
              <p className="text-amber-800">
                Trainer <strong>{formData.trainerName}</strong> must provide the final sign-off in the header table to verify and complete the register.
              </p>
            </div>
          </div>
          {(isTrainerSigner || isAdmin) && (
            <button
              type="button"
              onClick={() => openSignatureModal('trainer', undefined, formData.trainerName)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl whitespace-nowrap shadow-xs transition-colors"
            >
              Sign as Trainer
            </button>
          )}
        </div>
      )}

      {formData.workflowStatus === 'completed' && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-xs">
              <p className="font-bold text-sm text-emerald-950">
                Training Register Fully Completed &amp; Verified
              </p>
              <p className="text-emerald-800">
                All {formData.attendees.length} attendee signatures and the trainer signature have been verified.
                Notifications dispatched to Quality and IT departments.
              </p>
            </div>
          </div>
          {canDownloadRegister && (
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl whitespace-nowrap shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Download Verified PDF
            </button>
          )}
        </div>
      )}

      {/* THE PAPER SHEET CONTAINER (EXACT MATCH OF IMAGE REFERENCE) */}
      <div className="bg-card border-2 border-border/80 rounded-2xl shadow-xl p-8 sm:p-10 space-y-8 print:p-0 print:border-none">
        {/* DOCUMENT HEADER */}
        <div className="flex items-start justify-between border-b pb-4">
          {/* Company Logo and Company Name top left corner */}
          <div className="flex items-center gap-3.5">
            {branding.logoUrl && (
              <img
                src={branding.logoUrl}
                alt="Company Logo"
                className="h-12 w-auto max-w-[160px] object-contain"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="flex flex-col">
              <span className="font-bold text-lg text-foreground tracking-tight leading-tight">
                {branding.companyName || 'SyMetric Systems'}
              </span>
              {branding.appName && branding.appName !== branding.companyName && (
                <span className="text-xs text-muted-foreground font-medium">{branding.appName}</span>
              )}
            </div>
          </div>
        </div>

        {/* MAIN DOCUMENT TITLE (CENTERED, BOLD, UNDERLINED) */}
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground underline decoration-2 underline-offset-8">
            Training Register
          </h2>
        </div>

        {/* TOP METADATA TABLE (Bordered Box Grid matching paper document) */}
        <div className="border-2 border-foreground/80 rounded-lg overflow-hidden text-sm bg-background">
          {/* Row 1: Training Title with Template dropdown selector & search */}
          <div className="grid grid-cols-1 md:grid-cols-4 border-b-2 border-foreground/80">
            <div className="p-3 font-bold bg-muted/40 md:border-r-2 border-foreground/80 flex items-center justify-between">
              <span>Training Title</span>
            </div>
            <div className="p-2 md:col-span-3">
              {formData.workflowStatus === 'draft' ? (
                <div className="space-y-2 relative">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={formData.trainingTitle}
                      onChange={(e) => setFormData({ ...formData, trainingTitle: e.target.value })}
                      placeholder="Enter training title or select from available templates..."
                      className="flex-1 px-3 py-1.5 bg-background border rounded-md outline-none font-semibold text-foreground focus:ring-2 focus:ring-primary/30 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                      className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-md text-xs font-semibold whitespace-nowrap flex items-center justify-center gap-1.5 transition-colors"
                      title="Browse available assessment templates"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Select Template ({templates.length} available)</span>
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isTemplateDropdownOpen && "rotate-180")} />
                    </button>
                  </div>

                  {/* Template search dropdown */}
                  {isTemplateDropdownOpen && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 border rounded-xl p-3 bg-card shadow-xl space-y-2.5">
                      <div className="flex items-center justify-between gap-2 border-b pb-2">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <span>Templates Library</span>
                          <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[11px] font-semibold">
                            {templates.length} templates available
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsTemplateDropdownOpen(false)}
                          className="text-muted-foreground hover:text-foreground text-xs p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            type="text"
                            value={templateSearchTerm}
                            onChange={(e) => setTemplateSearchTerm(e.target.value)}
                            placeholder="Search template title, skill, or department..."
                            className="w-full pl-8 pr-3 py-1.5 bg-background border rounded-md text-xs outline-none focus:ring-2 focus:ring-primary/30"
                            autoFocus
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {}}
                          className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md flex items-center gap-1 shadow-2xs"
                        >
                          <Search className="w-3 h-3" />
                          Search
                        </button>
                      </div>

                      <div className="max-h-52 overflow-y-auto divide-y border rounded-md bg-background">
                        {templates
                          .filter((t) =>
                            !templateSearchTerm ||
                            t.name.toLowerCase().includes(templateSearchTerm.toLowerCase()) ||
                            t.description?.toLowerCase().includes(templateSearchTerm.toLowerCase()) ||
                            t.skillCategory?.toLowerCase().includes(templateSearchTerm.toLowerCase())
                          )
                          .map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, trainingTitle: t.name });
                                setIsTemplateDropdownOpen(false);
                                toast.success(`Template selected: "${t.name}"`);
                              }}
                              className="w-full text-left p-2.5 hover:bg-accent transition-colors flex items-center justify-between group"
                            >
                              <div className="space-y-0.5">
                                <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                                  {t.name}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {t.skillCategory || 'General'} • {t.questions?.length || 0} Questions • Pass {t.passingScore || 80}%
                                </p>
                              </div>
                              <span className="text-[11px] text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pl-2">
                                Apply &rarr;
                              </span>
                            </button>
                          ))}
                        {templates.filter((t) =>
                          !templateSearchTerm ||
                          t.name.toLowerCase().includes(templateSearchTerm.toLowerCase()) ||
                          t.description?.toLowerCase().includes(templateSearchTerm.toLowerCase()) ||
                          t.skillCategory?.toLowerCase().includes(templateSearchTerm.toLowerCase())
                        ).length === 0 && (
                          <div className="p-4 text-center text-xs text-muted-foreground italic">
                            No templates found matching "{templateSearchTerm}"
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="font-semibold text-foreground px-3 py-1.5 text-sm">{formData.trainingTitle}</p>
              )}
            </div>
          </div>

          {/* Row 2: Date & Mode of Training */}
          <div className="grid grid-cols-1 md:grid-cols-4 border-b-2 border-foreground/80">
            {/* Date */}
            <div className="p-3 font-bold bg-muted/40 md:border-r-2 border-foreground/80 flex items-center">
              Date (DD-MMM-YYYY)
            </div>
            <div className="p-2 md:border-r-2 border-foreground/80 flex items-center">
              <input
                type="text"
                disabled={formData.workflowStatus !== 'draft'}
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                placeholder="29-Jul-2026"
                className="w-full px-3 py-1.5 bg-transparent border-none outline-none font-mono font-medium text-foreground focus:bg-accent/40 rounded-md"
              />
            </div>

            {/* Mode of Training */}
            <div className="p-3 font-bold bg-muted/40 md:border-r-2 border-foreground/80 flex items-center">
              Mode of Training
            </div>
            <div className="p-2 flex items-center gap-2">
              {!showCustomModeInput ? (
                <div className="flex-1 flex items-center gap-2">
                  <select
                    disabled={formData.workflowStatus !== 'draft'}
                    value={formData.modeOfTraining}
                    onChange={(e) => {
                      if (e.target.value === '__add_custom__') {
                        setShowCustomModeInput(true);
                      } else {
                        setFormData({ ...formData, modeOfTraining: e.target.value });
                      }
                    }}
                    className="w-full px-3 py-1.5 bg-transparent border rounded-md outline-none text-xs font-medium cursor-pointer"
                  >
                    {templateConfig.availableModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                    <option value="__add_custom__">+ Add Custom Training Mode...</option>
                  </select>
                </div>
              ) : (
                <div className="flex-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    value={customModeValue}
                    onChange={(e) => setCustomModeValue(e.target.value)}
                    placeholder="Enter custom training mode..."
                    className="flex-1 px-2.5 py-1 text-xs border rounded-md outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customModeValue.trim()) {
                        setFormData({ ...formData, modeOfTraining: customModeValue.trim() });
                        setShowCustomModeInput(false);
                      }
                    }}
                    className="px-2.5 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-md"
                  >
                    Use
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCustomModeInput(false)}
                    className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Start Time & End Time */}
          <div className="grid grid-cols-1 md:grid-cols-4 border-b-2 border-foreground/80">
            <div className="p-3 font-bold bg-muted/40 md:border-r-2 border-foreground/80 flex items-center">
              Start Time
            </div>
            <div className="p-2 md:border-r-2 border-foreground/80 flex items-center">
              <input
                type="text"
                disabled={formData.workflowStatus !== 'draft'}
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                placeholder="04:30 PM"
                className="w-full px-3 py-1.5 bg-transparent border-none outline-none font-medium text-foreground focus:bg-accent/40 rounded-md"
              />
            </div>

            <div className="p-3 font-bold bg-muted/40 md:border-r-2 border-foreground/80 flex items-center">
              End Time
            </div>
            <div className="p-2 flex items-center">
              <input
                type="text"
                disabled={formData.workflowStatus !== 'draft'}
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                placeholder="05:00 PM"
                className="w-full px-3 py-1.5 bg-transparent border-none outline-none font-medium text-foreground focus:bg-accent/40 rounded-md"
              />
            </div>
          </div>

          {/* Row 4: Trainer Name & Signature and Date */}
          <div className="grid grid-cols-1 md:grid-cols-4 border-b-2 border-foreground/80">
            {/* Trainer Name */}
            <div className="p-3 font-bold bg-muted/40 md:border-r-2 border-foreground/80 flex items-center">
              Trainer Name
            </div>
            <div className="p-2 md:border-r-2 border-foreground/80 flex flex-col justify-center gap-1.5">
              {formData.workflowStatus === 'draft' ? (
                <div className="space-y-1.5 w-full">
                  <select
                    value={formData.trainerId || (isCustomTrainer ? '__custom__' : '')}
                    onChange={(e) => handleTrainerSelect(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-background border rounded-md text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select Trainer from registered users...</option>
                    {users.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.displayName} ({u.email}) {u.designation ? `— ${u.designation}` : ''}
                      </option>
                    ))}
                    <option value="__custom__">+ Enter Custom / External Trainer</option>
                  </select>

                  {(isCustomTrainer || (!formData.trainerId && formData.trainerName)) && (
                    <div className="flex flex-col gap-1 pt-1">
                      <input
                        type="text"
                        value={formData.trainerName}
                        onChange={(e) => setFormData({ ...formData, trainerName: e.target.value })}
                        placeholder="Trainer Full Name"
                        className="w-full px-2.5 py-1 bg-background border rounded-md text-xs outline-none focus:ring-1 focus:ring-primary"
                      />
                      <input
                        type="email"
                        value={formData.trainerEmail || ''}
                        onChange={(e) => setFormData({ ...formData, trainerEmail: e.target.value })}
                        placeholder="Trainer Email (for sign notification)"
                        className="w-full px-2.5 py-1 bg-background border rounded-md text-xs outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  )}

                  {formData.trainerEmail && !isCustomTrainer && (
                    <p className="text-[11px] text-muted-foreground px-1 truncate">
                      Email: <span className="font-mono text-foreground font-medium">{formData.trainerEmail}</span>
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="font-bold text-foreground text-sm">{formData.trainerName}</p>
                  {formData.trainerEmail && (
                    <p className="text-xs text-muted-foreground font-mono">{formData.trainerEmail}</p>
                  )}
                </div>
              )}
            </div>

            {/* Signature and Date */}
            <div className="p-3 font-bold bg-muted/40 md:border-r-2 border-foreground/80 flex items-center">
              Signature and Date
            </div>
            <div className="p-2 flex items-center justify-between min-h-[48px]">
              {formData.trainerSignatureData ? (
                <div className="flex items-center gap-3">
                  <img
                    src={formData.trainerSignatureData}
                    alt="Trainer Signature"
                    className="h-8 max-w-[120px] object-contain border-b border-foreground/40"
                  />
                  <span className="font-mono text-xs text-muted-foreground font-bold">
                    {formData.trainerSignedDate || formData.date}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs text-muted-foreground italic">
                    {formData.workflowStatus === 'awaiting_trainer'
                      ? 'Ready for Trainer Signature'
                      : 'Pending all attendee signatures'}
                  </span>
                  {formData.workflowStatus === 'awaiting_trainer' && isTrainerSigner && (
                    <button
                      type="button"
                      onClick={() => openSignatureModal('trainer', undefined, formData.trainerName)}
                      className="px-2.5 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-md flex items-center gap-1 hover:opacity-90"
                    >
                      <PenTool className="w-3 h-3" /> Sign
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Row 5: Assessment conducted (Yes / No + reason if No) */}
          <div className="grid grid-cols-1 md:grid-cols-4">
            <div className="p-3 font-bold bg-muted/40 md:border-r-2 border-foreground/80 flex items-center">
              Assessment conducted
            </div>
            <div className="p-2 md:col-span-3 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-xs">
                  <input
                    type="radio"
                    name="assessmentConducted"
                    value="Yes"
                    disabled={formData.workflowStatus !== 'draft'}
                    checked={formData.assessmentConducted === 'Yes'}
                    onChange={() => setFormData({ ...formData, assessmentConducted: 'Yes' })}
                    className="accent-primary"
                  />
                  <span>Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-xs">
                  <input
                    type="radio"
                    name="assessmentConducted"
                    value="No"
                    disabled={formData.workflowStatus !== 'draft'}
                    checked={formData.assessmentConducted === 'No'}
                    onChange={() => setFormData({ ...formData, assessmentConducted: 'No' })}
                    className="accent-primary"
                  />
                  <span>No (If no then comment)</span>
                </label>
              </div>

              {formData.assessmentConducted === 'No' && (
                <div className="flex-1 min-w-[240px]">
                  <input
                    type="text"
                    disabled={formData.workflowStatus !== 'draft'}
                    value={formData.assessmentComment || ''}
                    onChange={(e) => setFormData({ ...formData, assessmentComment: e.target.value })}
                    placeholder="Provide justification or reason why assessment was not conducted..."
                    className="w-full px-3 py-1 bg-background border rounded-md text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ATTENDEES LIST SECTION */}
        <div className="space-y-4">
          <div className="text-center pt-2">
            <h3 className="text-xl font-bold tracking-tight text-foreground underline decoration-2 underline-offset-6">
              Attendees List
            </h3>
          </div>

          {/* Attendees Table */}
          <div className="border-2 border-foreground/80 rounded-lg overflow-hidden bg-background">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-muted/60 border-b-2 border-foreground/80 text-foreground">
                  <th className="py-2.5 px-3 font-bold w-16 text-center border-r-2 border-foreground/80">S.No</th>
                  <th className="py-2.5 px-3 font-bold w-36 text-center border-r-2 border-foreground/80">Employee ID</th>
                  <th className="py-2.5 px-4 font-bold border-r-2 border-foreground/80">Trainee Name</th>
                  <th className="py-2.5 px-4 font-bold text-center w-72">Date and signature</th>
                  {formData.workflowStatus === 'draft' && (
                    <th className="py-2.5 px-3 w-12 text-center">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-foreground/80">
                {formData.attendees.map((attendee, index) => {
                  const isOwnSignature = Boolean(
                    currentUser && (
                      (attendee.employeeId && currentUser.uid === attendee.employeeId) ||
                      (attendee.email && currentUser.email?.toLowerCase().trim() === attendee.email.toLowerCase().trim())
                    )
                  );

                  // STRICT: Attendees only allow own signature only! No one else can sign on their behalf.
                  const isEligibleToSign =
                    formData.workflowStatus === 'in_progress' &&
                    attendee.status === 'pending' &&
                    isOwnSignature;

                  return (
                    <tr
                      key={attendee.id || index}
                      className={cn(
                        'transition-colors',
                        attendee.status === 'pending' && 'bg-blue-50/50',
                        attendee.status === 'signed' && 'bg-emerald-50/20'
                      )}
                    >
                      {/* S.No */}
                      <td className="py-2.5 px-3 text-center font-bold text-foreground font-mono border-r-2 border-foreground/80">
                        {String(attendee.slNo).padStart(2, '0')}
                      </td>

                      {/* Employee ID column */}
                      <td className="py-2 px-3 border-r-2 border-foreground/80 text-center">
                        {formData.workflowStatus === 'draft' ? (
                          <input
                            type="text"
                            value={attendee.employeeId || ''}
                            onChange={(e) => handleTraineeCustomChange(index, 'employeeId', e.target.value)}
                            placeholder="EMP ID..."
                            className="w-full px-2 py-1 bg-background border rounded-md text-xs font-mono font-bold text-primary outline-none focus:ring-1 focus:ring-primary text-center"
                          />
                        ) : (
                          <span className="font-mono text-xs font-bold px-2 py-1 bg-muted/80 text-primary rounded-md inline-block">
                            {getAttendeeEmployeeId(attendee)}
                          </span>
                        )}
                      </td>

                      {/* Trainee Name */}
                      <td className="py-2 px-4 border-r-2 border-foreground/80">
                        {formData.workflowStatus === 'draft' ? (
                          <div className="space-y-1.5">
                            <div className="flex flex-col sm:flex-row items-center gap-2">
                              {/* Option 1: Pick from registered users */}
                              <select
                                value={attendee.employeeId || ''}
                                onChange={(e) => handleTraineeSelect(index, e.target.value)}
                                className="w-full sm:w-1/2 px-2.5 py-1.5 bg-background border rounded-md text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                              >
                                <option value="">Select registered employee...</option>
                                {users.map((u) => (
                                  <option key={u.uid} value={u.uid}>
                                    {u.displayName} {u.employeeId ? `[ID: ${u.employeeId}]` : ''} ({u.email})
                                  </option>
                                ))}
                              </select>

                              {/* Option 2: Or type custom name */}
                              <input
                                type="text"
                                value={attendee.traineeName}
                                onChange={(e) => handleTraineeCustomChange(index, 'traineeName', e.target.value)}
                                placeholder="Or enter employee name..."
                                className="w-full sm:w-1/2 px-2.5 py-1.5 bg-background border rounded-md text-xs outline-none focus:ring-1 focus:ring-primary"
                              />
                            </div>
                            {attendee.email && (
                              <p className="text-[11px] text-muted-foreground px-0.5">
                                Notification Email: <span className="font-mono text-foreground font-medium">{attendee.email}</span>
                              </p>
                            )}
                          </div>
                        ) : (
                          <div>
                            <p className="font-semibold text-foreground text-sm">{attendee.traineeName}</p>
                            {attendee.email && (
                              <p className="text-xs text-muted-foreground font-mono">{attendee.email}</p>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Date and Signature */}
                      <td className="py-2 px-4 text-center">
                        {attendee.status === 'signed' || attendee.signatureData ? (
                          <div className="flex items-center justify-center gap-3">
                            <img
                              src={attendee.signatureData}
                              alt="Signature"
                              className="h-7 max-w-[110px] object-contain border-b border-foreground/30"
                            />
                            <span className="font-mono text-xs font-semibold text-muted-foreground">
                              {attendee.signedDate || formatDate(attendee.signedAt || formData.date)}
                            </span>
                          </div>
                        ) : attendee.status === 'pending' ? (
                          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                            {isEligibleToSign ? (
                              <button
                                type="button"
                                onClick={() => openSignatureModal('trainee', index, attendee.traineeName)}
                                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm animate-pulse"
                              >
                                <PenTool className="w-3.5 h-3.5" /> Sign (Your Turn)
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-amber-800 bg-amber-100/90 border border-amber-200 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-amber-700 shrink-0" />
                                Awaiting {attendee.traineeName || `Attendee #${attendee.slNo}`}'s Signature
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            {formData.workflowStatus === 'draft' ? 'Draft' : 'Waiting Turn'}
                          </span>
                        )}
                      </td>

                      {/* Remove row in draft mode */}
                      {formData.workflowStatus === 'draft' && (
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(index)}
                            className="p-1 text-muted-foreground hover:text-destructive rounded-md transition-colors"
                            title="Remove row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Plus button to add row (No limit) */}
          {formData.workflowStatus === 'draft' && (
            <div className="flex justify-start">
              <button
                type="button"
                onClick={handleAddRow}
                className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-primary/50 text-primary hover:bg-primary/5 rounded-xl text-xs font-bold transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Trainee (Row #{formData.attendees.length + 1})
              </button>
            </div>
          )}
        </div>

        {/* DOCUMENT FOOTER (MATCHING REFERENCE IMAGE: OPS-TRG-REG V1.1.3 | Date: 27-Jul-2026 | Confidential | Page 1 of 1) */}
        <div className="pt-6 border-t-2 border-foreground/80 flex items-center justify-between text-xs text-muted-foreground font-mono">
          <div>
            {formData.templateDocCode || 'OPS-TRG-REG'} {formData.templateVersion || 'V1.1.3'} | Date: {formData.templateEffectiveDate || '27-Jul-2026'}
          </div>
          <div className="font-bold text-foreground">
            {formData.confidentialText || 'Confidential'}
          </div>
          <div>Page 1 of 1</div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && canDeleteRegister && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-card p-6 rounded-2xl shadow-xl border max-w-sm w-full space-y-4">
            <h3 className="text-base font-bold text-foreground">Confirm Deletion</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong className="text-foreground font-semibold">"{formData.trainingTitle || 'this training register'}"</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteRegister}
                className="px-4 py-2 text-sm bg-destructive text-destructive-foreground font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Capture Modal */}
      {signatureModalOpen && activeSignerTarget && (
        <SignaturePadModal
          isOpen={signatureModalOpen}
          onClose={() => {
            setSignatureModalOpen(false);
            setActiveSignerTarget(null);
          }}
          onSave={handleSignatureCaptured}
          title={
            activeSignerTarget.type === 'trainer'
              ? 'Trainer Sign-off & Verification'
              : 'Digital Attendance Signature'
          }
          signerName={activeSignerTarget.signerName}
          roleDescription={activeSignerTarget.roleDescription}
          defaultDate={formData.date}
        />
      )}
    </div>
  );
}
