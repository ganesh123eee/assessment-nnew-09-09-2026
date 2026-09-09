import React, { useRef, useState, useEffect } from 'react';
import { X, Eraser, Check, PenTool, Type, Calendar, ShieldCheck } from 'lucide-react';
import { formatDate } from '../lib/utils';

interface SignaturePadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signatureDataUrl: string, formattedDate: string) => void;
  title?: string;
  signerName: string;
  roleDescription?: string;
  defaultDate?: string;
}

export const SignaturePadModal: React.FC<SignaturePadModalProps> = ({
  isOpen,
  onClose,
  onSave,
  title = 'Digital Signature Verification',
  signerName,
  roleDescription = 'Trainee Attendance Verification',
  defaultDate
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState(signerName || '');
  const [selectedFont, setSelectedFont] = useState<'cursive' | 'serif' | 'script'>('cursive');
  
  // Format current date in strict DD-MMM-YYYY format
  const formattedToday = formatDate(defaultDate || new Date());

  useEffect(() => {
    if (signerName) {
      setTypedName(signerName);
    }
  }, [signerName]);

  useEffect(() => {
    if (!isOpen || mode !== 'draw') return;

    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas display resolution for high DPI
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      // Baseline styling
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      // Draw signature line indicator
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(30, rect.height - 35);
      ctx.lineTo(rect.width - 30, rect.height - 35);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.strokeStyle = '#0f172a';
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, rect.width * dpr, rect.height * dpr);

    // Re-draw baseline
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(30, rect.height - 35);
    ctx.lineTo(rect.width - 30, rect.height - 35);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = '#0f172a';
    setHasDrawn(false);
  };

  const handleSave = () => {
    let signatureUrl = '';

    if (mode === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;
      signatureUrl = canvas.toDataURL('image/png');
    } else {
      // Create offscreen canvas for typed cursive signature
      const offscreen = document.createElement('canvas');
      offscreen.width = 460;
      offscreen.height = 140;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = 'transparent';
      ctx.fillRect(0, 0, 460, 140);
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      if (selectedFont === 'cursive') {
        ctx.font = 'italic 38px "Brush Script MT", "Caveat", "Segoe Script", cursive';
      } else if (selectedFont === 'serif') {
        ctx.font = 'italic 34px "Georgia", serif';
      } else {
        ctx.font = 'italic 34px "Lucida Handwriting", cursive';
      }

      ctx.fillText(typedName, 230, 70);
      signatureUrl = offscreen.toDataURL('image/png');
    }

    onSave(signatureUrl, formattedToday);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-lg rounded-2xl shadow-2xl border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              {title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{roleDescription}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Signer Info Banner */}
          <div className="flex items-center justify-between p-3.5 bg-accent/40 rounded-xl border border-border/60 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block font-medium">Signer Identity:</span>
              <strong className="text-foreground text-sm font-semibold">{signerName || 'Trainee'}</strong>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted-foreground block font-medium flex items-center gap-1 justify-end">
                <Calendar className="w-3.5 h-3.5" /> Date (DD-MMM-YYYY):
              </span>
              <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 bg-primary/10 rounded-md">
                {formattedToday}
              </span>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex p-1 bg-muted rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setMode('draw')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'draw' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              Draw Signature
            </button>
            <button
              type="button"
              onClick={() => setMode('type')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'type' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              Type &amp; Adopt Signature
            </button>
          </div>

          {/* Canvas or Typed Input */}
          {mode === 'draw' ? (
            <div className="space-y-2">
              <div className="relative border-2 border-dashed border-border rounded-xl bg-white overflow-hidden touch-none h-44 shadow-inner">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-full cursor-crosshair block"
                />
                {!hasDrawn && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                    <PenTool className="w-5 h-5 opacity-40" />
                    <span>Sign above this line using mouse or touch</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>Draw your official legal signature</span>
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex items-center gap-1 text-destructive hover:underline font-medium"
                >
                  <Eraser className="w-3.5 h-3.5" /> Clear Signature
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Enter Your Name:</label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Type your full legal name"
                  className="w-full px-3.5 py-2 bg-background border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Choose Signature Style:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFont('cursive')}
                    className={`p-3 border rounded-xl text-center text-sm italic font-serif transition-all ${
                      selectedFont === 'cursive' ? 'border-primary bg-primary/5 text-primary font-bold' : 'hover:bg-accent'
                    }`}
                    style={{ fontFamily: 'Brush Script MT, cursive' }}
                  >
                    {typedName || 'Style 1'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFont('serif')}
                    className={`p-3 border rounded-xl text-center text-sm italic transition-all ${
                      selectedFont === 'serif' ? 'border-primary bg-primary/5 text-primary font-bold' : 'hover:bg-accent'
                    }`}
                    style={{ fontFamily: 'Georgia, serif' }}
                  >
                    {typedName || 'Style 2'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFont('script')}
                    className={`p-3 border rounded-xl text-center text-sm italic transition-all ${
                      selectedFont === 'script' ? 'border-primary bg-primary/5 text-primary font-bold' : 'hover:bg-accent'
                    }`}
                    style={{ fontFamily: 'Lucida Handwriting, cursive' }}
                  >
                    {typedName || 'Style 3'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Compliance Disclaimer */}
          <div className="text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/50">
            <p>
              I certify under penalty of perjury that this digital signature represents my true legal mark for 21 CFR Part 11 and SOP compliance.
            </p>
          </div>
        </div>

        {/* Footer actions */}
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
            disabled={mode === 'draw' ? !hasDrawn : !typedName.trim()}
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
          >
            <Check className="w-4 h-4" />
            Apply Digital Signature
          </button>
        </div>
      </div>
    </div>
  );
};
