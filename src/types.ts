export interface Question {
  id: string;
  type: 'mcq' | 'true_false' | 'short_answer' | 'descriptive' | 'rating' | 'multi_select' | 'file_upload';
  text: string;
  options?: string[];
  correctAnswer?: string | string[];
  marks: number;
  section?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface Template {
  id: string;
  name: string;
  description: string;
  departmentId: string;
  skillCategory: string;
  difficulty: 'easy' | 'medium' | 'hard';
  duration: number; // in minutes
  passMark: number;
  totalMarks: number;
  instructions: string;
  questions: Question[];
  status: 'draft' | 'active' | 'inactive';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'super_admin' | 'hr_admin' | 'reviewer' | 'employee' | 'quality_management';

export type Permission = 
  | 'view_dashboard'
  | 'manage_templates'
  | 'manage_assignments'
  | 'evaluate_submissions'
  | 'manage_users'
  | 'manage_departments'
  | 'view_reports'
  | 'view_audit_logs'
  | 'manage_branding'
  | 'view_my_assessments'
  | 'manage_training_registers';

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  role?: UserRole; // Keeping for backward compatibility during migration
  departmentId?: string;
  designation?: string;
  status: 'active' | 'inactive';
  password?: string;
  employeeId?: string;
  mobile?: string;
  reportingManager?: string;
}

export interface Assignment {
  id: string;
  templateId: string;
  type: 'individual' | 'department';
  targetIds: string[]; // employee uids or department ids
  reviewerId: string;
  assignedBy: string;
  startDate: string;
  dueDate: string;
  attemptLimit: number;
  duration: number;
  instructions: string;
  allowRetest: boolean;
  randomizeQuestions: boolean;
  autoSubmitOnTimeout: boolean;
  linkExpiryDate: string;
  notificationEnabled: boolean;
  selectedQuestionIds?: string[];
  status: 'active' | 'expired';
  createdAt: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  templateId?: string;
  employeeId: string;
  answers: Record<string, any>;
  status: 'in_progress' | 'submitted' | 'under_review' | 'completed';
  submittedAt: string;
  durationTaken: number; // in seconds
  tabSwitchCount?: number;
  currentQuestionIndex?: number;
  timeLeft?: number;
  lastUpdatedAt?: string;
}

export interface Evaluation {
  id: string;
  submissionId: string;
  reviewerId: string;
  questionScores: Record<string, number>;
  questionComments: Record<string, string>;
  overallComments: string;
  strengths: string;
  improvements: string;
  finalScore: number;
  result: 'pass' | 'fail';
  retestRequired: boolean;
  reviewedAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userEmail?: string;
  action: string;
  module: string;
  timestamp: string;
  details: any;
}

export interface Department {
  id: string;
  name: string;
  description: string;
}

export interface TrainingAttendee {
  id: string;
  slNo: number;
  employeeId?: string;
  traineeName: string;
  email?: string;
  designation?: string;
  department?: string;
  signatureData?: string;
  signedDate?: string; // DD-MMM-YYYY
  signedAt?: string;
  status: 'pending' | 'signed' | 'waiting';
}

export interface TrainingRegister {
  id: string;
  trainingTitle: string;
  date: string; // DD-MMM-YYYY
  modeOfTraining: string; // 'Classroom Training' | 'On the Job Training' | 'Online Training' | custom
  startTime: string;
  endTime: string;
  trainerName: string;
  trainerId?: string;
  trainerEmail?: string;
  trainerSignatureData?: string;
  trainerSignedDate?: string; // DD-MMM-YYYY
  trainerSignedAt?: string;
  assessmentConducted: 'Yes' | 'No';
  assessmentComment?: string;
  attendees: TrainingAttendee[];
  workflowStatus: 'draft' | 'in_progress' | 'awaiting_trainer' | 'completed';
  currentSignerIndex: number;
  templateDocCode: string;
  templateVersion: string;
  templateEffectiveDate: string;
  confidentialText: string;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  updatedAt: string;
}

export interface TrainingRegisterTemplateConfig {
  id: string;
  documentCode: string;
  version: string;
  effectiveDate: string;
  confidentialText: string;
  availableModes: string[];
  qualityTeamEmails: string[];
  itTeamEmails: string[];
  updatedAt?: string;
  updatedBy?: string;
}

