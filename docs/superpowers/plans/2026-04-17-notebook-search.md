# Notebook Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-tab search input to the Notebook page that highlights matching vocab words or structure patterns and dims/hides non-matches.

**Architecture:** All changes are in a single client component file. Search state lives in `NotebookPage` and is passed down as a `searchQuery` prop to course section components, which apply highlight/dim logic locally. A shared `highlightMatch` helper produces JSX with the matched substring wrapped in `<mark>`.

**Tech Stack:** React 19, Next.js, TypeScript, Tailwind CSS v4, lucide-react

---

## File Map

| File | What changes |
|---|---|
| `src/app/learner/notebook/page.tsx` | All changes — state, search input UI, prop threading, highlight logic |

No new files.

---

### Task 1: Add `highlightMatch` helper and update `WordCard` + `StructureCard`

**Files:**
- Modify: `src/app/learner/notebook/page.tsx`

- [ ] **Step 1: Add `Search` to the lucide-react import**

In `src/app/learner/notebook/page.tsx`, change the first import line from:

```ts
import { BookMarked, MessageCircle, BookOpen, ChevronDown, ChevronUp, Loader2, CheckCircle } from 'lucide-react';
```

to:

```ts
import { BookMarked, MessageCircle, BookOpen, ChevronDown, ChevronUp, Loader2, CheckCircle, Search, X } from 'lucide-react';
```

- [ ] **Step 2: Add the `highlightMatch` helper function**

Add this function just above the `StatChip` function (around line 151):

```tsx
// ─── Search helper ─────────────────────────────────────────────────────────────

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 dark:bg-amber-700/50 rounded-sm not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
```

- [ ] **Step 3: Update `WordCard` to accept and apply a `highlight` prop**

Change the `WordCard` signature and its word rendering. Find:

```tsx
function WordCard({ entry, commitThreshold }: { entry: NotebookEntry; commitThreshold: number }) {
```

Replace with:

```tsx
function WordCard({ entry, commitThreshold, highlight }: { entry: NotebookEntry; commitThreshold: number; highlight?: string }) {
```

Then find the word span inside `WordCard`:

```tsx
          <span className="font-semibold text-foreground text-base">{entry.word}</span>
```

Replace with:

```tsx
          <span className="font-semibold text-foreground text-base">{highlightMatch(entry.word, highlight ?? '')}</span>
```

- [ ] **Step 4: Update `StructureCard` to accept and apply a `highlight` prop**

Change the `StructureCard` signature. Find:

```tsx
function StructureCard({ entry, commitThreshold }: { entry: StructureNotebookEntry; commitThreshold: number }) {
```

Replace with:

```tsx
function StructureCard({ entry, commitThreshold, highlight }: { entry: StructureNotebookEntry; commitThreshold: number; highlight?: string }) {
```

Then find the pattern span inside `StructureCard`:

```tsx
      <span className="font-mono text-sm font-semibold text-foreground">{entry.pattern}</span>
```

Replace with:

```tsx
      <span className="font-mono text-sm font-semibold text-foreground">{highlightMatch(entry.pattern, highlight ?? '')}</span>
```

- [ ] **Step 5: Verify the file compiles**

