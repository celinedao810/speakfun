"use client";

import { useState, useEffect } from 'react';
import { PhonicSound, Class, ClassEnrollment } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchClasses, fetchEnrollments } from '@/lib/supabase/queries/classes';
import { X, Users, Check, Loader2 } from 'lucide-react';

interface AssignLearnerModalProps {
  sound: PhonicSound;
  onClose: () => void;
  onSuccess: (learnerName: string) => void;
}

export default function AssignLearnerModal({ sound, onClose, onSuccess }: AssignLearnerModalProps) {
  const { user } = useAuth();

  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [learners, setLearners] = useState<ClassEnrollment[]>([]);
  const [selectedLearnerId, setSelectedLearnerId] = useState<string>('');
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingLearners, setLoadingLearners] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load teacher's classes on mount
  useEffect(() => {
    if (!user) return;
    fetchClasses(supabase, user.id).then(data => {
      setClasses(data);
      if (data.length === 1) setSelectedClassId(data[0].id);
    }).finally(() => setLoadingClasses(false));
  }, [user]);

  // Load learners when class changes
  useEffect(() => {
    if (!selectedClassId) { setLearners([]); return; }
    setLoadingLearners(true);
    setSelectedLearnerId('');
    fetchEnrollments(supabase, selectedClassId)
      .then(setLearners)
      .finally(() => setLoadingLearners(false));
  }, [selectedClassId]);

  const soundLabel =
    sound.type === 'INITIAL_CLUSTER' ? `${sound.symbol}-` :
    sound.type === 'FINAL_CLUSTER'   ? `-${sound.symbol}` :
    `/${sound.symbol}/`;

  const handleConfirm = async () => {
    if (!selectedLearnerId) return;
    setAssigning(true);
    setError(null);
    try {
      const res = await fetch('/api/phoneme/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soundId: sound.id, learnerId: selectedLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Assignment failed');
      const learner = learners.find(l => l.learner_id === selectedLearnerId);
      onSuccess(learner?.learner_name ?? 'Learner');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-3xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Assign to Learner</p>
            <h2 className="text-2xl font-black text-foreground">{soundLabel}</h2>
            <p className="text-xs text-muted-foreground">{sound.description.split(' (')[0]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Class selector */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-2">Class</label>
            {loadingClasses ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading classes…
              </div>
            ) : classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have no classes yet.</p>
            ) : (
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-input text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select a class…</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Learner list */}
          {selectedClassId && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-2">Learner</label>
              {loadingLearners ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading learners…
                </div>
              ) : learners.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center bg-muted/50 rounded-2xl">
                  <Users className="w-8 h-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No learners enrolled in this class.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {learners.map(l => {
                    const selected = selectedLearnerId === l.learner_id;
                    return (
                      <button
                        key={l.learner_id}
                        onClick={() => setSelectedLearnerId(l.learner_id)}
                        className={[
                          'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left transition-all',
                          selected
                            ? 'border-primary bg-primary/10 text-primary font-semibold'
                            : 'border-border bg-card hover:border-primary/40 text-foreground',
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            {l.learner_name?.charAt(0).toUpperCase() ?? '?'}
                          </div>
                          <span className="text-sm">{l.learner_name}</span>
                        </div>
                        {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedLearnerId || assigning}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {assigning ? <><Loader2 className="w-4 h-4 animate-spin" /> Assigning…</> : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}
