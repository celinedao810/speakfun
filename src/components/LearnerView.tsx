"use client";

import React, { useState, useEffect } from 'react';
import { LearnerProgress, Assignment, PhonicSound, LearnerPreferences, InterviewQA, InterviewSession, DrillSession, ExerciseType, DiagnosticResult, LiveInterviewSession } from '@/lib/types';
import {
  Trophy, Zap, Play, CheckCircle2, AlertCircle, Award,
  ChevronRight, RotateCcw, Briefcase, Target, GraduationCap,
  Settings, UserSquare2, MessageSquare, Sparkles, Star, Lock, Clock, Brain
} from 'lucide-react';
import ExerciseView from '@/components/ExerciseView';
import SoundDrillView from '@/components/SoundDrillView';
import InterviewPrepView from '@/components/InterviewPrepView';
import PlacementTestView from '@/components/PlacementTestView';

interface LearnerViewProps {
  progress: LearnerProgress;
  onDayComplete: (assignmentId: string, score: number, scores: any) => void;
  onResetAssignment: (assignmentId: string) => void;
  onUpdatePreferences: (prefs: LearnerPreferences) => void;
  onPlacementComplete: (diagnostic: DiagnosticResult) => void;
  onSaveInterviewQA: (qa: InterviewQA) => void;
  onDeleteInterviewQA: (id: string) => void;
  onUpdateInterviewSession: (session: InterviewSession) => void;
  onDeleteInterviewSession: (id: string) => void;
  onSaveDrillSession: (session: DrillSession) => void;
  onSaveLiveSession: (session: LiveInterviewSession) => void;
}

const INDUSTRIES = [
  'General', 'Information Technology', 'Healthcare', 'Finance & Banking',
  'Education', 'Hospitality & Tourism', 'Engineering', 'Marketing & Sales',
  'Customer Support', 'Law', 'Human Resources'
];

const ROLES_BY_INDUSTRY: Record<string, string[]> = {
  'General': ['Student', 'Job Seeker', 'Office Administrator', 'Manager', 'Entrepreneur', 'Freelancer'],
  'Information Technology': ['Software Engineer', 'Product Manager', 'Product Owner', 'Scrum Master', 'Project Manager', 'Business Analyst', 'Data Scientist', 'Quality Assurance Engineer', 'Systems Administrator', 'UI/UX Designer'],
  'Healthcare': ['Doctor', 'Nurse', 'Pharmacist', 'Medical Researcher', 'Hospital Administrator', 'Therapist'],
  'Finance & Banking': ['Financial Analyst', 'Accountant', 'Investment Banker', 'Loan Officer', 'Wealth Manager', 'Auditor'],
  'Education': ['Teacher', 'University Professor', 'Academic Researcher', 'Education Consultant', 'Student Counselor', 'School Administrator'],
  'Hospitality & Tourism': ['Tour Guide', 'Hotel Manager', 'Flight Attendant', 'Restaurant Manager', 'Travel Agent', 'Event Planner'],
  'Engineering': ['Civil Engineer', 'Mechanical Engineer', 'Electrical Engineer', 'Architect', 'Chemical Engineer', 'Manufacturing Engineer'],
  'Marketing & Sales': ['Marketing Manager', 'Sales Representative', 'Digital Strategist', 'Content Creator', 'Public Relations Specialist', 'Brand Manager'],
  'Customer Support': ['Support Agent', 'Success Manager', 'Help Desk Technician', 'Client Coordinator', 'Call Center Operator'],
  'Law': ['Lawyer', 'Legal Assistant', 'Judge', 'Compliance Officer', 'Paralegal', 'Notary Public'],
  'Human Resources': ['HR Manager', 'Recruiter', 'Training Specialist', 'Employee Relations Lead', 'Benefits Coordinator']
};

