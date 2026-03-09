"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mic, BookOpen, Users, Sparkles, MessageSquareText } from 'lucide-react';

const tabs = [
  { href: '/teacher', label: 'Pronunciation', icon: Mic, exact: true },
  { href: '/teacher/courses', label: 'Courses', icon: BookOpen },
  { href: '/teacher/classes', label: 'Classes', icon: Users },
  { href: '/teacher/lesson-plans', label: 'Lesson Plans', icon: Sparkles },
  { href: '/teacher/feedback', label: 'Feedback', icon: MessageSquareText },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (tab: typeof tabs[0]) => {
    if (tab.exact) return pathname === tab.href;
    return pathname.startsWith(tab.href);
  };

  return (
    <div>
      <nav className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
