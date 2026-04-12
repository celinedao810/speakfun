"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const role = profile?.role || 'LEARNER';

  useEffect(() => {
    if (!authLoading) {
      if (role === 'TEACHER') {
        router.replace('/teacher');
      } else {
        router.replace('/learner/classes');
      }
    }
  }, [authLoading, role, router]);

  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}