const SUB_ROLES_MAP: Record<string, string[]> = {
  'Software Engineer': ['Front End Engineer', 'Back End Engineer', 'Full Stack Engineer', 'Mobile App Engineer', 'DevOps Engineer', 'Embedded Systems Engineer'],
  'Quality Assurance Engineer': ['Manual QA Engineer', 'Automation QA Engineer', 'SDET (Software Development Engineer in Test)', 'Performance Test Engineer'],
  'Product Manager': ['Technical Product Manager', 'Growth Product Manager', 'AI Product Manager', 'B2B Product Manager', 'Consumer Product Manager'],
  'Product Owner': ['Technical Product Owner', 'Business Product Owner', 'Proxy Product Owner'],
  'Scrum Master': ['Team Scrum Master', 'Agile Coach', 'Release Train Engineer (RTE)', 'Scrum Master (Scaling Focus)'],
  'Data Scientist': ['Data Engineer', 'Machine Learning Engineer', 'Data Analyst', 'AI Researcher'],
  'Marketing Manager': ['SEO Specialist', 'Content Marketing Manager', 'Social Media Manager', 'Performance Marketing Manager', 'Email Marketing Specialist'],
  'Sales Representative': ['Account Executive', 'Business Development Representative', 'Inside Sales Specialist', 'Enterprise Sales Manager']
};

const PURPOSES = [
  'Daily Communication', 'Business & Professional', 'Academic / IELTS / TOEFL',
  'Travel', 'Public Speaking', 'Moving Abroad'
];

