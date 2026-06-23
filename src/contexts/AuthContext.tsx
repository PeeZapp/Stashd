import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile as firebaseUpdateProfile,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { deleteAllUserData, getProfile, upsertProfile } from '../lib/firestore';
import type { Profile } from '../lib/types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const safetyTimer = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 10000);

    void auth.authStateReady().then(() => {
      if (cancelled) return;
      const currentUser = auth.currentUser;
      setUser(currentUser);
      if (currentUser) {
        void loadProfile(currentUser.uid, currentUser);
      } else {
        setLoading(false);
      }
    });

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (cancelled) return;
      (async () => {
        setUser(nextUser);
        if (nextUser) {
          await loadProfile(nextUser.uid, nextUser);
        } else {
          setProfile(null);
          setLoading(false);
        }
      })();
    });

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []);

  const loadProfile = async (userId: string, authUser?: User | null) => {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Profile load timed out')), 8000)
    );
    try {
      const existingProfile = await Promise.race([
        getProfile(userId),
        timeout,
      ]);

      if (existingProfile) {
        setProfile(existingProfile);
      } else if (authUser) {
        const fallbackName =
          authUser.displayName?.trim() ||
          authUser.email?.split('@')[0] ||
          'User';
        await upsertProfile({
          id: userId,
          email: authUser.email ?? '',
          name: fallbackName,
        });
        const created = await getProfile(userId);
        setProfile(created);
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.uid, user);
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (email: string, password: string, username: string) => {
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (username.trim()) {
        await firebaseUpdateProfile(credential.user, { displayName: username.trim() });
      }
      await upsertProfile({
        id: credential.user.uid,
        email: credential.user.email ?? email,
        name: username.trim(),
      });

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(auth, provider);
      const fallbackName =
        credential.user.displayName?.trim() ||
        credential.user.email?.split('@')[0] ||
        'User';
      await upsertProfile({
        id: credential.user.uid,
        email: credential.user.email ?? '',
        name: fallbackName,
      });
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    setProfile(null);
    setUser(null);
    setLoading(false);
    await Promise.race([
      firebaseSignOut(auth),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
  };

  const deleteAccount = async () => {
    if (!user || !auth.currentUser) return { error: new Error('Not signed in') };
    try {
      await deleteAllUserData(user.uid);
      await deleteUser(auth.currentUser);
      await firebaseSignOut(auth);
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signInWithGoogle, signOut, deleteAccount, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
