"use client";

import React from 'react';
import { BookOpen, Users, Sparkles, MessageSquareText, Gamepad2, MessagesSquare } from 'lucide-react';
import TabNav, { TabNavItem } from '@/components/TabNav';

// Audio Generator (/teacher/audio-generator) is hidden from the tabs for now; the page itself still works.
// Pronunciation (/teacher) is hidden from the tabs for now; the page itself still works.
const tabs: TabNavItem[] = [
  { href: '/teacher/voice-chain', label: 'Voice Chain', icon: MessagesSquare },
  { href: '/teacher/courses', label: 'Courses', icon: BookOpen },
  { href: '/teacher/classes', label: 'Classes', icon: Users },
  { href: '/teacher/lesson-plans', label: 'Lesson Plans', icon: Sparkles },
  { href: '/teacher/feedback', label: 'Feedback', icon: MessageSquareText },
  { href: '/teacher/games', label: 'Games', icon: Gamepad2 },
]; // v2

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <TabNav tabs={tabs} />
      {children}
    </div>
  );
}
