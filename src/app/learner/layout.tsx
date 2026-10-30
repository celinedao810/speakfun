"use client";

import React from 'react';
import { BookOpen, BookMarked, Gamepad2, MessagesSquare } from 'lucide-react';
import TabNav, { TabNavItem } from '@/components/TabNav';

const tabs: TabNavItem[] = [
  { href: '/learner/classes', label: 'My Classes', icon: BookOpen },
  { href: '/learner/voice-chain', label: 'Voice Chain', icon: MessagesSquare },
  { href: '/learner/notebook', label: 'Notebook', icon: BookMarked },
  { href: '/learner/games', label: 'Games', icon: Gamepad2 },
];

export default function LearnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <TabNav tabs={tabs} />
      {children}
    </div>
  );
}
