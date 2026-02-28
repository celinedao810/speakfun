"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LearnerProgress, Assignment, PhonicSound, DailyRecord, LearnerPreferences, InterviewQA, InterviewSession, DrillSession, ExerciseType, DiagnosticResult, LiveInterviewSession } from '@/lib/types';
import { APP_STORAGE_KEY, PHONETIC_SOUNDS } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchAssignments, insertAssignment, insertAssignments, updateAssignment, insertRecord, resetAssignment as resetAssignmentDB } from '@/lib/supabase/queries/assignments';
import { fetchAchievements, insertAchievement } from '@/lib/supabase/queries/achievements';
import { fetchInterviewQA, insertInterviewQA, deleteInterviewQA as deleteInterviewQADB, fetchInterviewSessions, upsertInterviewSession, deleteInterviewSession as deleteInterviewSessionDB, fetchDrillSessions, insertDrillSession, fetchLiveInterviewSessions, insertLiveInterviewSession } from '@/lib/supabase/queries/interview';
import { updatePreferences, setPlacementTestDone } from '@/lib/supabase/queries/profiles';
import { migrateLocalStorageToSupabase } from '@/lib/supabase/migration';

const INITIAL_PROGRESS: LearnerProgress = {
  id: 'learner-1',
  name: 'User',
  assignments: [],
  achievements: [],
  interviewPrep: [],
  interviewSessions: [],
  drillSessions: [],
  liveInterviewHistory: [],
};

interface AppContextType {
  progress: LearnerProgress;
  handleUpdatePreferences: (prefs: LearnerPreferences) => void;
  handleAssign: (sound: PhonicSound, duration: number, type: ExerciseType) => void;
  handlePlacementComplete: (diagnostic: DiagnosticResult) => void;
  handleDayComplete: (assignmentId: string, score: number, detailed: any) => void;
  handleResetAssignment: (assignmentId: string) => void;
  handleSaveInterviewQA: (qa: InterviewQA) => void;
  handleDeleteInterviewQA: (id: string) => void;
  handleUpdateInterviewSession: (session: InterviewSession) => void;
  handleDeleteInterviewSession: (id: string) => void;
  handleSaveDrillSession: (session: DrillSession) => void;
  handleSaveLiveSession: (session: LiveInterviewSession) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const [progress, setProgress] = useState<LearnerProgress>(INITIAL_PROGRESS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load data from Supabase on mount (or migrate from localStorage)
  // Wait for auth to fully resolve (user + profile) before loading
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setProgress(INITIAL_PROGRESS);
      setIsLoaded(true);
      return;
    }

    let cancelled = false;
    setIsLoaded(false);
    const userName = profile?.full_name || 'User';

