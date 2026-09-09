import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { User, RoleDefinition, Permission } from '../types';
import { firestoreService } from '../services/firestoreService';

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
  branding: { appName: string; companyName: string; logoUrl: string; primaryColor?: string };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [branding, setBranding] = useState({ appName: 'AssessPro', companyName: '', logoUrl: '', primaryColor: '#0f172a' });

  useEffect(() => {
    const initAuth = async () => {
      // Test connection and bootstrap if needed
      await firestoreService.testConnection();
      await firestoreService.bootstrap();

      // Load branding first
      try {
        const brandingRef = doc(db, 'settings', 'branding');
        const brandingSnap = await getDoc(brandingRef);
        if (brandingSnap.exists()) {
          const data = brandingSnap.data();
          setBranding({
            appName: data.appName || 'AssessPro',
            companyName: data.companyName || '',
            logoUrl: data.logoUrl || '',
            primaryColor: data.primaryColor || '#0f172a'
          });
        }
      } catch (e) {
        console.error('Failed to load branding:', e);
      }

      const savedUser = localStorage.getItem('assesspro_user');
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser) as User;
          // Verify user still exists and is active
          const userRef = doc(db, 'users', parsedUser.uid || parsedUser.email);
          const docSnap = await getDoc(userRef);
          
          if (docSnap.exists()) {
            const userData = docSnap.data() as User;
            if (userData.status === 'active') {
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
              setUser(userData);
            } else {
              localStorage.removeItem('assesspro_user');
            }
          } else {
            localStorage.removeItem('assesspro_user');
          }
        } catch (error) {
          console.error('Auth initialization error:', error);
          localStorage.removeItem('assesspro_user');
        }
      }
      setLoading(false);
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
      if (user?.roles && user.roles.length > 0) {
        try {
          const roles = await firestoreService.getCollection<RoleDefinition>('roles');
          const userRoles = roles.filter(r => user.roles.includes(r.id as any));
          const allPermissions = new Set<Permission>();
          userRoles.forEach(r => r.permissions.forEach(p => allPermissions.add(p)));
          
          // Super admin always has all permissions
          if (user.roles.includes('super_admin' as any) || user.email === 'ganesh@symetricsystems.com' || user.email === 'ganesh123eee@gmail.com') {
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

  const isAdmin = user?.roles?.includes('super_admin') || user?.email === 'ganesh@symetricsystems.com' || user?.email === 'ganesh123eee@gmail.com';
  const isHR = user?.roles?.includes('hr_admin') || isAdmin;
  const isQM = user?.roles?.includes('quality_management') || isAdmin;
  const isReviewer = user?.roles?.includes('reviewer') || isHR || isQM;

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
      branding
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
