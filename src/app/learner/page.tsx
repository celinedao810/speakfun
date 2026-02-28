"use client";

import { useAppContext } from '@/context/AppContext';
import LearnerView from '@/components/LearnerView';

export default function LearnerPracticePage() {
  const {
    progress,
    handleDayComplete,
    handleResetAssignment,
    handleUpdatePreferences,
    handlePlacementComplete,
    handleSaveInterviewQA,
    handleDeleteInterviewQA,
    handleUpdateInterviewSession,
    handleDeleteInterviewSession,
    handleSaveDrillSession,
    handleSaveLiveSession,
  } = useAppContext();

  return (
    <LearnerView
      progress={progress}
      onDayComplete={handleDayComplete}
      onResetAssignment={handleResetAssignment}
      onUpdatePreferences={handleUpdatePreferences}
      onPlacementComplete={handlePlacementComplete}
      onSaveInterviewQA={handleSaveInterviewQA}
      onDeleteInterviewQA={handleDeleteInterviewQA}
      onUpdateInterviewSession={handleUpdateInterviewSession}
      onDeleteInterviewSession={handleDeleteInterviewSession}
      onSaveDrillSession={handleSaveDrillSession}
      onSaveLiveSession={handleSaveLiveSession}
    />
  );
}