const LEVELS: ('A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2')[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const LearnerView: React.FC<LearnerViewProps> = ({
  progress,
  onDayComplete,
  onResetAssignment,
  onUpdatePreferences,
  onPlacementComplete,
  onSaveInterviewQA,
  onDeleteInterviewQA,
  onUpdateInterviewSession,
  onDeleteInterviewSession,
  onSaveDrillSession,
  onSaveLiveSession
}) => {
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);
  const [showSummary, setShowSummary] = useState<{ assignmentId: string; score: number } | null>(null);
  const [isEditingPrefs, setIsEditingPrefs] = useState(!progress?.preferences);
  const [isTakingPlacementTest, setIsTakingPlacementTest] = useState(false);
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'INTERVIEW'>('DASHBOARD');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Sync preferences form visibility when preferences load from Supabase
  useEffect(() => {
    if (progress?.preferences) {
      setIsEditingPrefs(false);
    }
  }, [progress?.preferences]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const MASTERY_THRESHOLD = 85;

  const [prefForm, setPrefForm] = useState<LearnerPreferences>(progress?.preferences || {
    purpose: PURPOSES[0],
    industry: INDUSTRIES[0],
    role: ROLES_BY_INDUSTRY[INDUSTRIES[0]]?.[0] || '',
    level: 'B1'
  });

  const [mainRole, setMainRole] = useState<string>(
    progress?.preferences ?
    Object.keys(SUB_ROLES_MAP).find(k => SUB_ROLES_MAP[k].includes(progress.preferences!.role)) || progress.preferences.role :
    ROLES_BY_INDUSTRY[INDUSTRIES[0]]?.[0] || ''
  );

  const [subRole, setSubRole] = useState<string | null>(
    progress?.preferences && SUB_ROLES_MAP[mainRole] ? progress.preferences.role : null
  );

  const handleComplete = (score: number, detailed: any) => {
    if (activeAssignment) {
      onDayComplete(activeAssignment.id, score, detailed);
      setActiveAssignment(null);
      setShowSummary({ assignmentId: activeAssignment.id, score });
    }
  };

  const savePreferences = () => {
    if (!prefForm.role) return;
    onUpdatePreferences(prefForm);
    setIsEditingPrefs(false);
    // Placement test is now optional - user goes directly to main page
    // They can take the placement test later from the banner
  };

  const getLockTimeRemaining = (lockUntil?: string) => {
    if (!lockUntil) return null;
    const lockDate = new Date(lockUntil);
    const diff = lockDate.getTime() - currentTime.getTime();
    if (diff <= 0) return null;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  if (isEditingPrefs) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-card rounded-[3rem] border border-border shadow-2xl overflow-hidden">
          <div className="bg-primary p-8 text-primary-foreground text-center">
            <h2 className="text-3xl font-black mb-2">Personalize Your Practice</h2>
            <p className="text-primary-foreground/80 opacity-90">AI will tailor your vocabulary and stories to your goals.</p>
          </div>

          <div className="p-8 md:p-12 space-y-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-black text-muted-foreground uppercase tracking-widest">
                <GraduationCap className="w-4 h-4" /> CEFR Level
              </label>
              <div className="flex flex-wrap gap-3">
                {LEVELS.map(l => (
                  <button key={l} onClick={() => setPrefForm({ ...prefForm, level: l })} className={`w-14 h-14 flex items-center justify-center rounded-2xl text-lg font-black border-2 transition-all ${prefForm.level === l ? 'bg-primary border-primary text-primary-foreground shadow-lg' : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/40'}`}>{l}</button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-black text-muted-foreground uppercase tracking-widest">
                <Target className="w-4 h-4" /> Learning Purpose
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {PURPOSES.map(p => (
                  <button key={p} onClick={() => setPrefForm({ ...prefForm, purpose: p })} className={`px-4 py-3 rounded-2xl text-sm font-bold border-2 transition-all ${prefForm.purpose === p ? 'bg-primary/10 border-primary text-primary' : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/40'}`}>{p}</button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-black text-muted-foreground uppercase tracking-widest">
                <Briefcase className="w-4 h-4" /> Working Industry
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {INDUSTRIES.map(ind => (
                  <button key={ind} onClick={() => {
                    const firstRole = ROLES_BY_INDUSTRY[ind]?.[0] || '';
                    setPrefForm({ ...prefForm, industry: ind, role: firstRole });
                    setMainRole(firstRole);
                    setSubRole(null);
                  }} className={`px-4 py-3 rounded-2xl text-sm font-bold border-2 transition-all ${prefForm.industry === ind ? 'bg-primary/10 border-primary text-primary' : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/40'}`}>{ind}</button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-black text-muted-foreground uppercase tracking-widest">
                <UserSquare2 className="w-4 h-4" /> Role Category
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(ROLES_BY_INDUSTRY[prefForm.industry] || []).map(role => (
                  <button key={role} onClick={() => { setMainRole(role); if (SUB_ROLES_MAP[role]) { setSubRole(null); setPrefForm({ ...prefForm, role: '' }); } else { setSubRole(null); setPrefForm({ ...prefForm, role }); } }} className={`px-4 py-3 rounded-2xl text-xs font-bold border-2 transition-all ${mainRole === role ? 'bg-primary/10 border-primary text-primary shadow-sm' : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/40'}`}>{role}</button>
                ))}
              </div>
            </div>
            {SUB_ROLES_MAP[mainRole] && (
              <div className="space-y-4 p-6 bg-primary/5 rounded-[2rem] border-2 border-primary/20 animate-in slide-in-from-top-4 duration-500">
                <label className="flex items-center gap-2 text-xs font-black text-primary/70 uppercase tracking-widest">
                  <Sparkles className="w-4 h-4" /> Specifically, what is your role?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SUB_ROLES_MAP[mainRole].map(spec => (
                    <button key={spec} onClick={() => { setSubRole(spec); setPrefForm({ ...prefForm, role: spec }); }} className={`px-4 py-3 rounded-xl text-xs font-black transition-all border-2 ${subRole === spec ? 'bg-primary border-primary text-primary-foreground shadow-lg' : 'bg-card border-border text-muted-foreground hover:border-primary/40'}`}>{spec}</button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={savePreferences} disabled={!prefForm.role} className={`w-full font-black py-5 rounded-3xl text-xl transition-all shadow-xl active:scale-95 sticky bottom-0 ${prefForm.role ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground/40 cursor-not-allowed shadow-none'}`}>{SUB_ROLES_MAP[mainRole] && !subRole ? 'Please Select Specialization' : 'Finish Setup'}</button>
          </div>
        </div>
      </div>
    );
  }

  if (isTakingPlacementTest && progress?.preferences) {
    return (
      <PlacementTestView
        industry={progress.preferences.industry}
        role={progress.preferences.role}
        onComplete={(res) => {
          onPlacementComplete(res);
          setIsTakingPlacementTest(false);
        }}
      />
    );
  }

  if (activeAssignment) {
    // Use SoundDrillView for standard phonetic sounds (vowels, consonants, clusters)
    // Use ExerciseView for ending patterns and linking patterns (legacy flow)
    const isStandardPhonetic = ['VOWEL', 'CONSONANT', 'INITIAL_CLUSTER', 'FINAL_CLUSTER'].includes(activeAssignment.sound.type);

    return (
      <div className="space-y-6">
        <button onClick={() => setActiveAssignment(null)} className="flex items-center gap-2 text-muted-foreground font-medium hover:text-foreground transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to Dashboard
        </button>
        {isStandardPhonetic ? (
          <SoundDrillView
            sound={activeAssignment.sound}
            preferences={progress.preferences}
            onComplete={handleComplete}
          />
        ) : (
          <ExerciseView
            sound={activeAssignment.sound}
            day={activeAssignment.records.length + 1}
            preferences={progress.preferences}
            onComplete={handleComplete}
          />
        )}
      </div>
    );
  }

  if (activeTab === 'INTERVIEW') {
    return (
      <InterviewPrepView
        progress={progress}
        onSaveQA={onSaveInterviewQA}
        onDeleteQA={onDeleteInterviewQA}
        onUpdateSession={onUpdateInterviewSession}
        onDeleteSession={onDeleteInterviewSession}
        onSaveDrillSession={onSaveDrillSession}
        onSaveLiveSession={onSaveLiveSession}
        onBackToDashboard={() => setActiveTab('DASHBOARD')}
      />
    );
  }

  return (
    <div className="space-y-8">
      {showSummary && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-3xl p-8 max-w-md w-full text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${showSummary.score >= MASTERY_THRESHOLD ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
              {showSummary.score >= MASTERY_THRESHOLD ? <Trophy className="w-12 h-12" /> : <AlertCircle className="w-12 h-12" />}
            </div>
            <h2 className="text-3xl font-black text-foreground mb-2">{showSummary.score >= MASTERY_THRESHOLD ? 'Mastery Achieved!' : 'Keep Practicing!'}</h2>
            <p className="text-muted-foreground mb-6">You&apos;ve scored <span className="font-bold text-primary">{Math.round(showSummary.score)}%</span> on this drill. {showSummary.score >= MASTERY_THRESHOLD ? ' Excellent work!' : ' You need at least 85% to pass. Exercise will be available in 24 hours.'}</p>
            <button onClick={() => setShowSummary(null)} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl hover:bg-primary/90 transition-all shadow-lg">Back to Dashboard</button>
          </div>
        </div>
      )}

      {/* Diagnostic Call-to-action (Optional) */}
      {!progress?.placementTestDone && progress?.preferences && (
        <div className="bg-gradient-to-r from-primary to-chart-4 p-8 rounded-[2.5rem] shadow-xl text-primary-foreground flex flex-col md:flex-row items-center justify-between gap-6 group">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-primary-foreground/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
              <Brain className="w-8 h-8 text-primary-foreground animate-pulse" />
            </div>
            <div>
              <h3 className="text-2xl font-black">Làm bài kiểm tra trình độ <span className="text-sm font-medium bg-primary-foreground/20 px-2 py-1 rounded-lg ml-2">Khuyến nghị</span></h3>
              <p className="text-primary-foreground/80 font-medium">AI sẽ chẩn đoán phát âm của bạn để giao bài tập phù hợp nhất.</p>
            </div>
          </div>
          <button
            onClick={() => setIsTakingPlacementTest(true)}
            className="px-10 py-4 bg-primary-foreground text-primary font-black rounded-2xl shadow-lg hover:scale-105 transition-all flex items-center gap-2"
          >
            Bắt đầu Kiểm tra <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 bg-gradient-to-br from-primary to-primary/70 p-8 rounded-3xl text-primary-foreground shadow-xl relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-6">
              <div><p className="text-primary-foreground/70 text-sm font-bold uppercase tracking-widest">Active Streak</p><h2 className="text-5xl font-black">3 Days</h2></div>
              <Zap className="w-12 h-12 text-primary-foreground/60 fill-primary-foreground/60" />
            </div>
            <div className="space-y-1 mb-6">
              <p className="text-primary-foreground/80 leading-relaxed text-sm">Goal: <span className="font-black text-primary-foreground">{progress?.preferences?.purpose}</span></p>
              <p className="text-primary-foreground/80 leading-relaxed text-sm">Role: <span className="font-black text-primary-foreground">{progress?.preferences?.role}</span></p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsEditingPrefs(true)} className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"><Settings className="w-3.5 h-3.5" /> Settings</button>
              <button onClick={() => setActiveTab('INTERVIEW')} className="flex items-center gap-2 px-4 py-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest transition-colors"><MessageSquare className="w-3.5 h-3.5" /> Interview Prep</button>
            </div>
          </div>
        </div>
        <div className="md:w-1/3 bg-card p-6 rounded-3xl border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-4"><div className="p-2 bg-primary/15 text-primary rounded-lg"><Award className="w-6 h-6" /></div><h3 className="font-bold text-foreground">Mastery Board</h3></div>
          <div className="flex flex-wrap gap-3">
             {(progress?.achievements || []).length === 0 ? <p className="text-muted-foreground/60 text-sm">No badges yet.</p> : progress.achievements.map(a => <div key={a.id} className="w-12 h-12 bg-primary/15 text-primary rounded-full flex items-center justify-center font-bold border-2 border-primary/20">{a.soundSymbol}</div>)}
          </div>
          <button className="text-primary font-bold text-sm hover:underline mt-4 self-start">View full achievements →</button>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-2xl font-black text-foreground px-2 flex items-center gap-3"><Play className="w-6 h-6 text-primary fill-primary" /> Phonetic Assignments</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(progress?.assignments || []).length === 0 ? (
            <div className="col-span-full py-16 bg-muted/50 border-2 border-dashed border-border rounded-3xl text-center">
              <p className="text-muted-foreground font-medium">Chưa có bài tập nào được giao. Hãy hoàn thành bài kiểm tra trình độ!</p>
            </div>
          ) : (
            progress.assignments.map(assignment => {
              const bestScore = assignment.records.length > 0 ? Math.max(...assignment.records.map(r => r.score)) : 0;
              const isLocked = !!getLockTimeRemaining(assignment.lockUntil);
              const isCompleted = assignment.status === 'COMPLETED';
              return (
                <div key={assignment.id} className={`group bg-card p-6 rounded-3xl border border-border shadow-sm hover:shadow-xl transition-all flex flex-col h-full ${isLocked ? 'grayscale opacity-70' : ''}`}>
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex flex-col">
                      <span className="text-4xl font-black mb-1 text-primary">{assignment.sound.symbol}</span>
                      <span className="text-sm font-bold text-muted-foreground uppercase">{assignment.sound.description}</span>
                    </div>
                  </div>
                  <div className="space-y-4 mb-8">
                    <div className="flex justify-between text-sm font-bold text-foreground"><span>Progress</span><span>{bestScore}% / 85%</span></div>
                    <div className="h-3 w-full bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.min((bestScore / 85) * 100, 100)}%` }} /></div>
                  </div>
                  <button onClick={() => !isLocked && !isCompleted && setActiveAssignment(assignment)} className={`w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all ${isCompleted ? 'bg-emerald-50 text-emerald-600' : isLocked ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : isLocked ? <Lock className="w-5 h-5" /> : <Play className="w-5 h-5 fill-primary-foreground" />}
                    {isCompleted ? 'Mastered' : isLocked ? `Locked: ${getLockTimeRemaining(assignment.lockUntil)}` : 'Practice'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default LearnerView;
