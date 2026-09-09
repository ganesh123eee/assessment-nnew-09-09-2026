import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TrainingRegister, TrainingRegisterTemplateConfig, TrainingAttendee, User as UserType } from '../types';
import { formatDate } from '../lib/utils';
import { firestoreService } from './firestoreService';
import { drawPdfBrandingHeader } from '../utils/pdfBranding';

export const DEFAULT_TEMPLATE_CONFIG: TrainingRegisterTemplateConfig = {
  id: 'default',
  documentCode: 'OPS-TRG-REG',
  version: 'V1.1.3',
  effectiveDate: '27-Jul-2026',
  confidentialText: 'Confidential',
  availableModes: ['Classroom Training', 'On the Job Training', 'Online Training'],
  qualityTeamEmails: ['qa@symetricsystems.com', 'ganesh@symetricsystems.com'],
  itTeamEmails: ['it@symetricsystems.com', 'ganesh123eee@gmail.com']
};

// Helper to measure signature image natural aspect ratio
async function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  if (!src) return { width: 300, height: 100 };
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      resolve({
        width: img.naturalWidth || 300,
        height: img.naturalHeight || 100
      });
    };
    img.onerror = () => {
      resolve({ width: 300, height: 100 });
    };
    img.src = src;
  });
}

export const trainingRegisterService = {
  async getTemplateConfig(): Promise<TrainingRegisterTemplateConfig> {
    try {
      const config = await firestoreService.getDocument<TrainingRegisterTemplateConfig>(
        'training_register_templates',
        'default'
      );
      if (config) {
        return {
          ...DEFAULT_TEMPLATE_CONFIG,
          ...config,
          availableModes: config.availableModes?.length ? config.availableModes : DEFAULT_TEMPLATE_CONFIG.availableModes,
          qualityTeamEmails: config.qualityTeamEmails?.length ? config.qualityTeamEmails : DEFAULT_TEMPLATE_CONFIG.qualityTeamEmails,
          itTeamEmails: config.itTeamEmails?.length ? config.itTeamEmails : DEFAULT_TEMPLATE_CONFIG.itTeamEmails
        };
      }
    } catch (e) {
      console.warn('Error fetching training register template config, using default:', e);
    }
    return DEFAULT_TEMPLATE_CONFIG;
  },

  async saveTemplateConfig(config: Partial<TrainingRegisterTemplateConfig>, userId?: string): Promise<void> {
    await firestoreService.createDocument(
      'training_register_templates',
      {
        ...DEFAULT_TEMPLATE_CONFIG,
        ...config,
        updatedAt: new Date().toISOString(),
        updatedBy: userId || 'system'
      },
      'default'
    );
  },

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, html })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        console.warn('Email API response error:', data);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to dispatch email:', err);
      return false;
    }
  },

  async notifyAttendeeToSign(
    register: TrainingRegister,
    attendee: TrainingAttendee,
    appUrl: string = window.location.origin
  ): Promise<void> {
    if (!attendee.email) return;

    const signUrl = `${appUrl}/training-registers/${register.id}?sign=trainee`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 20px;">Digital Training Register - Signature Required</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">Document Ref: ${register.templateDocCode} ${register.templateVersion}</p>
        </div>

        <p style="font-size: 15px; color: #1e293b;">Dear <strong>${attendee.traineeName}</strong>,</p>
        
        <p style="font-size: 14px; color: #334155; line-height: 1.6;">
          Your digital attendance signature is required for the following completed training session:
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 18px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">
            <tr>
              <td style="padding: 6px 0; font-weight: bold; width: 35%;">Training Title:</td>
              <td style="padding: 6px 0;">${register.trainingTitle}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">Date:</td>
              <td style="padding: 6px 0;">${register.date}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">Mode of Training:</td>
              <td style="padding: 6px 0;">${register.modeOfTraining}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">Trainer Name:</td>
              <td style="padding: 6px 0;">${register.trainerName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">Timing:</td>
              <td style="padding: 6px 0;">${register.startTime} - ${register.endTime}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">Signing Order:</td>
              <td style="padding: 6px 0; color: #2563eb; font-weight: bold;">Attendee #${attendee.slNo} (It is now your turn)</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${signUrl}" style="background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">
            Open Register & Provide Digital Signature
          </a>
        </div>

        <p style="font-size: 12px; color: #64748b; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 12px;">
          Note: This signature workflow is sequential. Once you sign, the next attendee will be automatically invited.
        </p>
      </div>
    `;

    await this.sendEmail(
      attendee.email,
      `Action Required: Digital Signature for Training - ${register.trainingTitle}`,
      html
    );

    // Create in-app notification if employee user ID is present
    if (attendee.employeeId) {
      await firestoreService.createDocument('notifications', {
        userId: attendee.employeeId,
        title: 'Training Register Signature Required',
        message: `Please sign the training register for: ${register.trainingTitle} (${register.date})`,
        type: 'warning',
        link: `/training-registers/${register.id}?sign=trainee`,
        read: false,
        createdAt: new Date().toISOString()
      });
    }
  },

  async notifyTrainerToSign(
    register: TrainingRegister,
    appUrl: string = window.location.origin
  ): Promise<void> {
    if (!register.trainerEmail) return;

    const signUrl = `${appUrl}/training-registers/${register.id}?sign=trainer`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 20px;">All Attendees Signed - Trainer Signature Required</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">Document Ref: ${register.templateDocCode} ${register.templateVersion}</p>
        </div>

        <p style="font-size: 15px; color: #1e293b;">Dear <strong>${register.trainerName}</strong>,</p>
        
        <p style="font-size: 14px; color: #334155; line-height: 1.6;">
          All <strong>${register.attendees.length}</strong> attendees have completed their digital signatures for your training session:
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 18px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">
            <tr>
              <td style="padding: 6px 0; font-weight: bold; width: 35%;">Training Title:</td>
              <td style="padding: 6px 0;">${register.trainingTitle}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">Date:</td>
              <td style="padding: 6px 0;">${register.date}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">Total Attendees:</td>
              <td style="padding: 6px 0; color: #16a34a; font-weight: bold;">${register.attendees.length} Signed</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 14px; color: #334155;">
          Please sign as the Trainer to officially complete the training register and release it to the Quality and IT teams.
        </p>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${signUrl}" style="background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">
            Sign as Trainer
          </a>
        </div>
      </div>
    `;

    await this.sendEmail(
      register.trainerEmail,
      `Action Required: Trainer Signature Needed - ${register.trainingTitle}`,
      html
    );

    if (register.trainerId) {
      await firestoreService.createDocument('notifications', {
        userId: register.trainerId,
        title: 'Trainer Signature Required',
        message: `All attendees have signed. Please provide your Trainer signature for: ${register.trainingTitle}`,
        type: 'info',
        link: `/training-registers/${register.id}?sign=trainer`,
        read: false,
        createdAt: new Date().toISOString()
      });
    }
  },

  async notifyQualityAndIT(
    register: TrainingRegister,
    config: TrainingRegisterTemplateConfig,
    appUrl: string = window.location.origin
  ): Promise<void> {
    const recipients = Array.from(
      new Set([...(config.qualityTeamEmails || []), ...(config.itTeamEmails || [])])
    ).filter(Boolean);

    if (recipients.length === 0) return;

    const viewUrl = `${appUrl}/training-registers/${register.id}`;
    const attendeeRows = register.attendees
      .map(
        (a) => `
        <tr>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center;">${String(a.slNo).padStart(2, '0')}</td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 500;">${a.traineeName}</td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center;">${a.signedDate || a.signedAt ? formatDate(a.signedDate || a.signedAt || '') : 'Signed'}</td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; color: #16a34a; font-weight: bold;">Verified</td>
        </tr>
      `
      )
      .join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px;">
          <span style="float: right; background: #dcfce7; color: #166534; font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 9999px;">
            COMPLETED &amp; VERIFIED
          </span>
          <h2 style="color: #0f172a; margin: 0; font-size: 20px;">Completed Training Register Notification</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">
            Document: ${register.templateDocCode} ${register.templateVersion} | Effective: ${register.templateEffectiveDate}
          </p>
        </div>

        <p style="font-size: 14px; color: #334155; line-height: 1.6;">
          This is an automated notification for the <strong>Quality Management</strong> and <strong>IT Administration</strong> teams.
          A new SOP Training Register has been fully completed with all digital signatures verified.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 18px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">
            <tr>
              <td style="padding: 5px 0; font-weight: bold; width: 35%;">Training Title:</td>
              <td style="padding: 5px 0;">${register.trainingTitle}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold;">Date &amp; Time:</td>
              <td style="padding: 5px 0;">${register.date} (${register.startTime} - ${register.endTime})</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold;">Mode of Training:</td>
              <td style="padding: 5px 0;">${register.modeOfTraining}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold;">Trainer Name:</td>
              <td style="padding: 5px 0;">${register.trainerName} (Signed on ${register.trainerSignedDate || register.date})</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold;">Assessment Conducted:</td>
              <td style="padding: 5px 0;">
                ${register.assessmentConducted} ${register.assessmentConducted === 'No' && register.assessmentComment ? `(Reason: ${register.assessmentComment})` : ''}
              </td>
            </tr>
          </table>
        </div>

        <h3 style="font-size: 14px; color: #0f172a; margin: 20px 0 10px;">Verified Attendees List (${register.attendees.length}):</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #475569;">
              <th style="padding: 6px 8px; border: 1px solid #e2e8f0; width: 10%;">S.No</th>
              <th style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: left;">Trainee Name</th>
              <th style="padding: 6px 8px; border: 1px solid #e2e8f0; width: 25%;">Signed Date</th>
              <th style="padding: 6px 8px; border: 1px solid #e2e8f0; width: 20%;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${attendeeRows}
          </tbody>
        </table>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${viewUrl}" style="background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">
            View / Download Complete Register
          </a>
        </div>

        <p style="font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 12px;">
          ${register.templateDocCode} ${register.templateVersion} | ${register.confidentialText || 'Confidential'} | AssessPro SOP Compliance
        </p>
      </div>
    `;

    for (const email of recipients) {
      await this.sendEmail(
        email,
        `Completed Training Register: ${register.trainingTitle} (${register.date})`,
        html
      );
    }
  },

  async generateTrainingRegisterPDF(
    register: TrainingRegister,
    branding?: { logoUrl?: string; companyName?: string; appName?: string }
  ): Promise<void> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;

    // Render consistent branding header preserving logo aspect ratio and typography
    const { nextY } = await drawPdfBrandingHeader(doc, branding, {
      margin,
      topY: 10,
      rightHeaderText: 'Training Register Template',
      showDivider: true
    });

    // Main Header Title: "Training Register" (centered, bold, underlined)
    const titleY = nextY + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text('Training Register', pageWidth / 2, titleY, { align: 'center' });
    
    // Underline for Training Register
    const titleWidth = doc.getTextWidth('Training Register');
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.6);
    doc.line((pageWidth - titleWidth) / 2, titleY + 1.5, (pageWidth + titleWidth) / 2, titleY + 1.5);

    // Build the Top Form Table as rendered in the document
    const formStartY = titleY + 6;

    // Assessment Conducted label string with comment
    let assessmentText = register.assessmentConducted || 'Yes';
    if (register.assessmentConducted === 'No') {
      assessmentText += register.assessmentComment ? ` (Reason: ${register.assessmentComment})` : ' (If no then comment)';
    }

    // Pre-filter valid attendees (only listed attendees)
    const validAttendees = (register.attendees || []).filter(
      (attendee) => (attendee.traineeName && attendee.traineeName.trim().length > 0) || (attendee.employeeId && attendee.employeeId.trim().length > 0)
    );

    // Pre-measure signature dimensions for trainer and attendees to render with accurate natural aspect ratios
    const trainerSigDims = register.trainerSignatureData
      ? await getImageDimensions(register.trainerSignatureData)
      : null;

    const attendeeSigDims = await Promise.all(
      validAttendees.map(async (a) => (a.signatureData ? await getImageDimensions(a.signatureData) : null))
    );

    // AutoTable for the Top Table matching the image:
    // Row 1: Training Title (label) | Value
    // Row 2: Date (DD-MMM-YYYY) | Mode of Training: [x] Classroom [ ] On the Job [ ] Online
    // Row 3: Start Time | End Time
    // Row 4: Trainer Name | Signature and Date (renders digital cursive signature + underline + date)
    // Row 5: Assessment conducted | Yes / No (If no then comment)
    
    const modeString = `Mode of Training: ${register.modeOfTraining}`;
    const trainerSigFallback = register.trainerSignedDate 
      ? `Signed: ${register.trainerSignedDate}` 
      : (register.trainerSignatureData ? `Signed: ${register.date}` : 'Pending');

    autoTable(doc, {
      startY: formStartY,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 3,
        lineColor: [40, 40, 40],
        lineWidth: 0.25,
        textColor: [20, 20, 20],
        font: 'helvetica'
      },
      head: [],
      body: [
        [
          { content: 'Training Title', styles: { fontStyle: 'bold', cellWidth: 38 } },
          { content: register.trainingTitle || 'N/A', colSpan: 3, styles: { fontStyle: 'bold' } }
        ],
        [
          { content: 'Date', styles: { fontStyle: 'bold', cellWidth: 38 } },
          { content: register.date || 'N/A', styles: { cellWidth: 52 } },
          { content: modeString, colSpan: 2, styles: { fontStyle: 'bold' } }
        ],
        [
          { content: 'Start Time', styles: { fontStyle: 'bold', cellWidth: 38 } },
          { content: register.startTime || 'N/A', styles: { cellWidth: 52 } },
          { content: 'End Time', styles: { fontStyle: 'bold', cellWidth: 32 } },
          { content: register.endTime || 'N/A' }
        ],
        [
          { content: 'Trainer Name', styles: { fontStyle: 'bold', cellWidth: 38 } },
          { content: register.trainerName || 'N/A', styles: { cellWidth: 52 } },
          { content: 'Signature and Date', styles: { fontStyle: 'bold', cellWidth: 32 } },
          { 
            content: register.trainerSignatureData ? '' : trainerSigFallback, 
            styles: { 
              minCellHeight: register.trainerSignatureData ? 12 : undefined,
              fontStyle: 'italic' 
            } 
          }
        ],
        [
          { content: 'Assessment conducted', styles: { fontStyle: 'bold', cellWidth: 38 } },
          { content: assessmentText, colSpan: 3 }
        ]
      ],
      margin: { left: margin, right: margin },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.row.index === 3 && data.column.index === 3) {
          if (register.trainerSignatureData) {
            try {
              const cell = data.cell;
              const aspect = (trainerSigDims?.width && trainerSigDims?.height)
                ? trainerSigDims.width / trainerSigDims.height
                : 2.5;

              let sigH = Math.min(7.5, cell.height - 3);
              let sigW = sigH * aspect;
              const maxW = Math.min(26, cell.width - 24);
              if (sigW > maxW) {
                sigW = maxW;
                sigH = maxW / aspect;
              }

              const sigX = cell.x + 3;
              const sigY = cell.y + (cell.height - sigH) / 2 - 0.5;

              doc.addImage(register.trainerSignatureData, 'PNG', sigX, sigY, sigW, sigH, undefined, 'FAST');

              // Underline below signature image (as shown in view mode)
              doc.setDrawColor(70, 70, 70);
              doc.setLineWidth(0.25);
              doc.line(sigX, cell.y + cell.height - 2, sigX + Math.max(sigW, 18), cell.y + cell.height - 2);

              // Date text on right side of cell
              const dateStr = register.trainerSignedDate || register.date || '';
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(8);
              doc.setTextColor(30, 41, 59);
              doc.text(dateStr, cell.x + cell.width - 3, cell.y + cell.height / 2 + 2.5, { align: 'right' });
            } catch (err) {
              console.error('Failed to draw trainer signature image in PDF:', err);
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(8);
              doc.setTextColor(30, 41, 59);
              doc.text(`Signed: ${register.trainerSignedDate || register.date}`, data.cell.x + 3, data.cell.y + data.cell.height / 2 + 2.5);
            }
          }
        }
      }
    });

    let currentY = (doc as any).lastAutoTable.finalY + 8;

    // Subheader: "Attendees List" (centered, bold, underlined)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('Attendees List', pageWidth / 2, currentY, { align: 'center' });

    const subWidth = doc.getTextWidth('Attendees List');
    doc.setLineWidth(0.5);
    doc.line((pageWidth - subWidth) / 2, currentY + 1.2, (pageWidth + subWidth) / 2, currentY + 1.2);

    currentY += 4;

    // Fetch users to accurately resolve Employee IDs if not set on attendee
    let allUsers: UserType[] = [];
    try {
      allUsers = await firestoreService.getCollection<UserType>('users');
    } catch (e) {
      console.warn('Could not fetch users for employee ID resolution in PDF:', e);
    }

    // Attendees Table - only show attendees that are actually listed, with dedicated Employee ID column
    const attendeesBody: any[][] = validAttendees.map((attendee, index) => {
      const sno = String(index + 1).padStart(2, '0');

      // Accurately resolve Employee ID
      const matchedUser = allUsers.find(
        (u) =>
          u.uid === attendee.employeeId ||
          (attendee.email && u.email?.toLowerCase().trim() === attendee.email.toLowerCase().trim()) ||
          (attendee.traineeName && u.displayName?.toLowerCase().trim() === attendee.traineeName.toLowerCase().trim()) ||
          u.employeeId === attendee.employeeId
      );

      const displayEmpId =
        attendee.employeeId && !attendee.employeeId.includes('@') && attendee.employeeId.length < 25
          ? attendee.employeeId
          : (matchedUser?.employeeId || attendee.employeeId || '—');

      const traineeName = attendee.traineeName || '—';

      if (attendee.signatureData) {
        return [
          { content: sno, styles: { halign: 'center', fontStyle: 'bold' } },
          { content: displayEmpId, styles: { halign: 'center', fontStyle: 'bold' } },
          { content: traineeName },
          { content: '', styles: { minCellHeight: 12 } }
        ];
      }

      let sigCell = 'Pending';
      if (attendee.status === 'signed' || attendee.signedDate) {
        sigCell = `Signed on ${attendee.signedDate || (attendee.signedAt ? formatDate(attendee.signedAt) : register.date)}`;
      } else if (attendee.status === 'pending') {
        sigCell = 'Awaiting Signature';
      } else {
        sigCell = 'Waiting Turn';
      }

      return [
        { content: sno, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: displayEmpId, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: traineeName },
        { content: sigCell, styles: { fontStyle: attendee.status === 'signed' ? 'italic' : 'normal' } }
      ];
    });

    if (attendeesBody.length === 0) {
      attendeesBody.push([
        { content: '01', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: '—', styles: { halign: 'center' } },
        { content: 'No attendees listed' },
        { content: '—', styles: { halign: 'center', fontStyle: 'normal' } }
      ]);
    }

    autoTable(doc, {
      startY: currentY,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 3.2,
        lineColor: [40, 40, 40],
        lineWidth: 0.25,
        textColor: [20, 20, 20],
        font: 'helvetica'
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineWidth: 0.25,
        lineColor: [40, 40, 40]
      },
      head: [
        [
          { content: 'Sl. No.', styles: { halign: 'center', cellWidth: 18 } },
          { content: 'Employee ID', styles: { halign: 'center', cellWidth: 32 } },
          { content: 'Trainee Name', styles: { cellWidth: 65 } },
          { content: 'Date and signature', styles: { halign: 'center' } }
        ]
      ],
      body: attendeesBody,
      margin: { left: margin, right: margin, bottom: 18 },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const attendee = validAttendees[data.row.index];
          if (attendee && attendee.signatureData) {
            try {
              const cell = data.cell;
              const dims = attendeeSigDims[data.row.index];
              const aspect = (dims?.width && dims?.height) ? dims.width / dims.height : 2.5;

              let sigH = Math.min(7.5, cell.height - 3);
              let sigW = sigH * aspect;
              const maxW = Math.min(30, cell.width - 26);
              if (sigW > maxW) {
                sigW = maxW;
                sigH = maxW / aspect;
              }

              const sigX = cell.x + 4;
              const sigY = cell.y + (cell.height - sigH) / 2 - 0.5;

              doc.addImage(attendee.signatureData, 'PNG', sigX, sigY, sigW, sigH, undefined, 'FAST');

              // Underline below signature image (as shown in view mode)
              doc.setDrawColor(70, 70, 70);
              doc.setLineWidth(0.25);
              doc.line(sigX, cell.y + cell.height - 2, sigX + Math.max(sigW, 20), cell.y + cell.height - 2);

              // Date text on right side of cell
              const dateStr = attendee.signedDate || (attendee.signedAt ? formatDate(attendee.signedAt) : register.date);
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(8);
              doc.setTextColor(30, 41, 59);
              doc.text(dateStr, cell.x + cell.width - 4, cell.y + cell.height / 2 + 2.5, { align: 'right' });
            } catch (err) {
              console.error('Failed to draw attendee signature image in PDF:', err);
              const dateStr = attendee.signedDate || (attendee.signedAt ? formatDate(attendee.signedAt) : register.date);
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(8);
              doc.setTextColor(30, 41, 59);
              doc.text(`Signed: ${dateStr}`, data.cell.x + 4, data.cell.y + data.cell.height / 2 + 2.5);
            }
          }
        }
      },
      didDrawPage: (data) => {
        // Footer: OPS-TRG-REG V1.1.3 | Date: 27-Jul-2026 ... Confidential ... Page X of Y
        const footerY = pageHeight - 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);

        // Left footer
        const docCode = register.templateDocCode || 'OPS-TRG-REG';
        const docVer = register.templateVersion || 'V1.1.3';
        const docEffDate = register.templateEffectiveDate || '27-Jul-2026';
        doc.text(`${docCode} ${docVer} | Date: ${docEffDate}`, margin, footerY);

        // Center footer
        doc.text(register.confidentialText || 'Confidential', pageWidth / 2, footerY, { align: 'center' });

        // Right footer
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageWidth - margin, footerY, { align: 'right' });
      }
    });

    // Filename: Training_Register_[Title]_[Date].pdf
    const sanitizedTitle = (register.trainingTitle || 'Training_Register').replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Training_Register_${sanitizedTitle}_${register.date}.pdf`);
  }
};
