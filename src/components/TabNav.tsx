"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

export interface TabNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only active on this exact path (not its sub-pages). */
  exact?: boolean;
}

/**
 * Section tabs under the header. On narrow screens the row scrolls sideways
 * (edge to edge, no visible scrollbar) and the active tab is kept in view.
 */
export default function TabNav({ tabs }: { tabs: TabNavItem[] }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  // True while there are more tabs off-screen to the right (shows a fade hint)
  const [moreRight, setMoreRight] = useState(false);

  const isActive = (tab: TabNavItem) => (tab.exact ? pathname === tab.href : pathname.startsWith(tab.href));

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => setMoreRight(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4);
    update();
    nav.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      nav.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div className="relative mb-6">
      <nav ref={navRef} className="flex gap-1 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              ref={active ? activeRef : undefined}
              className={`flex shrink-0 items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
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
      {moreRight && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 -right-4 sm:right-0 w-12 bg-gradient-to-l from-background to-transparent" />
      )}
    </div>
  );
}
