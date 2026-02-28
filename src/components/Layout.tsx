"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { BookOpen, UserCircle, LogOut, ChevronDown } from 'lucide-react';
import { usePathname } from 'next/navigation';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, profile, loading, signOut } = useAuth();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Hide layout on auth pages
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isAuthPage || loading) {
    return <>{children}</>;
  }

  if (!user) {
    return <>{children}</>;
  }

  const userName = profile?.full_name || user.email || 'User';
  const userRole = profile?.role;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="bg-primary p-2 rounded-lg">
                <BookOpen className="text-primary-foreground w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">SpeakFun</h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-3 hover:bg-muted/50 rounded-lg px-3 py-2 transition"
                >
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-foreground">{userName}</p>
                    {userRole && <p className="text-xs text-muted-foreground capitalize">{userRole.toLowerCase()}</p>}
                  </div>
                  <div className="bg-primary/15 p-2 rounded-full">
                    <UserCircle className="w-6 h-6 text-primary" />
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-card rounded-xl shadow-lg border border-border py-2 z-50">
                    <div className="px-4 py-2 border-b border-border">
                      <p className="text-sm font-medium text-foreground">{userName}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                      {userRole && (
                        <span className="inline-block mt-1 text-xs font-medium bg-primary/15 text-primary px-2 py-0.5 rounded-full capitalize">
                          {userRole.toLowerCase()}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setDropdownOpen(false);
                        await signOut();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>

      <footer className="bg-card border-t border-border py-6">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-muted-foreground text-sm">© 2024 SpeakFun. AI-Powered Pronunciation Coach.</p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
