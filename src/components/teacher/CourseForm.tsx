"use client";

import React, { useState } from 'react';
import { X } from 'lucide-react';

interface CourseFormProps {
  initialName?: string;
  initialDescription?: string;
  onSubmit: (name: string, description: string) => void;
  onCancel: () => void;
  submitLabel?: string;
}

const CourseForm: React.FC<CourseFormProps> = ({
  initialName = '',
  initialDescription = '',
  onSubmit,
  onCancel,
  submitLabel = 'Create Course',
}) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    await onSubmit(name.trim(), description.trim());
    setSubmitting(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card rounded-xl border border-border p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">New Course</h3>
        <button type="button" onClick={onCancel} className="text-muted-foreground/60 hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Course Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg bg-input outline-none focus:ring-2 focus:ring-ring focus:border-ring text-sm text-foreground"
            placeholder="e.g., Business English Pronunciation"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Description <span className="text-muted-foreground/60 font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg bg-input outline-none focus:ring-2 focus:ring-ring focus:border-ring text-sm resize-none text-foreground"
            rows={2}
            placeholder="Brief description of this course"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || submitting}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
        >
          {submitting ? 'Creating...' : submitLabel}
        </button>
      </div>
    </form>
  );
};

export default CourseForm;
