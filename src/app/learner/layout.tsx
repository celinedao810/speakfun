"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, BookMarked } from 'lucide-react';

const tabs = [
  { href: '/learner/classes', label: 'My Classes', icon: BookOpen },
  { href: '/learner/notebook', label: 'Notebook', icon: BookMarked },
];

export default function LearnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (tab: typeof tabs[0]) => {
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
