"use client";

import React, { useState } from 'react';

interface ClassFormProps {
  onSubmit: (name: string, description: string) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

export default function ClassForm({ onSubmit, onCancel, submitLabel = 'Create Class' }: ClassFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    await onSubmit(name.trim(), description.trim());
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-xl border border-border p-5">
      <div className="mb-4">
        <label className="block text-sm font-medium text-foreground mb-1">Class Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., English B2 - Morning Group"
          className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-input outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          autoFocus
          required
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description..."
          className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-input outline-none focus:ring-2 focus:ring-ring focus:border-ring resize-none"
          rows={2}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Creating...' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-muted-foreground hover:text-foreground transition text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
