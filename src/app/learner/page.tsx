"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LearnerPracticePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/learner/classes');
  }, [router]);

  return null;
}
