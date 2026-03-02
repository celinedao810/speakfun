"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { PHONETIC_SOUNDS } from '@/lib/constants';
import { PhonicSound, LearnerProgress, ExerciseType, Assignment } from '@/lib/types';
import { Plus, Users, Award, TrendingUp, Calendar, Search, CheckCircle2, Star, ShieldCheck, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import AssignLearnerModal from '@/components/teacher/AssignLearnerModal';

interface LearnerAssignmentGroup {
  learnerId: string;
  learnerName: string;
  assignments: Assignment[];
}

interface TeacherViewProps {
  progress: LearnerProgress;
  onAssign: (sound: PhonicSound, duration: number, type: ExerciseType) => void;
}

const ITEMS_PER_PAGE = 15; // 5 columns x 3 rows

// ── helpers ──────────────────────────────────────────────────────────────────

function soundLabel(a: Assignment): string {
  if (a.sound.type === 'INITIAL_CLUSTER') return `${a.sound.symbol}-`;
  if (a.sound.type === 'FINAL_CLUSTER')   return `-${a.sound.symbol}`;
  return `/${a.sound.symbol}/`;
}

function scorePillClass(score: number): string {
  if (score >= 85) return 'bg-emerald-500 text-white';
  if (score >= 50) return 'bg-amber-400 text-white';
  return 'bg-red-400 text-white';
}

// ─────────────────────────────────────────────────────────────────────────────

const TeacherView: React.FC<TeacherViewProps> = () => {
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<'ALL' | 'VOWEL' | 'CONSONANT' | 'INITIAL_CLUSTER' | 'FINAL_CLUSTER' | 'ENDING_PATTERN'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'MASTERCLASS' | 'PHONEME'>('PHONEME');
  const [currentPage, setCurrentPage] = useState(1);
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);
  const [soundToAssign, setSoundToAssign] = useState<PhonicSound | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active Tracker data
  const [learnerGroups, setLearnerGroups] = useState<LearnerAssignmentGroup[]>([]);
  const [trackerLoading, setTrackerLoading] = useState(true);
  const [expandedLearners, setExpandedLearners] = useState<Set<string>>(new Set());

  const fetchTracker = useCallback(async () => {
    setTrackerLoading(true);
    try {
      const res = await fetch('/api/phoneme/learner-assignments');
      if (res.ok) {
        const json = await res.json();
        setLearnerGroups(json.groups ?? []);
        // Auto-expand learners who have active assignments
        setExpandedLearners(new Set(
          (json.groups ?? [])
            .filter((g: LearnerAssignmentGroup) => g.assignments.some((a: Assignment) => a.status === 'ACTIVE'))
            .map((g: LearnerAssignmentGroup) => g.learnerId)
        ));
      }
    } finally {
      setTrackerLoading(false);
    }
  }, []);

  useEffect(() => { fetchTracker(); }, [fetchTracker]);

  const filteredSounds = PHONETIC_SOUNDS.filter(s => {
    const isMasterclassPattern = s.type === 'ENDING_PATTERN' || s.type === 'LINKING_PATTERN';
    if (activeCategory === 'ENDING_PATTERN') return s.type === 'ENDING_PATTERN';
    if (isMasterclassPattern) return false; // Hide masterclass items from standard categories

    const matchesCategory = activeCategory === 'ALL' || s.type === activeCategory;
    const matchesSearch = s.symbol.includes(searchQuery) || s.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const masterclassSounds = PHONETIC_SOUNDS.filter(s => s.type === 'ENDING_PATTERN' || s.type === 'LINKING_PATTERN');

  // Pagination calculations
  const totalPages = Math.ceil(filteredSounds.length / ITEMS_PER_PAGE);
  const paginatedSounds = filteredSounds.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, searchQuery]);

  const handleAssign = () => {
    const sound = PHONETIC_SOUNDS.find(s => s.id === selectedSoundId);
    if (sound) {
      setSoundToAssign(sound);
      setSelectedSoundId(null);
    }
  };

  const handleAssignSuccess = (learnerName: string) => {
    setSoundToAssign(null);
    setSuccessMessage(`Assigned to ${learnerName}!`);
    setTimeout(() => setSuccessMessage(null), 3000);
    fetchTracker();
  };

  const categories = [
    { id: 'ALL', label: 'All' },
    { id: 'VOWEL', label: 'Vowels' },
    { id: 'CONSONANT', label: 'Consonants' },
    { id: 'INITIAL_CLUSTER', label: 'Initial Clusters' },
    { id: 'FINAL_CLUSTER', label: 'Final Clusters' },
  ];

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Collapsible Quick Stats */}
      <div className="mb-2">
        <button
          onClick={() => setIsStatsExpanded(!isStatsExpanded)}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors px-2 py-1"
        >
          {isStatsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          Quick Stats
        </button>

        {isStatsExpanded && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-2">
                <div className="bg-indigo-50 p-2 rounded-xl text-indigo-600">
                  <Users className="w-5 h-5" />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Tasks</span>
              </div>
              <p className="text-3xl font-black text-slate-900 leading-none">
                {learnerGroups.reduce((sum, g) => sum + g.assignments.filter(a => a.status === 'ACTIVE').length, 0)}
              </p>
              <p className="text-[10px] font-bold text-slate-500 mt-1">In progress</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-2">
                <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600">
                  <Award className="w-5 h-5" />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mastered</span>
              </div>
              <p className="text-3xl font-black text-slate-900 leading-none">
                {learnerGroups.reduce((sum, g) => sum + g.assignments.filter(a => a.status === 'COMPLETED').length, 0)}
              </p>
              <p className="text-[10px] font-bold text-slate-500 mt-1">Across all learners</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-2">
                <div className="bg-amber-50 p-2 rounded-xl text-amber-600">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mastery Rate</span>
              </div>
              <p className="text-3xl font-black text-slate-900 leading-none">85%</p>
              <p className="text-[10px] font-bold text-slate-500 mt-1">Target threshold</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Main Assignment Panel */}
        <div className="xl:flex-1 bg-white p-6 rounded-[2rem] border border-slate-200 shadow-lg flex flex-col">

          {/* Tab Navigation */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => { setActiveTab('MASTERCLASS'); setSelectedSoundId(null); }}
              className={`flex-1 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                activeTab === 'MASTERCLASS'
                  ? 'bg-gradient-to-r from-slate-900 to-indigo-950 text-white shadow-lg'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              <Star className="w-4 h-4" />
              Ending Sound Masterclass
            </button>

            <button
              onClick={() => { setActiveTab('PHONEME'); setSelectedSoundId(null); }}
              className={`flex-1 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                activeTab === 'PHONEME'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              <Plus className="w-4 h-4" />
              Assign Phoneme
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'MASTERCLASS' ? (
            /* Masterclass Content */
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <p className="text-sm font-medium text-slate-500">Assign specialized deep dives. Mastery required to unlock next steps.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {masterclassSounds.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSoundId(s.id)}
                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col gap-2 text-left relative ${
                      selectedSoundId === s.id
                        ? 'bg-gradient-to-r from-slate-900 to-indigo-950 border-indigo-500 scale-[0.98]'
                        : 'bg-gradient-to-r from-slate-800 to-indigo-900 border-slate-700 hover:border-indigo-500/50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xl font-black text-white">
                        {s.type === 'LINKING_PATTERN' ? s.symbol : `/${s.symbol}/`}
                      </span>
                      {selectedSoundId === s.id && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">{s.patternGroup?.replace('_', ' ')}</p>
                      <p className="text-[10px] font-bold text-slate-300 leading-tight">{s.description.split(' (')[0]}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Phoneme Content */
            <div className="flex-1 flex flex-col">
              {/* Category Filters */}
              <div className="flex flex-wrap gap-2 mb-4">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                      activeCategory === cat.id
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                      : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Search Input */}
              <div className="mb-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search symbols or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-slate-700 placeholder:text-slate-400"
                />
              </div>

              {/* Paginated Phoneme Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {paginatedSounds.map(sound => (
                  <button
                    key={sound.id}
                    onClick={() => setSelectedSoundId(sound.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all relative ${
                      selectedSoundId === sound.id
                      ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100 scale-[0.98]'
                      : 'border-slate-100 bg-white hover:border-indigo-200 hover:shadow-sm'
                    }`}
                  >
                    <span className={`text-xl font-black mb-0.5 transition-colors ${
                      selectedSoundId === sound.id ? 'text-indigo-600' : 'text-slate-800'
                    }`}>
                      {sound.type === 'INITIAL_CLUSTER' ? sound.symbol + '-' : sound.type === 'FINAL_CLUSTER' ? '-' + sound.symbol : '/' + sound.symbol + '/'}
                    </span>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter text-center leading-tight truncate w-full">
                      {sound.description.split('as in')[1]?.replace(/"/g, '').trim() || sound.description.split(' ')[0]}
                    </span>
                    {selectedSoundId === sound.id && (
                      <div className="absolute -top-1.5 -right-1.5 bg-indigo-600 text-white p-0.5 rounded-full shadow-md">
                        <CheckCircle2 className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                          currentPage === page
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <span className="text-[10px] text-slate-400 ml-2">
                    {filteredSounds.length} sounds
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Shared Assign Button Footer */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex-1 w-full max-w-sm bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-black text-emerald-900">Dynamic Mastery Mode</h4>
              </div>
              <p className="text-[10px] font-bold text-emerald-700 leading-relaxed">Repeats every 24h until 85% mastery.</p>
            </div>

            <div className="flex items-center gap-4">
              {selectedSoundId && (
                <div className="text-right">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Selected</span>
                  <p className="text-xl font-black text-indigo-600">
                    {(() => {
                      const s = PHONETIC_SOUNDS.find(s => s.id === selectedSoundId);
                      if (!s) return '';
                      return s.type === 'INITIAL_CLUSTER' ? s.symbol + '-' : s.type === 'FINAL_CLUSTER' ? '-' + s.symbol : '/' + s.symbol + '/';
                    })()}
                  </p>
                </div>
              )}

              <button
                onClick={handleAssign}
                disabled={!selectedSoundId}
                className="bg-indigo-600 text-white font-black py-3 px-8 rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 disabled:shadow-none active:translate-y-0.5"
              >
                Assign to Learner
              </button>
            </div>
          </div>
        </div>

        {/* Active Tracker Sidebar */}
        <div className="xl:w-[420px] bg-white p-6 rounded-[2rem] border border-slate-200 shadow-lg overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-3">
              <Calendar className="w-5 h-5 text-indigo-600" />
              Active Tracker
            </h2>
            {!trackerLoading && (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {learnerGroups.filter(g => g.assignments.length > 0).length} learner{learnerGroups.filter(g => g.assignments.length > 0).length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar flex-1">
            {trackerLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            ) : learnerGroups.every(g => g.assignments.length === 0) ? (
              <div className="text-center py-12 px-6 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-400 font-bold text-sm">No assignments yet.</p>
                <p className="text-slate-300 text-xs mt-1">Assign a sound to a learner to start tracking.</p>
              </div>
            ) : (
              learnerGroups
                .filter(g => g.assignments.length > 0)
                .map(group => {
                  const activeCount = group.assignments.filter(a => a.status === 'ACTIVE').length;
                  const doneCount   = group.assignments.filter(a => a.status === 'COMPLETED').length;
                  const isExpanded  = expandedLearners.has(group.learnerId);

                  return (
                    <div key={group.learnerId} className="rounded-2xl border border-slate-100 overflow-hidden">
                      {/* Learner header row */}
                      <button
                        onClick={() => setExpandedLearners(prev => {
                          const next = new Set(prev);
                          next.has(group.learnerId) ? next.delete(group.learnerId) : next.add(group.learnerId);
                          return next;
                        })}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                      >
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black shrink-0">
                          {group.learnerName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-slate-800 truncate">{group.learnerName}</p>
                          <p className="text-[10px] font-bold text-slate-400">
                            {activeCount > 0 && <span className="text-indigo-500">{activeCount} active</span>}
                            {activeCount > 0 && doneCount > 0 && <span className="text-slate-300"> · </span>}
                            {doneCount > 0 && <span className="text-emerald-500">{doneCount} mastered</span>}
                          </p>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Assignment cards */}
                      {isExpanded && (
                        <div className="divide-y divide-slate-50">
                          {group.assignments.map(a => {
                            const best = a.records.length > 0 ? Math.max(...a.records.map(r => r.score)) : null;
                            const isMastered = a.status === 'COMPLETED';
                            return (
                              <div key={a.id} className="px-4 py-3 bg-white">
                                {/* Sound + status */}
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <span className="text-xl font-black text-slate-900 leading-none">{soundLabel(a)}</span>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 leading-none">
                                      {a.sound.description.split(' (')[0]}
                                    </p>
                                  </div>
                                  <span className={`text-[8px] font-black uppercase tracking-tighter px-2 py-0.5 rounded ${
                                    isMastered ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-600'
                                  }`}>
                                    {isMastered ? 'Mastered' : 'Active'}
                                  </span>
                                </div>

                                {/* Session score trail */}
                                {a.records.length === 0 ? (
                                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Waiting for first try</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {a.records.map((r, i) => (
                                        <div
                                          key={r.dayNumber}
                                          title={`Session ${i + 1}: ${r.score}%`}
                                          className={`flex items-center justify-center rounded-md text-[9px] font-black leading-none ${scorePillClass(r.score)}`}
                                          style={{ minWidth: 32, height: 20, padding: '0 4px' }}
                                        >
                                          {r.score}%
                                        </div>
                                      ))}
                                      {isMastered && (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[9px] font-bold text-slate-400">
                                        {a.records.length} session{a.records.length !== 1 ? 's' : ''}
                                      </span>
                                      {best !== null && (
                                        <span className={`text-[9px] font-black ${best >= 85 ? 'text-emerald-600' : best >= 50 ? 'text-amber-500' : 'text-red-400'}`}>
                                          Best {best}%
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>

      {/* Success toast */}
      {successMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-emerald-600 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          {successMessage}
        </div>
      )}

      {/* Learner picker modal */}
      {soundToAssign && (
        <AssignLearnerModal
          sound={soundToAssign}
          onClose={() => setSoundToAssign(null)}
          onSuccess={handleAssignSuccess}
        />
      )}
    </div>
  );
};

export default TeacherView;