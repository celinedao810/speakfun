"use client";

import React from 'react';
import { ClassEnrollment } from '@/lib/types';
import { UserMinus, User } from 'lucide-react';

interface EnrollmentListProps {
  enrollments: ClassEnrollment[];
  onRemove: (enrollmentId: string) => void;
}

export default function EnrollmentList({ enrollments, onRemove }: EnrollmentListProps) {
  if (enrollments.length === 0) {
    return (
      <div className="text-center py-8 bg-muted/50 rounded-lg border border-dashed border-border">
        <User className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Share the class code so students can join.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {enrollments.map((enrollment) => (
        <div
          key={enrollment.id}
          className="flex items-center justify-between bg-card rounded-lg border border-border px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <div className="bg-muted p-1.5 rounded-full">
              <User className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{enrollment.learner_name}</p>
              <p className="text-xs text-muted-foreground/60">
                Joined {new Date(enrollment.enrolled_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button
            onClick={() => onRemove(enrollment.id)}
            className="text-muted-foreground/60 hover:text-destructive transition p-1"
            title="Remove student"
          >
            <UserMinus className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
