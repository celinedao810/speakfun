"use client";

import React from 'react';
import { Mic, BookOpen, Users, Sparkles, MessageSquareText, Gamepad2, MessagesSquare } from 'lucide-react';
import TabNav, { TabNavItem } from '@/components/TabNav';

// Audio Generator (/teacher/audio-generator) is hidden from the tabs for now; the page itself still works.
const tabs: TabNavItem[] = [
  { href: '/teacher', label: 'Pronunciation', icon: Mic, exact: true },
  { href: '/teacher/courses', label: 'Courses', icon: BookOpen },
  { href: '/teacher/classes', label: 'Classes', icon: Users },
  { href: '/teacher/lesson-plans', label: 'Lesson Plans', icon: Sparkles },
  { href: '/teacher/feedback', label: 'Feedback', icon: MessageSquareText },
  { href: '/teacher/games', label: 'Games', icon: Gamepad2 },
  { href: '/teacher/voice-chain', label: 'Voice Chain', icon: MessagesSquare },
]; // v2

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <TabNav tabs={tabs} />
      {children}
    </div>
  );
}
