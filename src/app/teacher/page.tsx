"use client";

import { useAppContext } from '@/context/AppContext';
import TeacherView from '@/components/TeacherView';

export default function TeacherPronunciationPage() {
  const { progress, handleAssign } = useAppContext();

  return <TeacherView progress={progress} onAssign={handleAssign} />;
}