```bash
cd /Users/daongochuyen/Documents/PYE/phonomaster-next && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 6: Commit**

```bash
git add src/app/learner/notebook/page.tsx
git commit -m "feat: add highlightMatch helper and highlight prop to WordCard/StructureCard"
```

---

### Task 2: Update `CourseSection` to support search

**Files:**
- Modify: `src/app/learner/notebook/page.tsx`

- [ ] **Step 1: Add `searchQuery` prop to `CourseSection`**

Find the `CourseSection` function signature:

```tsx
function CourseSection({ course }: { course: CourseNotebook }) {
```

Replace with:

```tsx
function CourseSection({ course, searchQuery = '' }: { course: CourseNotebook; searchQuery?: string }) {
```

- [ ] **Step 2: Add search-aware derived state inside `CourseSection`**

Inside `CourseSection`, just after `const [open, setOpen] = useState(true);`, add:

```tsx
  const isSearchActive = searchQuery.trim() !== '';
  const effectiveOpen = isSearchActive ? true : open;

  const matchEntry = (entry: { word: string }) =>
    entry.word.toLowerCase().includes(searchQuery.trim().toLowerCase());

  if (isSearchActive && !course.entries.some(matchEntry)) return null;
```

- [ ] **Step 3: Replace all uses of `open` in the JSX with `effectiveOpen`**

In `CourseSection`, find:

```tsx
      {open
        ? <ChevronUp className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        : <ChevronDown className="w-4 h-4 text-muted-foreground/60 shrink-0" />
      }
```

Replace with:

```tsx
      {effectiveOpen
        ? <ChevronUp className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        : <ChevronDown className="w-4 h-4 text-muted-foreground/60 shrink-0" />
      }
```

And find:

```tsx
      {open && (
        <div className="border-t border-border px-5 py-4 space-y-4">
```

Replace with:

```tsx
      {effectiveOpen && (
        <div className="border-t border-border px-5 py-4 space-y-4">
```

- [ ] **Step 4: Wrap each `WordCard` in `CourseSection` with dim + highlight logic**

There are three places where `WordCard` is rendered in `CourseSection` — inside `learningEntries.map`, `untouchedEntries.map`, and `masteredEntries.map`. Replace **all three** map blocks with the search-aware version.

Find the first `WordCard` render (inside learning entries):

```tsx
                {learningEntries.map(entry => (
                  <WordCard
                    key={`${entry.lessonId}:${entry.vocabItemId}`}
                    entry={entry}
                    commitThreshold={course.commitThreshold}
                  />
                ))}
```

Replace with:

```tsx
                {learningEntries.map(entry => {
                  const matches = !isSearchActive || matchEntry(entry);
                  return (
                    <div key={`${entry.lessonId}:${entry.vocabItemId}`} className={matches ? '' : 'opacity-40'}>
                      <WordCard
                        entry={entry}
                        commitThreshold={course.commitThreshold}
                        highlight={matches && isSearchActive ? searchQuery.trim() : undefined}
                      />
                    </div>
                  );
                })}
```

Find the second `WordCard` render (inside untouched entries):

```tsx
              {untouchedEntries.map(entry => (
                <WordCard
                  key={`${entry.lessonId}:${entry.vocabItemId}`}
                  entry={entry}
                  commitThreshold={course.commitThreshold}
                />
              ))}
```

Replace with:

```tsx
              {untouchedEntries.map(entry => {
                const matches = !isSearchActive || matchEntry(entry);
                return (
                  <div key={`${entry.lessonId}:${entry.vocabItemId}`} className={matches ? '' : 'opacity-40'}>
                    <WordCard
                      entry={entry}
                      commitThreshold={course.commitThreshold}
                      highlight={matches && isSearchActive ? searchQuery.trim() : undefined}
                    />
                  </div>
                );
              })}
```

Find the third `WordCard` render (inside mastered entries):

```tsx
              {masteredEntries.map(entry => (
                <WordCard
                  key={`${entry.lessonId}:${entry.vocabItemId}`}
                  entry={entry}
                  commitThreshold={course.commitThreshold}
                />
              ))}
```

Replace with:

```tsx
              {masteredEntries.map(entry => {
                const matches = !isSearchActive || matchEntry(entry);
                return (
                  <div key={`${entry.lessonId}:${entry.vocabItemId}`} className={matches ? '' : 'opacity-40'}>
                    <WordCard
                      entry={entry}
                      commitThreshold={course.commitThreshold}
                      highlight={matches && isSearchActive ? searchQuery.trim() : undefined}
                    />
                  </div>
                );
              })}
```

- [ ] **Step 5: Verify the file compiles**

```bash
cd /Users/daongochuyen/Documents/PYE/phonomaster-next && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/learner/notebook/page.tsx
git commit -m "feat: add search highlighting and filtering to CourseSection"
```

---

### Task 3: Update `StructureCourseSection` to support search

**Files:**
- Modify: `src/app/learner/notebook/page.tsx`

- [ ] **Step 1: Add `searchQuery` prop to `StructureCourseSection`**

Find:

```tsx
function StructureCourseSection({ course }: { course: CourseStructureNotebook }) {
```

Replace with:

```tsx
function StructureCourseSection({ course, searchQuery = '' }: { course: CourseStructureNotebook; searchQuery?: string }) {
```

- [ ] **Step 2: Add search-aware derived state inside `StructureCourseSection`**

Inside `StructureCourseSection`, just after `const [open, setOpen] = useState(true);`, add:

```tsx
  const isSearchActive = searchQuery.trim() !== '';
  const effectiveOpen = isSearchActive ? true : open;

  const matchEntry = (entry: { pattern: string }) =>
    entry.pattern.toLowerCase().includes(searchQuery.trim().toLowerCase());

  if (isSearchActive && !course.entries.some(matchEntry)) return null;
```

- [ ] **Step 3: Replace all uses of `open` with `effectiveOpen` in `StructureCourseSection`**

Find (inside `StructureCourseSection`):

```tsx
      {open
        ? <ChevronUp className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        : <ChevronDown className="w-4 h-4 text-muted-foreground/60 shrink-0" />
      }
```

Replace with:

```tsx
      {effectiveOpen
        ? <ChevronUp className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        : <ChevronDown className="w-4 h-4 text-muted-foreground/60 shrink-0" />
      }
```

And find (inside `StructureCourseSection`):

```tsx
      {open && (
        <div className="border-t border-border px-5 py-4 space-y-4">
```

Replace with:

```tsx
      {effectiveOpen && (
        <div className="border-t border-border px-5 py-4 space-y-4">
```

- [ ] **Step 4: Wrap each `StructureCard` with dim + highlight logic**

There are three places where `StructureCard` is rendered — in `learningEntries.map`, `untouchedEntries.map`, and `masteredEntries.map`. Replace all three.

Find the first `StructureCard` render (learning entries):

```tsx
                {learningEntries.map(entry => (
                  <StructureCard
                    key={`${entry.lessonId}:${entry.structureItemId}`}
                    entry={entry}
                    commitThreshold={course.commitThreshold}
                  />
                ))}
```

Replace with:

```tsx
                {learningEntries.map(entry => {
                  const matches = !isSearchActive || matchEntry(entry);
                  return (
                    <div key={`${entry.lessonId}:${entry.structureItemId}`} className={matches ? '' : 'opacity-40'}>
                      <StructureCard
                        entry={entry}
                        commitThreshold={course.commitThreshold}
                        highlight={matches && isSearchActive ? searchQuery.trim() : undefined}
                      />
                    </div>
                  );
                })}
```

Find the second `StructureCard` render (untouched entries):

```tsx
              {untouchedEntries.map(entry => (
                <StructureCard
                  key={`${entry.lessonId}:${entry.structureItemId}`}
                  entry={entry}
                  commitThreshold={course.commitThreshold}
                />
              ))}
```

Replace with:

```tsx
              {untouchedEntries.map(entry => {
                const matches = !isSearchActive || matchEntry(entry);
                return (
                  <div key={`${entry.lessonId}:${entry.structureItemId}`} className={matches ? '' : 'opacity-40'}>
                    <StructureCard
                      entry={entry}
                      commitThreshold={course.commitThreshold}
                      highlight={matches && isSearchActive ? searchQuery.trim() : undefined}
                    />
                  </div>
                );
              })}
```

Find the third `StructureCard` render (mastered entries):

```tsx
              {masteredEntries.map(entry => (
                <StructureCard
                  key={`${entry.lessonId}:${entry.structureItemId}`}
                  entry={entry}
                  commitThreshold={course.commitThreshold}
                />
              ))}
```

Replace with:

```tsx
              {masteredEntries.map(entry => {
                const matches = !isSearchActive || matchEntry(entry);
                return (
                  <div key={`${entry.lessonId}:${entry.structureItemId}`} className={matches ? '' : 'opacity-40'}>
                    <StructureCard
                      entry={entry}
                      commitThreshold={course.commitThreshold}
                      highlight={matches && isSearchActive ? searchQuery.trim() : undefined}
                    />
                  </div>
                );
              })}
```

- [ ] **Step 5: Verify the file compiles**

```bash
cd /Users/daongochuyen/Documents/PYE/phonomaster-next && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/learner/notebook/page.tsx
git commit -m "feat: add search highlighting and filtering to StructureCourseSection"
```

---

### Task 4: Add search state, input UI, and tab-level "no results" to `NotebookPage`

**Files:**
- Modify: `src/app/learner/notebook/page.tsx`

- [ ] **Step 1: Add `vocabQuery` and `structureQuery` state**

Inside `NotebookPage`, find the existing state declarations:

```tsx
  const [activeTab, setActiveTab] = useState<'vocab' | 'structures'>('vocab');
```

Add two new lines immediately after:

```tsx
  const [vocabQuery, setVocabQuery] = useState('');
  const [structureQuery, setStructureQuery] = useState('');
```

- [ ] **Step 2: Add the search input inside the header card, below the tab switcher**

Find the closing of the tab switcher block and the closing of the header card `</div>` (around line 120):

```tsx
        </div>
      </div>

      {/* Tab content */}
```

Replace with:

```tsx
        </div>

        {/* Search input */}
        {activeTab === 'vocab' && hasVocab && (
          <div className="mt-3 flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            <input
              type="text"
              value={vocabQuery}
              onChange={e => setVocabQuery(e.target.value)}
              placeholder="Search vocab…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/40"
            />
            {vocabQuery && (
              <button onClick={() => setVocabQuery('')} className="text-muted-foreground/50 hover:text-muted-foreground transition">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
        {activeTab === 'structures' && hasStructures && (
          <div className="mt-3 flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            <input
              type="text"
              value={structureQuery}
              onChange={e => setStructureQuery(e.target.value)}
              placeholder="Search structures…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/40"
            />
            {structureQuery && (
              <button onClick={() => setStructureQuery('')} className="text-muted-foreground/50 hover:text-muted-foreground transition">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tab content */}
```

- [ ] **Step 3: Pass `searchQuery` to each `CourseSection` and add tab-level no-results**

Find the vocab tab content block:

```tsx
      {activeTab === 'vocab' ? (
        hasVocab ? (
          vocabData.courses.map(course => (
            <CourseSection key={course.courseId} course={course} />
          ))
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground/60">No vocab yet.</p>
          </div>
        )
      ) : (
        hasStructures ? (
          structureData.courses.map(course => (
            <StructureCourseSection key={course.courseId} course={course} />
          ))
        ) : (
          <div className="text-center py-16">
            <MessageCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground/60">
              No structures yet. Complete conversation exercises to start tracking mastery.
            </p>
          </div>
        )
      )}
```

Replace with:

```tsx
      {activeTab === 'vocab' ? (
        hasVocab ? (
          <>
            {vocabData.courses.map(course => (
              <CourseSection key={course.courseId} course={course} searchQuery={vocabQuery} />
            ))}
            {vocabQuery.trim() !== '' &&
              !vocabData.courses.some(c =>
                c.entries.some(e => e.word.toLowerCase().includes(vocabQuery.trim().toLowerCase()))
              ) && (
              <div className="text-center py-12 text-sm text-muted-foreground/60">
                No results found for &ldquo;{vocabQuery.trim()}&rdquo;
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground/60">No vocab yet.</p>
          </div>
        )
      ) : (
        hasStructures ? (
          <>
            {structureData.courses.map(course => (
              <StructureCourseSection key={course.courseId} course={course} searchQuery={structureQuery} />
            ))}
            {structureQuery.trim() !== '' &&
              !structureData.courses.some(c =>
                c.entries.some(e => e.pattern.toLowerCase().includes(structureQuery.trim().toLowerCase()))
              ) && (
              <div className="text-center py-12 text-sm text-muted-foreground/60">
                No results found for &ldquo;{structureQuery.trim()}&rdquo;
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16">
            <MessageCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground/60">
              No structures yet. Complete conversation exercises to start tracking mastery.
            </p>
          </div>
        )
      )}
```

- [ ] **Step 4: Verify the file compiles**

```bash
cd /Users/daongochuyen/Documents/PYE/phonomaster-next && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Start the dev server and manually test**

```bash
cd /Users/daongochuyen/Documents/PYE/phonomaster-next && npm run dev
```

Navigate to `http://localhost:3000/learner/notebook` and verify:

1. A search input appears below the tab switcher in the Vocab tab.
2. Typing a word that exists highlights the matched substring in amber and dims non-matching words.
3. All course sections with matches auto-expand.
4. Course sections with no matches disappear.
5. Typing something with no matches at all shows the "No results found for …" message.
6. Clearing the input (× button or backspace) restores normal view.
7. Switching to Structures tab shows the structures search input (if structures exist).
8. Switching back to Vocab tab preserves the vocab search query.

- [ ] **Step 6: Commit**

```bash
git add src/app/learner/notebook/page.tsx
git commit -m "feat: add search input and no-results message to NotebookPage"
```
