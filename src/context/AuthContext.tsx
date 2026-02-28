"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { User, SupabaseClient, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

async function fetchProfileFromDB(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116' && attempt < 2) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      console.error('Error fetching profile:', error);
      return null;
    }
    return data as Profile;
  }
  return null;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const signingOutRef = useRef(false);

  const refreshProfile = useCallback(async () => {
    if (user) {
      const p = await fetchProfileFromDB(supabase, user.id);
      setProfile(p);
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;

    // Safety timeout: force loading=false after 5s even if getSession hangs
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);


    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user ?? null;
        if (!mounted) return;

        if (user) {
          setUser(user);
          setLoading(false);
          clearTimeout(timeout);
          // Profile loads in background — pages default to LEARNER while null
          const p = await fetchProfileFromDB(supabase, user.id);
          if (mounted) setProfile(p);
        } else {
          setLoading(false);
          clearTimeout(timeout);
        }
      } catch (err) {
        console.error('Auth init error:', err);
        if (mounted) setLoading(false);
        clearTimeout(timeout);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          setLoading(false);
          clearTimeout(timeout);
          const p = await fetchProfileFromDB(supabase, session.user.id);
          if (mounted) setProfile(p);
        } else if (event === 'SIGNED_OUT') {
          if (!signingOutRef.current) {
            setUser(null);
            setProfile(null);
          }
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    signingOutRef.current = true;

    // Sign out client-side
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error (client):', err);
    }

    // Sign out server-side to ensure cookies are properly cleared
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } catch (err) {
      console.error('Sign out error (server):', err);
    }

    setUser(null);
    setProfile(null);
    window.location.replace('/login');
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
