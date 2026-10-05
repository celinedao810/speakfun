"use client";

import { useState } from 'react';
import Exercise1Vocab, { WordResult } from '@/components/homework/learner/Exercise1Vocab';
import { VocabAttemptAudit, VocabExerciseItem } from '@/lib/types';

const SAMPLE_WORDS: VocabExerciseItem[] = [
  { word: 'deploy', ipa: '/dɪˈplɔɪ/', clue: 'verb: to release software so people can use it' },
  { word: 'requirement', ipa: '/rɪˈkwaɪəmənt/', clue: 'noun: something the system must do' },
  { word: 'bug', ipa: '/bʌɡ/', clue: 'noun: a mistake in code that causes a problem' },
  { word: 'database', ipa: '/ˈdeɪtəbeɪs/', clue: 'noun: an organised store of data' },
  { word: 'priority', ipa: '/praɪˈɒrəti/', clue: 'noun: how important a task is compared with others' },
  { word: 'feedback', ipa: '/ˈfiːdbæk/', clue: 'noun: comments on how well something works' },
  { word: 'sprint', ipa: '/sprɪnt/', clue: 'noun: a short, fixed period of development work' },
  { word: 'backlog', ipa: '/ˈbæklɒɡ/', clue: 'noun: the list of work still to be done' },
  { word: 'stakeholder', ipa: '/ˈsteɪkhəʊldə/', clue: 'noun: a person with an interest in the project' },
  { word: 'release', ipa: '/rɪˈliːs/', clue: 'noun: a version of the product made available' },
  { word: 'workaround', ipa: '/ˈwɜːkəraʊnd/', clue: 'noun: a temporary way around a problem' },
  { word: 'estimate', ipa: '/ˈestɪmeɪt/', clue: 'verb: to guess how long a task will take' },
  { word: 'regression', ipa: '/rɪˈɡreʃn/', clue: 'noun: a bug in something that used to work' },
  { word: 'deadline', ipa: '/ˈdedlaɪn/', clue: 'noun: the time by which work must be finished' },
  { word: 'user story', ipa: '/ˈjuːzə ˈstɔːri/', clue: 'phrase: a short description of a feature from the user’s view' },
].map((w, i) => ({ ...w, id: `dev-${i}`, exampleSentence: '', lessonId: 'dev' }));

interface Result {
  score: number;
  wrongVocabIds: string[];
  attempts: VocabAttemptAudit[];
  wordResults: WordResult[];
}

export default function VocabGamePlayground() {
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Dev playground — results are shown below, never saved.
      </div>

      {result ? (
        <div className="space-y-3">
          <p className="font-bold">Score: {result.score}</p>
          <ul className="text-sm space-y-1">
            {result.wordResults.map(r => (
              <li key={r.item.id}>
                {r.isCorrect ? '✅' : '❌'} {r.item.word}
                {r.recognizedWord ? ` — heard “${r.recognizedWord}”` : ''} ({r.pointsEarned} pt)
              </li>
            ))}
          </ul>
          <details className="text-xs">
            <summary>Raw attempts</summary>
            <pre className="whitespace-pre-wrap">{JSON.stringify(result.attempts, null, 2)}</pre>
          </details>
          <button
            onClick={() => { setResult(null); setRound(r => r + 1); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold"
          >
            Play again
          </button>
        </div>
      ) : (
        <Exercise1Vocab
          key={round}
          vocabPool={SAMPLE_WORDS}
          onComplete={(score, wrongVocabIds, attempts, wordResults) =>
            setResult({ score, wrongVocabIds, attempts, wordResults })
          }
        />
      )}
    </div>
  );
}
