import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, collection, query, where, getDocs, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { User, RoleDefinition, Permission } from '../types';
import { firestoreService } from '../services/firestoreService';

export interface BrandingInfo {
  appName: string;
  companyName: string;
  logoUrl: string;
  primaryColor?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isHR: boolean;
  isReviewer: boolean;
  isQM: boolean;
  permissions: Permission[];
  hasPermission: (permission: Permission) => boolean;
  branding: BrandingInfo;
  updateBranding: (newBranding: Partial<BrandingInfo>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getInitialBranding = (): BrandingInfo => {
  try {
    const cached = localStorage.getItem('assesspro_branding');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') {
        return {
          appName: parsed.appName || 'AssessPro',
          companyName: parsed.companyName || '',
          logoUrl: parsed.logoUrl !== undefined ? parsed.logoUrl : '/logo.svg',
          primaryColor: parsed.primaryColor || '#0f172a'
        };
      }
    }
  } catch {}
  return { appName: 'AssessPro', companyName: '', logoUrl: '/logo.svg', primaryColor: '#0f172a' };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [branding, setBranding] = useState<BrandingInfo>(getInitialBranding);

  // Real-time synchronization of application branding across the entire app
  useEffect(() => {
    const unsubBranding = onSnapshot(doc(db, 'settings', 'branding'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const updated: BrandingInfo = {
          appName: data.appName || 'AssessPro',
          companyName: data.companyName || '',
          logoUrl: data.logoUrl !== undefined ? data.logoUrl : '/logo.svg',
          primaryColor: data.primaryColor || '#0f172a'
        };
        setBranding(updated);
        try {
          localStorage.setItem('assesspro_branding', JSON.stringify(updated));
        } catch {}
      }
    }, (err) => {
      console.warn('Branding realtime listener warning:', err);
    });

    return () => unsubBranding();
  }, []);

  const updateBranding = async (newBranding: Partial<BrandingInfo>) => {
    const updated: BrandingInfo = {
      ...branding,
      ...newBranding,
    };
    setBranding(updated);
    try {
      localStorage.setItem('assesspro_branding', JSON.stringify(updated));
    } catch {}
    await setDoc(doc(db, 'settings', 'branding'), {
      ...updated,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  };

  useEffect(() => {
    const initAuth = async () => {
      // 1. Instant local restore: If user was previously logged in, restore immediately without waiting for network
      const savedUser = localStorage.getItem('assesspro_user');
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser) as User;
          setUser(parsedUser);
          setLoading(false); // Render UI immediately for lightning-fast page loading!
        } catch {
          localStorage.removeItem('assesspro_user');
        }
      }

      // 2. Run background bootstrap non-blocking
      firestoreService.bootstrap().catch(err => {
        console.warn('Background bootstrap notice:', err);
      });

      // 3. Verify user session in background
      try {
        if (!savedUser) return;
        const parsedUser = JSON.parse(savedUser) as User;
        const userRef = doc(db, 'users', parsedUser.uid || parsedUser.email);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
          const userData = docSnap.data() as User;
          if (userData.status === 'active') {
            if (userData.email === 'ganesh@symetricsystems.com' || userData.email === 'ganesh123eee@gmail.com') {
              if (!userData.roles) userData.roles = [];
              if (!userData.roles.includes('super_admin')) {
                userData.roles.push('super_admin');
              }
            }
            if (userData.role && (!userData.roles || userData.roles.length === 0)) {
              userData.roles = [userData.role];
            }
            setUser(userData);
            localStorage.setItem('assesspro_user', JSON.stringify(userData));
          } else {
            setUser(null);
            localStorage.removeItem('assesspro_user');
          }
        } else {
          setUser(null);
          localStorage.removeItem('assesspro_user');
        }
      } catch (e) {
        console.error('Init auth error:', e);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const loginWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    try {
      // Validate against Firestore directly
      const userRef = doc(db, 'users', email);
      const docSnap = await getDoc(userRef);

      if (!docSnap.exists()) {
        throw new Error('Account not found in the system.');
      }

      const userData = docSnap.data() as User;

      if (userData.password !== pass) {
        throw new Error('Invalid password. Please try again.');
      }

      if (userData.status !== 'active') {
        throw new Error('Your account is currently inactive. Please contact your administrator.');
      }

      // Special case for hardcoded admin
      if (userData.email === 'ganesh@symetricsystems.com' || userData.email === 'ganesh123eee@gmail.com') {
        if (!userData.roles) userData.roles = [];
        if (!userData.roles.includes('super_admin')) {
          userData.roles.push('super_admin');
        }
      }

      // Migration for single role to roles array
      if (userData.role && (!userData.roles || userData.roles.length === 0)) {
        userData.roles = [userData.role];
      }

      const userToSave = { ...userData, uid: docSnap.id };
      setUser(userToSave);
      localStorage.setItem('assesspro_user', JSON.stringify(userToSave));
      
      // Log login activity
      await firestoreService.logActivity('User Login', 'Authentication', { email }, userToSave.uid, userToSave.email);
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    if (user) {
      await firestoreService.logActivity('User Logout', 'Authentication', { email: user.email }, user.uid, user.email);
    }
    setUser(null);
    localStorage.removeItem('assesspro_user');
  };

  useEffect(() => {
    const fetchPermissions = async () => {
      const userRolesList = user?.roles && user.roles.length > 0 
        ? user.roles 
        : (user?.role ? [user.role] : []);

      if (userRolesList.length > 0) {
        try {
          const roles = await firestoreService.getCollection<RoleDefinition>('roles');
          const userRoles = roles.filter(r => userRolesList.includes(r.id as any));
          const allPermissions = new Set<Permission>();
          userRoles.forEach(r => r.permissions.forEach(p => allPermissions.add(p)));

          // Default role fallbacks if roles collection in DB is empty or missing a role
          if (userRolesList.includes('reviewer' as any)) {
            allPermissions.add('view_dashboard');
            allPermissions.add('evaluate_submissions');
            allPermissions.add('view_my_assessments');
          }
          if (userRolesList.includes('quality_management' as any)) {
            allPermissions.add('view_dashboard');
            allPermissions.add('manage_templates');
            allPermissions.add('manage_assignments');
            allPermissions.add('evaluate_submissions');
            allPermissions.add('view_reports');
            allPermissions.add('view_my_assessments');
            allPermissions.add('manage_training_registers');
          }
          if (userRolesList.includes('hr_admin' as any)) {
            allPermissions.add('view_dashboard');
            allPermissions.add('manage_templates');
            allPermissions.add('manage_assignments');
            allPermissions.add('evaluate_submissions');
            allPermissions.add('manage_users');
            allPermissions.add('manage_departments');
            allPermissions.add('view_reports');
            allPermissions.add('view_my_assessments');
            allPermissions.add('manage_training_registers');
          }
          if (userRolesList.includes('employee' as any)) {
            allPermissions.add('view_my_assessments');
          }
          
          // Super admin always has all permissions
          if (userRolesList.includes('super_admin' as any) || user?.email === 'ganesh@symetricsystems.com' || user?.email === 'ganesh123eee@gmail.com') {
            const superAdminPermissions: Permission[] = [
              'view_dashboard', 'manage_templates', 'manage_assignments', 'evaluate_submissions', 
              'manage_users', 'manage_departments', 'view_reports', 'view_audit_logs', 
              'manage_branding', 'view_my_assessments', 'manage_training_registers'
            ];
            setPermissions(superAdminPermissions);
          } else {
            setPermissions(Array.from(allPermissions));
          }
        } catch (error) {
          console.error('Error fetching permissions:', error);
        }
      } else {
        setPermissions([]);
      }
    };
    fetchPermissions();
  }, [user]);

  const hasPermission = (permission: Permission) => {
    return permissions.includes(permission);
  };

  const userRolesList = user?.roles && user.roles.length > 0 
    ? user.roles 
    : (user?.role ? [user.role] : []);

  const isAdmin = userRolesList.includes('super_admin' as any) || user?.email === 'ganesh@symetricsystems.com' || user?.email === 'ganesh123eee@gmail.com';
  const isHR = userRolesList.includes('hr_admin' as any) || isAdmin;
  const isQM = userRolesList.includes('quality_management' as any) || isAdmin;
  const isReviewer = userRolesList.includes('reviewer' as any) || isHR || isQM;

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      loginWithEmail, 
      logout, 
      isAdmin, 
      isHR, 
      isReviewer, 
      isQM, 
      permissions, 
      hasPermission, 
      branding,
      updateBranding
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
