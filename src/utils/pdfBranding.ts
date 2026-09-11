import { jsPDF } from 'jspdf';

export interface BrandingInfo {
  logoUrl?: string;
  companyName?: string;
  appName?: string;
  primaryColor?: string;
}

export interface PdfHeaderOptions {
  margin?: number;
  topY?: number;
  rightHeaderText?: string;
  showDivider?: boolean;
  maxLogoHeight?: number;
  maxLogoWidth?: number;
}

export interface PdfHeaderResult {
  nextY: number;
  logoWidth: number;
  logoHeight: number;
}

/**
 * Draws a consistent, high-fidelity header across all PDF reports.
 * Preserves the natural aspect ratio of the company logo without stretching or distortion,
 * rendering the company name and app subtitle in clean typographic hierarchy.
 */
export async function drawPdfBrandingHeader(
  doc: jsPDF,
  branding?: BrandingInfo,
  options?: PdfHeaderOptions
): Promise<PdfHeaderResult> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = options?.margin ?? 14;
  const topY = options?.topY ?? 10;
  const maxH = options?.maxLogoHeight ?? 13;
  const maxW = options?.maxLogoWidth ?? 30;

  let logoW = 0;
  let logoH = 0;
  let hasLogo = false;

  if (branding?.logoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve(); // Gracefully proceed even if image fails to load
        img.src = branding.logoUrl || '';
      });

      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        const aspect = img.naturalWidth / img.naturalHeight;
        logoH = maxH;
        logoW = logoH * aspect;

        if (logoW > maxW) {
          logoW = maxW;
          logoH = maxW / aspect;
        }

        // Render via high-DPI canvas to safely convert SVGs / WebP / relative URLs into PNG for jsPDF
        try {
          const canvas = document.createElement('canvas');
          const scale = 2;
          const targetW = (img.naturalWidth || 128) * scale;
          const targetH = (img.naturalHeight || 128) * scale;
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, targetW, targetH);
            const pngDataUrl = canvas.toDataURL('image/png');
            doc.addImage(pngDataUrl, 'PNG', margin, topY, logoW, logoH, undefined, 'FAST');
            hasLogo = true;
          } else {
            doc.addImage(img, 'PNG', margin, topY, logoW, logoH, undefined, 'FAST');
            hasLogo = true;
          }
        } catch {
          // Fallback direct image add if canvas has security restriction
          doc.addImage(img, 'PNG', margin, topY, logoW, logoH, undefined, 'FAST');
          hasLogo = true;
        }
      }
    } catch (err) {
      console.warn('Failed to render logo in PDF, rendering text branding only:', err);
      logoW = 0;
      logoH = 0;
      hasLogo = false;
    }
  }

  const textX = hasLogo ? margin + logoW + 3.5 : margin;
  const companyName = branding?.companyName || 'SyMetric Systems';
  const appName = branding?.appName || 'SymetricAssessPro';
  const hasSubtitle = Boolean(appName && appName.toLowerCase() !== companyName.toLowerCase());

  // Vertically align company name beside the logo
  const companyNameY = hasLogo
    ? (hasSubtitle ? topY + Math.min(logoH * 0.45, 5.5) : topY + logoH / 2 + 2)
    : topY + 5.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(companyName, textX, companyNameY);

  if (hasSubtitle) {
    const subtitleY = companyNameY + 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(59, 130, 246); // Primary accent blue matching web branding
    doc.text(appName, textX, subtitleY);
  }

  // Right-aligned header note if requested (e.g., Template Code or Classification)
  if (options?.rightHeaderText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(options.rightHeaderText, pageWidth - margin, topY + 5.5, { align: 'right' });
  }

  // Divider line
  const showDivider = options?.showDivider ?? true;
  let nextY = Math.max(topY + logoH, topY + (hasSubtitle ? 11.5 : 7.5)) + 3;

  if (showDivider) {
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.35);
    doc.line(margin, nextY, pageWidth - margin, nextY);
    nextY += 5; // space after divider
  } else {
    nextY += 3;
  }

  return {
    nextY,
    logoWidth: logoW,
    logoHeight: logoH
  };
}
