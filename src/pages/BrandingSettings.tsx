import React, { useState, useEffect } from 'react';
import { Save, Image as ImageIcon, Type, Layout, ShieldCheck, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

interface BrandingSettings {
  appName: string;
  companyName: string;
  logoUrl: string;
  primaryColor?: string;
}

export default function BrandingSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<BrandingSettings>({
    appName: 'AssessPro',
    companyName: '',
    logoUrl: '',
    primaryColor: '#0f172a'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      // Log viewing activity
      await firestoreService.logActivity('Viewed Branding Settings', 'Settings', {}, user?.uid, user?.email);

      const data = await firestoreService.getDocument<BrandingSettings>('settings', 'branding');
      if (data) {
        setSettings({
          appName: data.appName || 'AssessPro',
          companyName: data.companyName || '',
          logoUrl: data.logoUrl || '',
          primaryColor: data.primaryColor || '#0f172a'
        });
      }
      setLoading(false);
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await firestoreService.createDocument('settings', settings, 'branding');
      await firestoreService.logActivity('Updated Branding Settings', 'Settings', settings, user?.uid, user?.email);
      toast.success('Branding settings updated successfully');
      // Force a reload to apply changes globally
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast.error('Failed to update branding settings');
    } finally {
      setSaving(false);
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
        // Refresh to show zeroed statistics
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

    if (file.size > 1024 * 1024) {
      toast.error('Logo file size exceeds 1MB limit.');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSettings({ ...settings, logoUrl: ev.target?.result as string });
      setUploading(false);
      toast.success('Logo uploaded successfully (preview only, save to apply)');
    };
    reader.onerror = () => {
      setUploading(false);
      toast.error('Failed to read logo file');
    };
    reader.readAsDataURL(file);
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Loading settings...</div>;

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
                  <div className="flex gap-3">
                    <input 
                      type="text"
                      className="flex-1 px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                      value={settings.logoUrl}
                      onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                      placeholder="https://example.com/logo.png or upload below"
                    />
                  </div>
                  <div className="relative">
                    <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer hover:bg-accent transition-all group">
                      {uploading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      )}
                      <span className="text-sm font-medium">Click to upload logo image</span>
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
                <p className="text-[10px] text-muted-foreground">Provide a public URL or upload an image. Recommended size: 64x64px. Max size: 1MB.</p>
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
              <div className="p-4 border rounded-xl bg-background flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
                  {settings.logoUrl ? (
                    <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <ShieldCheck className="text-primary-foreground w-5 h-5" />
                  )}
                </div>
                <span className="text-lg font-bold tracking-tight">{settings.appName}</span>
              </div>

              <div className="p-4 border rounded-xl bg-background space-y-2">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                <div className="h-8 w-full bg-primary/10 rounded border border-primary/20 flex items-center px-3">
                  <div className="h-3 w-3 bg-primary rounded-full mr-2" />
                  <div className="h-2 w-20 bg-primary/40 rounded" />
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
