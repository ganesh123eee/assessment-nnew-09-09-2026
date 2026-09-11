import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  addDoc,
  onSnapshot,
  Timestamp,
  getDocFromServer,
  limit
} from 'firebase/firestore';
import { db, auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { where, query, limit, orderBy } from 'firebase/firestore';

export const firestoreService = {
  async getDocument<T>(path: string, id: string): Promise<T | null> {
    if (!id) {
      console.error(`getDocument called with missing ID for path: ${path}`);
      return null;
    }
    try {
      const docRef = doc(db, path, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? ({ ...docSnap.data(), id: docSnap.id } as T) : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${path}/${id}`);
      return null;
    }
  },

  async getCollection<T>(path: string, constraints: any[] = []): Promise<T[]> {
    try {
      const colRef = collection(db, path);
      const q = query(colRef, ...constraints);
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as T));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async createDocument<T>(path: string, data: any, id?: string): Promise<string> {
    try {
      if (id) {
        await setDoc(doc(db, path, id), { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        return id;
      } else {
        const docRef = await addDoc(collection(db, path), { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        return docRef.id;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      return '';
    }
  },

  async updateDocument(path: string, id: string, data: any): Promise<void> {
    if (!id) {
      console.error(`updateDocument called with missing ID for path: ${path}`);
      return;
    }
    try {
      const docRef = doc(db, path, id);
      await updateDoc(docRef, { ...data, updatedAt: new Date().toISOString() });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${path}/${id}`);
    }
  },

  async deleteDocument(path: string, id: string): Promise<void> {
    if (!id) {
      console.error(`deleteDocument called with missing ID for path: ${path}`);
      return;
    }
    try {
      await deleteDoc(doc(db, path, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${path}/${id}`);
    }
  },

  subscribeToCollection<T>(path: string, constraints: any[], callback: (data: T[]) => void) {
    const q = query(collection(db, path), ...constraints);
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as T)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  },

  async testConnection() {
    try {
      console.log('Testing Firestore connection...');
      await getDocFromServer(doc(db, 'test', 'connection'));
      console.log('Firestore connection successful.');
    } catch (error: any) {
      if (error.message?.includes('the client is offline')) {
        console.error("CRITICAL: Firestore is reporting offline. This usually means the Firebase configuration is incorrect or the database is not provisioned correctly.");
        console.error("Current Config:", {
          projectId: db.app.options.projectId,
          databaseId: (db as any)._databaseId?.database || 'default'
        });
      } else {
        // Ignore other errors like "not found" as the document might not exist
        console.log('Firestore connection test completed (ignoring non-offline errors).');
      }
    }
  },

  async logActivity(action: string, module: string, details: any = {}, userId?: string, userEmail?: string) {
    try {
      const finalUserId = userId || auth.currentUser?.uid || 'system';
      const finalUserEmail = userEmail || auth.currentUser?.email || 'system@assesspro.com';
      
      await addDoc(collection(db, 'auditLogs'), {
        userId: finalUserId,
        userEmail: finalUserEmail,
        action,
        module,
        timestamp: new Date().toISOString(),
        details
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  },

  async clearTransactionalData() {
    const collectionsToClear = ['submissions', 'reviews', 'assignments', 'auditLogs', 'notifications', 'mail'];
    
    for (const colName of collectionsToClear) {
      try {
        const colRef = collection(db, colName);
        const snapshot = await getDocs(colRef);
        console.log(`Clearing ${snapshot.size} documents from ${colName}...`);
        
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        console.log(`Successfully cleared ${colName}.`);
      } catch (error) {
        console.error(`Failed to clear collection ${colName}:`, error);
        // Don't throw here, try to clear other collections
      }
    }
  },

  async bootstrapRoles() {
    try {
      const rolesSnap = await getDocs(collection(db, 'roles'));
      if (rolesSnap.empty) {
        console.log('Bootstrapping default roles...');
        const defaultRoles = [
          {
            id: 'super_admin',
            name: 'Super Admin',
            description: 'Full system access',
            permissions: ['view_dashboard', 'manage_templates', 'manage_assignments', 'evaluate_submissions', 'manage_users', 'manage_departments', 'view_reports', 'view_audit_logs', 'manage_branding', 'view_my_assessments'],
            isSystem: true
          },
          {
            id: 'hr_admin',
            name: 'HR Admin',
            description: 'Manage assessments and users',
            permissions: ['view_dashboard', 'manage_templates', 'manage_assignments', 'evaluate_submissions', 'manage_users', 'manage_departments', 'view_reports', 'view_my_assessments'],
            isSystem: true
          },
          {
            id: 'quality_management',
            name: 'Quality Management',
            description: 'Manage assessment templates and assignments',
            permissions: ['view_dashboard', 'manage_templates', 'manage_assignments', 'evaluate_submissions', 'view_my_assessments'],
            isSystem: true
          },
          {
            id: 'reviewer',
            name: 'Reviewer',
            description: 'Evaluate submissions',
            permissions: ['view_dashboard', 'evaluate_submissions', 'view_my_assessments'],
            isSystem: true
          },
          {
            id: 'employee',
            name: 'Employee',
            description: 'Take assessments',
            permissions: ['view_my_assessments'],
            isSystem: true
          }
        ];

        for (const role of defaultRoles) {
          await setDoc(doc(db, 'roles', role.id), {
            ...role,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
        console.log('Roles bootstrap complete.');
      }
    } catch (error) {
      console.error('Roles bootstrap failed:', error);
      handleFirestoreError(error, OperationType.LIST, 'roles');
    }
  },

  async bootstrap() {
    try {
      // Bootstrap roles first
      await this.bootstrapRoles();

      const usersSnap = await getDocs(query(collection(db, 'users'), limit(1)));
      if (usersSnap.empty) {
        console.log('Bootstrapping initial admin user...');
        const adminEmails = ['ganesh@symetricsystems.com', 'ganesh123eee@gmail.com'];
        for (const email of adminEmails) {
          await setDoc(doc(db, 'users', email), {
            uid: email,
            email: email,
            displayName: 'Super Admin',
            role: 'super_admin',
            roles: ['super_admin'],
            status: 'active',
            password: 'admin', // Default password
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
        
        // Also bootstrap branding if not already configured
        const brandingSnap = await getDoc(doc(db, 'settings', 'branding'));
        if (!brandingSnap.exists()) {
          await setDoc(doc(db, 'settings', 'branding'), {
            appName: 'AssessPro',
            companyName: 'Symetric Systems',
            logoUrl: '/logo.svg',
            primaryColor: '#0f172a',
            updatedAt: new Date().toISOString()
          });
        }
        console.log('Bootstrap complete.');
      }
    } catch (error) {
      console.error('Bootstrap failed:', error);
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  },

  async resetTransactionData() {
    try {
      const collectionsToClear = [
        'assignments',
        'submissions',
        'reviews',
        'training_registers',
        'notifications',
        'auditLogs'
      ];

      let deletedCount = 0;
      for (const colName of collectionsToClear) {
        const snap = await getDocs(collection(db, colName));
        for (const docSnap of snap.docs) {
          await deleteDoc(doc(db, colName, docSnap.id));
          deletedCount++;
        }
      }

      return { success: true, deletedCount };
    } catch (error) {
      console.error('Reset transaction data failed:', error);
      handleFirestoreError(error, OperationType.DELETE, 'transactions');
      throw error;
    }
  }
};
