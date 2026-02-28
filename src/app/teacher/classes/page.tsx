"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchClasses, insertClass, deleteClass } from '@/lib/supabase/queries/classes';
import { Class } from '@/lib/types';
import ClassForm from '@/components/teacher/ClassForm';
import { Plus, Users, Trash2, Copy, Check } from 'lucide-react';
import Link from 'next/link';

export default function ClassesPage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    if (!user) return;
    const data = await fetchClasses(supabase, user.id);
    setClasses(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const handleCreate = async (name: string, description: string) => {
    if (!user) return;
    setError(null);
    const result = await insertClass(supabase, user.id, name, description);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setClasses(prev => [result.data!, ...prev]);
      setShowForm(false);
    }
  };

  const handleDelete = async (classId: string) => {
    if (!confirm('Delete this class? All enrollments and course assignments will be removed.')) return;
    setDeleting(classId);
    const ok = await deleteClass(supabase, classId);
    if (ok) {
      setClasses(prev => prev.filter(c => c.id !== classId));
    }
    setDeleting(null);
  };

  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-foreground">My Classes</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Class
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-destructive/10 text-destructive text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {showForm && (
        <div className="mb-6">
          <ClassForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {classes.length === 0 && !showForm ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No classes yet. Create a class to organize your learners.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => (
            <div
              key={cls.id}
              className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition group"
            >
              <Link href={`/teacher/classes/${cls.id}`} className="block">
                <div className="flex items-start justify-between mb-3">
                  <div className="bg-emerald-100 p-2 rounded-lg">
                    <Users className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="text-xs text-muted-foreground/60">
                    {cls.student_count} students
                  </div>
                </div>
                <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition">
                  {cls.name}
                </h3>
                {cls.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{cls.description}</p>
                )}
              </Link>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleCopyCode(cls.class_code);
                  }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition font-mono bg-muted/50 px-2 py-1 rounded"
                  title="Copy class code"
                >
                  {copiedCode === cls.class_code ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {cls.class_code}
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(cls.id);
                  }}
                  disabled={deleting === cls.id}
                  className="text-muted-foreground/60 hover:text-destructive transition p-1"
                  title="Delete class"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
