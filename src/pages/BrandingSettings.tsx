import React, { useState, useEffect } from 'react';
import { Save, Image as ImageIcon, Type, Layout, ShieldCheck, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { BrandLogo } from '../components/BrandLogo';

interface BrandingSettings {
  appName: string;
  companyName: string;
  logoUrl: string;
  primaryColor?: string;
}

export default function BrandingSettings() {
  const { user, branding, updateBranding } = useAuth();
  const [settings, setSettings] = useState<BrandingSettings>({
    appName: branding?.appName || 'AssessPro',
    companyName: branding?.companyName || '',
    logoUrl: branding?.logoUrl || '',
    primaryColor: branding?.primaryColor || '#0f172a'
  });
  const [saving, setSaving] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (branding) {
      setSettings(prev => ({
        ...prev,
        appName: branding.appName || 'AssessPro',
        companyName: branding.companyName || '',
        logoUrl: branding.logoUrl || '',
        primaryColor: branding.primaryColor || '#0f172a'
      }));
    }
  }, [branding]);

  useEffect(() => {
    // Log viewing activity
    firestoreService.logActivity('Viewed Branding Settings', 'Settings', {}, user?.uid, user?.email).catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateBranding(settings);
      await firestoreService.logActivity('Updated Branding Settings', 'Settings', settings, user?.uid, user?.email);
      toast.success('Branding settings saved successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update branding settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLogoUrl = async () => {
    setSavingLogo(true);
    try {
      await updateBranding({ logoUrl: settings.logoUrl.trim() });
      await firestoreService.logActivity('Updated Logo URL', 'Settings', { logoUrl: settings.logoUrl.trim() }, user?.uid, user?.email);
      toast.success('Logo URL updated and applied successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update logo URL');
    } finally {
      setSavingLogo(false);
    }
  };

  const [resetting, setResetting] = useState(false);
  const handleResetData = async () => {
    const isConfirmed = window.confirm('Are you absolutely sure? This will delete all submissions, appraisals, evaluations, assignments, and logs. This action CANNOT be undone.');
    
    if (isConfirmed) {
      setResetting(true);
      try {
        await firestoreService.clearTransactionalData();
        await firestoreService.logActivity('Reset System Data', 'Settings', { action: 'Full Transactional Reset' }, user?.uid, user?.email);
        toast.success('System data has been reset successfully.');
        window.location.reload();
      } catch (error) {
        console.error(error);
        toast.error('Failed to reset system data.');
      } finally {
        setResetting(false);
      }
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      toast.error('File size exceeds 8MB limit.');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target?.result as string;
      
      // Auto-compress and scale image using an offscreen canvas to keep document size light & fast
      const img = new Image();
      img.onload = async () => {
        try {
          const maxDim = 360;
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          let optimizedDataUrl = rawDataUrl;

          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            const pngData = canvas.toDataURL('image/png');
            if (pngData.length > 200000) {
              optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
            } else {
              optimizedDataUrl = pngData;
            }
          }

          // Immediately update state, persist to Firestore and sync via AuthContext
          setSettings(prev => ({ ...prev, logoUrl: optimizedDataUrl }));
          await updateBranding({ logoUrl: optimizedDataUrl });
          await firestoreService.logActivity('Uploaded and updated brand logo', 'Settings', { hasLogo: true }, user?.uid, user?.email);
          toast.success('Logo uploaded and applied successfully across the app!');
        } catch (err) {
          console.error('Failed to save uploaded logo:', err);
          toast.error('Failed to save uploaded logo');
        } finally {
          setUploading(false);
          if (e.target) e.target.value = '';
        }
      };
      img.onerror = () => {
        setUploading(false);
        toast.error('Failed to parse uploaded image');
        if (e.target) e.target.value = '';
      };
      img.src = rawDataUrl;
    };
    reader.onerror = () => {
      setUploading(false);
      toast.error('Failed to read logo file');
      if (e.target) e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Application Branding</h1>
        <p className="text-muted-foreground mt-1">Customize the application name, logo, and visual identity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Application Name
                </label>
                <input 
                  type="text"
                  className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  value={settings.appName}
                  onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                  placeholder="e.g. AssessPro Enterprise"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Layout className="w-4 h-4" />
                  Company Name
                </label>
                <input 
                  type="text"
                  className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  value={settings.companyName}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  placeholder="e.g. Acme Corporation"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Logo
                </label>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input 
                      type="text"
                      className="flex-1 px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 text-xs sm:text-sm font-mono"
                      value={settings.logoUrl}
                      onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                      placeholder="https://example.com/logo.png or upload below"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleSaveLogoUrl}
                        disabled={savingLogo || uploading}
                        className="px-3 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                        title="Apply and save this logo URL"
                      >
                        {savingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        <span>Save URL</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setSettings(prev => ({ ...prev, logoUrl: '/logo.svg' }));
                          await updateBranding({ logoUrl: '/logo.svg' });
                          toast.success('Logo reset to default logo');
                        }}
                        className="px-3 py-2 bg-muted hover:bg-accent text-xs font-semibold rounded-lg border transition-colors shrink-0"
                        title="Reset to the default AssessPro SVG logo"
                      >
                        Default
                      </button>
                      {settings.logoUrl && (
                        <button
                          type="button"
                          onClick={async () => {
                            setSettings(prev => ({ ...prev, logoUrl: '' }));
                            await updateBranding({ logoUrl: '' });
                            toast.success('Logo removed');
                          }}
                          className="px-3 py-2 text-destructive hover:bg-destructive/10 text-xs font-semibold rounded-lg border border-destructive/20 transition-colors shrink-0"
                          title="Remove logo and use default shield icon"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <label className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer hover:bg-accent transition-all group ${uploading ? 'opacity-70 pointer-events-none' : ''}`}>
                      {uploading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      )}
                      <span className="text-sm font-medium">
                        {uploading ? 'Processing & saving logo...' : 'Click to upload logo image (saves automatically)'}
                      </span>
                      <input 
                        type="file" 
                        accept="image/*"
                        className="hidden" 
                        onChange={handleLogoUpload}
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Provide an image URL or upload an image file (PNG, JPG, SVG, WebP). Uploaded logos are automatically optimized and updated across the entire platform.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Layout className="w-4 h-4" />
                  Primary Theme Color
                </label>
                <div className="flex gap-3">
                  <input 
                    type="color"
                    className="w-12 h-10 p-1 bg-background border rounded-lg cursor-pointer"
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  />
                  <input 
                    type="text"
                    className="flex-1 px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <button 
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save Branding Settings</span>
              </button>
            </div>
          </div>

          {user?.role === 'super_admin' && (
            <div className="bg-destructive/5 p-6 rounded-2xl border border-destructive/20 shadow-sm space-y-6 mt-8">
              <div className="flex items-center gap-3 text-destructive">
                <AlertTriangle className="w-6 h-6" />
                <h2 className="text-xl font-bold">System Maintenance</h2>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm font-medium">Reset Application Data</p>
                <p className="text-xs text-muted-foreground">
                  Deleting all transactional data will reset all counters to zero. This includes all submissions, appraisals, evaluations, assignments, audit logs, and notifications. 
                  <span className="font-bold block mt-1">Templates, Users, Departments, and Roles will not be affected.</span>
                </p>
              </div>

              <div className="pt-4 border-t border-destructive/10">
                <button 
                  onClick={handleResetData}
                  disabled={resetting}
                  className="flex items-center gap-2 px-6 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  <span>Reset All Transactional Data</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Preview</h3>
            
            <div className="space-y-6">
              <div className="p-4 border rounded-xl bg-background flex items-center justify-between gap-3">
                <BrandLogo 
                  size="md" 
                  showAppName 
                  customLogoUrl={settings.logoUrl} 
                  customAppName={settings.appName}
                  appNameClassName="text-base font-bold"
                />
              </div>

              <div className="p-4 border rounded-xl bg-background space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Header / Banner View</p>
                <div className="p-4 rounded-xl border flex items-center gap-4 bg-muted/20">
                  <BrandLogo 
                    size="lg" 
                    customLogoUrl={settings.logoUrl} 
                    customAppName={settings.appName}
                  />
                  <div>
                    <h4 className="text-base font-bold text-foreground leading-tight">
                      {settings.appName || 'AssessPro'}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {settings.companyName || 'Enterprise Performance & Compliance'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 space-y-2">
            <p className="font-bold">Pro Tip:</p>
            <p>Changes to branding settings will be applied across the entire application for all users immediately after saving.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