    const loadData = async () => {
      try {
        const [assignments, achievements, interviewPrep, interviewSessions, drillSessions, liveHistory] = await Promise.all([
          fetchAssignments(supabase, user.id),
          fetchAchievements(supabase, user.id),
          fetchInterviewQA(supabase, user.id),
          fetchInterviewSessions(supabase, user.id),
          fetchDrillSessions(supabase, user.id),
          fetchLiveInterviewSessions(supabase, user.id),
        ]);

        if (cancelled) return;

        const hasSupabaseData = assignments.length > 0 || achievements.length > 0 ||
          interviewPrep.length > 0 || interviewSessions.length > 0 ||
          drillSessions.length > 0 || liveHistory.length > 0;

        // If no Supabase data, check localStorage for migration
        if (!hasSupabaseData) {
          const migrationMarker = localStorage.getItem(`speakfun_supabase_migrated_${user.id}`);
          if (!migrationMarker) {
            const userKey = `${APP_STORAGE_KEY}_${user.id}`;
            let saved = localStorage.getItem(userKey);
            let sourceKey = userKey;

            if (!saved || saved === 'null' || saved === 'undefined') {
              saved = localStorage.getItem(APP_STORAGE_KEY);
              sourceKey = APP_STORAGE_KEY;
            }

            if (saved && saved !== 'null' && saved !== 'undefined') {
              try {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                  const localData: LearnerProgress = {
                    ...INITIAL_PROGRESS,
                    ...parsed,
                    id: user.id,
                    name: userName || parsed.name || 'User',
                    assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [],
                    achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
                    interviewPrep: Array.isArray(parsed.interviewPrep) ? parsed.interviewPrep : [],
                    interviewSessions: Array.isArray(parsed.interviewSessions) ? parsed.interviewSessions : [],
                    drillSessions: Array.isArray(parsed.drillSessions) ? parsed.drillSessions : [],
                    liveInterviewHistory: Array.isArray(parsed.liveInterviewHistory) ? parsed.liveInterviewHistory : [],
                  };

                  const result = await migrateLocalStorageToSupabase(supabase, user.id, localData);
                  if (cancelled) return;

                  if (result.success) {
                    localStorage.setItem(`speakfun_supabase_migrated_${user.id}`, 'true');
                    localStorage.removeItem(sourceKey);

                    const [a2, ach2, iq2, is2, ds2, lh2] = await Promise.all([
                      fetchAssignments(supabase, user.id),
                      fetchAchievements(supabase, user.id),
                      fetchInterviewQA(supabase, user.id),
                      fetchInterviewSessions(supabase, user.id),
                      fetchDrillSessions(supabase, user.id),
                      fetchLiveInterviewSessions(supabase, user.id),
                    ]);

                    if (cancelled) return;

                    setProgress({
                      id: user.id,
                      name: userName,
                      preferences: profile?.preferences || undefined,
                      placementTestDone: profile?.placement_test_done || false,
                      assignments: a2,
                      achievements: ach2,
                      interviewPrep: iq2,
                      interviewSessions: is2,
                      drillSessions: ds2,
                      liveInterviewHistory: lh2,
                    });
                    setIsLoaded(true);
                    return;
                  }
                }
              } catch (e) {
                console.error('Migration parse error:', e);
              }
            }
          }
        }

        if (cancelled) return;

        setProgress({
          id: user.id,
          name: userName,
          preferences: profile?.preferences || undefined,
          placementTestDone: profile?.placement_test_done || false,
          assignments,
          achievements,
          interviewPrep,
          interviewSessions,
          drillSessions,
          liveInterviewHistory: liveHistory,
        });
      } catch (error) {
        console.error('Failed to load data from Supabase:', error);
        if (cancelled) return;
        setProgress({
          ...INITIAL_PROGRESS,
          id: user.id,
          name: userName,
        });
      }
      setIsLoaded(true);
    };

    loadData();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  // --- Helper ---

  const createAssignment = (sound: PhonicSound, type: ExerciseType): Assignment => ({
    id: Math.random().toString(36).substr(2, 9),
    sound,
    learnerId: progress.id,
    durationDays: 1,
    startDate: new Date().toISOString(),
    currentDay: 1,
    records: [],
    status: 'ACTIVE',
    lastActivityDate: null,
    type
  });

  // --- Handlers (optimistic state update + fire-and-forget Supabase write) ---

  const handleUpdatePreferences = (prefs: LearnerPreferences) => {
    if (!user) return;
    setProgress(prev => ({ ...prev, preferences: prefs }));

    updatePreferences(supabase, user.id, prefs)
      .then(() => refreshProfile())
      .catch(err => console.error('Failed to save preferences:', err));
  };

  const handleAssign = (sound: PhonicSound, _duration: number, type: ExerciseType) => {
    const newAssignment = createAssignment(sound, type);
    setProgress(prev => ({
      ...prev,
      assignments: [newAssignment, ...prev.assignments]
    }));

    insertAssignment(supabase, newAssignment, user?.id || progress.id)
      .catch(err => console.error('Failed to save assignment:', err));
  };

  const handlePlacementComplete = (diagnostic: DiagnosticResult) => {
    if (!diagnostic) return;

    const newAssignments: Assignment[] = [];

    // Build assignments from diagnostic (need current state to check for duplicates)
    setProgress(prev => {
      if (diagnostic.needsLinking) {
        const linkingSound = PHONETIC_SOUNDS.find(s => s.id === 'ls1');
        if (linkingSound && !prev.assignments.find(a => a.sound.id === 'ls1')) {
          newAssignments.push(createAssignment(linkingSound, 'LINKING_SOUNDS'));
        }
      }

      if (Array.isArray(diagnostic.needsEndingSounds)) {
        diagnostic.needsEndingSounds.forEach(soundChar => {
          let soundId = '';
          if (['s', 'z'].includes(soundChar)) soundId = 'ep1';
          else if (['t', 'd'].includes(soundChar)) soundId = 'ep3';

          if (soundId) {
            const soundObj = PHONETIC_SOUNDS.find(s => s.id === soundId);
            if (soundObj && !prev.assignments.find(a => a.sound.id === soundId)) {
              newAssignments.push(createAssignment(soundObj, 'ENDING_SOUNDS'));
            }
          }
        });
      }

      if (Array.isArray(diagnostic.needsPhonemes)) {
        diagnostic.needsPhonemes.forEach(symbol => {
          const phonic = PHONETIC_SOUNDS.find(s =>
            s.symbol === symbol ||
            s.id === symbol ||
            s.id === `icl-${symbol}` ||
            s.id === `fcl-${symbol}` ||
            s.description.toLowerCase().includes(`/${symbol}/`)
          );

          if (phonic && !prev.assignments.find(a => a.sound.id === phonic.id)) {
            const type: ExerciseType = (phonic.type === 'ENDING_PATTERN') ? 'ENDING_SOUNDS' :
                                       (phonic.type === 'LINKING_PATTERN') ? 'LINKING_SOUNDS' : 'PHONETIC_DAY';
            newAssignments.push(createAssignment(phonic, type));
          }
        });
      }

      return {
        ...prev,
        placementTestDone: true,
        assignments: [...newAssignments, ...prev.assignments]
      };
    });

    // Fire-and-forget Supabase writes
    const uid = user?.id || progress.id;
    Promise.all([
      setPlacementTestDone(supabase, uid),
      newAssignments.length > 0 ? insertAssignments(supabase, newAssignments, uid) : Promise.resolve(),
    ])
      .then(() => refreshProfile())
      .catch(err => console.error('Failed to save placement result:', err));
  };

  const handleDayComplete = (assignmentId: string, score: number, detailed: any) => {
    const MASTERY_THRESHOLD = 85;
    const LOCK_DURATION_MS = 24 * 60 * 60 * 1000;

    let newRecord: DailyRecord | null = null;
    let newStatus: 'ACTIVE' | 'COMPLETED' = 'ACTIVE';
    let newLockUntil: string | null = null;
    let newAchievement: { id: string; soundSymbol: string; dateEarned: string } | null = null;

    setProgress(prev => {
      const assignments = prev.assignments.map(a => {
        if (a.id !== assignmentId) return a;
        const isPassed = score >= MASTERY_THRESHOLD;
        const now = new Date();
        newRecord = {
          dayNumber: a.records.length + 1,
          date: now.toISOString(),
          score,
          completed: isPassed,
          exerciseScores: detailed
        };
        const updatedRecords = [...a.records, newRecord];
        let status = a.status;
        let lockUntil = a.lockUntil;
        if (isPassed) {
          status = 'COMPLETED' as const;
          newStatus = 'COMPLETED';
          lockUntil = undefined;
        } else {
          status = 'ACTIVE' as const;
          newStatus = 'ACTIVE';
          lockUntil = new Date(now.getTime() + LOCK_DURATION_MS).toISOString();
          newLockUntil = lockUntil;
        }
        return { ...a, records: updatedRecords, status, lockUntil, lastActivityDate: now.toISOString() };
      });

      const completedAssignment = assignments.find(a => a.id === assignmentId && a.status === 'COMPLETED');
      let achievements = prev.achievements;
      if (completedAssignment && !prev.achievements.find(acc => acc.soundSymbol === completedAssignment.sound.symbol)) {
        newAchievement = {
          id: Math.random().toString(36).substr(2, 9),
          soundSymbol: completedAssignment.sound.symbol,
          dateEarned: new Date().toISOString()
        };
        achievements = [...prev.achievements, newAchievement];
      }
      return { ...prev, assignments, achievements };
    });

    // Fire-and-forget Supabase writes
    const writes: Promise<void>[] = [];

    if (newRecord) {
      writes.push(insertRecord(supabase, newRecord, assignmentId));
    }
    writes.push(updateAssignment(supabase, assignmentId, {
      status: newStatus,
      lock_until: newLockUntil,
      last_activity: new Date().toISOString(),
    }));
    if (newAchievement) {
      writes.push(insertAchievement(supabase, newAchievement, user?.id || progress.id));
    }

    Promise.all(writes).catch(err => console.error('Failed to save day completion:', err));
  };

  const handleResetAssignment = (assignmentId: string) => {
    setProgress(prev => ({
      ...prev,
      assignments: prev.assignments.map(a => {
        if (a.id !== assignmentId) return a;
        return { ...a, currentDay: 1, status: 'ACTIVE' as const, lastActivityDate: null, lockUntil: undefined, records: [] };
      })
    }));

    resetAssignmentDB(supabase, assignmentId)
      .catch(err => console.error('Failed to reset assignment:', err));
  };

  const handleSaveInterviewQA = (qa: InterviewQA) => {
    setProgress(prev => ({ ...prev, interviewPrep: [qa, ...prev.interviewPrep] }));

    insertInterviewQA(supabase, qa, user?.id || progress.id)
      .catch(err => console.error('Failed to save interview QA:', err));
  };

  const handleDeleteInterviewQA = (id: string) => {
    setProgress(prev => ({ ...prev, interviewPrep: prev.interviewPrep.filter(qa => qa.id !== id) }));

    deleteInterviewQADB(supabase, id)
      .catch(err => console.error('Failed to delete interview QA:', err));
  };

  const handleUpdateInterviewSession = (session: InterviewSession) => {
    setProgress(prev => {
      const exists = prev.interviewSessions.find(s => s.id === session.id);
      const updatedSessions = exists ? prev.interviewSessions.map(s => s.id === session.id ? session : s) : [session, ...prev.interviewSessions];
      return { ...prev, interviewSessions: updatedSessions };
    });

    upsertInterviewSession(supabase, session, user?.id || progress.id)
      .catch(err => console.error('Failed to save interview session:', err));
  };

  const handleDeleteInterviewSession = (id: string) => {
    setProgress(prev => ({ ...prev, interviewSessions: prev.interviewSessions.filter(s => s.id !== id) }));

    deleteInterviewSessionDB(supabase, id)
      .catch(err => console.error('Failed to delete interview session:', err));
  };

  const handleSaveDrillSession = (session: DrillSession) => {
    setProgress(prev => ({ ...prev, drillSessions: [session, ...prev.drillSessions] }));

    insertDrillSession(supabase, session, user?.id || progress.id)
      .catch(err => console.error('Failed to save drill session:', err));
  };

  const handleSaveLiveSession = (session: LiveInterviewSession) => {
    setProgress(prev => ({ ...prev, liveInterviewHistory: [session, ...prev.liveInterviewHistory] }));

    insertLiveInterviewSession(supabase, session, user?.id || progress.id)
      .catch(err => console.error('Failed to save live session:', err));
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{
      progress,
      handleUpdatePreferences,
      handleAssign,
      handlePlacementComplete,
      handleDayComplete,
      handleResetAssignment,
      handleSaveInterviewQA,
      handleDeleteInterviewQA,
      handleUpdateInterviewSession,
      handleDeleteInterviewSession,
      handleSaveDrillSession,
      handleSaveLiveSession,
    }}>
      {children}
    </AppContext.Provider>
  );
};
