"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, X, Sparkles, Download, FileText, Save, BookOpen,
  Check, Pencil, ChevronDown, ChevronUp, Loader2, MessageSquare, ArrowRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { insertLessonPlan, updateLessonPlan } from '@/lib/supabase/queries/lessonPlans';
import { fetchLessons, insertLesson, updateLesson } from '@/lib/supabase/queries/lessons';
import { uploadLessonPDF } from '@/lib/supabase/storage';
import { Course, GeneratedLessonPlan, LessonPlanSection, LessonPlanMetadata } from '@/lib/types';

interface LessonPlanGeneratorProps {
  teacherId: string;
  courses: Course[];
  initialPlan?: GeneratedLessonPlan | null;
  onSaved: (plan: GeneratedLessonPlan) => void;
}

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

// Gemini sometimes returns literal \n escape sequences instead of real newlines.
// This function normalises both cases.
function processContent(content: string): string {
  return content.replace(/\\n/g, '\n');
}

// Inline markdown: **bold** and *italic*
function renderInline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, j) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-${j}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={`${keyPrefix}-${j}`}>{part.slice(1, -1)}</em>;
    }
    return <span key={`${keyPrefix}-${j}`}>{part}</span>;
  });
}

// Markdown renderer: headings, hr, bold, italic, bullets, numbered items, blank lines
// Numbered items are rendered as explicit flex rows (not inside <ol>) so that
// bullet sub-lines between them don't reset the counter back to 1.
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let bulletItems: React.ReactNode[] = [];

  const flushBullets = (key: string) => {
    if (bulletItems.length === 0) return;
    elements.push(
      <ul key={key} className="ml-5 list-disc space-y-0.5 mb-1">{bulletItems}</ul>
    );
    bulletItems = [];
  };

  lines.forEach((line, i) => {
    const isBullet = /^\s*[-*]\s+/.test(line);
    const numberedMatch = /^(\d+)\.\s+(.*)$/.exec(line);
    const h3Match = /^###\s+(.*)$/.exec(line);
    const h2Match = /^##\s+(.*)$/.exec(line);
    const isHr = /^---+$/.test(line.trim());

    if (isHr) {
      flushBullets(`blist-${i}`);
      elements.push(<hr key={i} className="my-2 border-border" />);
    } else if (h3Match) {
      flushBullets(`blist-${i}`);
      elements.push(
        <p key={i} className="font-semibold text-sm mt-2 mb-1">{renderInline(h3Match[1], `h3-${i}`)}</p>
      );
    } else if (h2Match) {
      flushBullets(`blist-${i}`);
      elements.push(
        <p key={i} className="font-bold text-sm mt-2 mb-1">{renderInline(h2Match[1], `h2-${i}`)}</p>
      );
    } else if (isBullet) {
      const content = line.replace(/^[-*]\s+/, '');
      bulletItems.push(<li key={i}>{renderInline(content, `li-${i}`)}</li>);
    } else if (numberedMatch) {
      flushBullets(`blist-${i}`);
      elements.push(
        <div key={i} className="flex gap-2 mb-1">
          <span className="flex-shrink-0 font-medium min-w-[1.5rem]">{numberedMatch[1]}.</span>
          <span className="flex-1">{renderInline(numberedMatch[2], `n-${i}`)}</span>
        </div>
      );
    } else {
      flushBullets(`blist-${i}`);
      if (line.trim() === '') {
        elements.push(<br key={i} />);
      } else {
        elements.push(<p key={i} className="mb-1">{renderInline(line, `p-${i}`)}</p>);
      }
    }
  });

  flushBullets('blist-end');
  return elements;
}

export default function LessonPlanGenerator({
  teacherId,
  courses,
  initialPlan,
  onSaved,
}: LessonPlanGeneratorProps) {
  // Form state
  const [referencePdfs, setReferencePdfs] = useState<File[]>([]);
  const [topic, setTopic] = useState('');
  const [cefrLevel, setCefrLevel] = useState<typeof CEFR_LEVELS[number]>('B2');
  const [lessonFormat, setLessonFormat] = useState('');
  const [learnerPersonas, setLearnerPersonas] = useState('');
  const [otherInstructions, setOtherInstructions] = useState('');

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [sections, setSections] = useState<LessonPlanSection[]>([]);

  // Per-section refinement: sectionId -> state
  const [sectionStates, setSectionStates] = useState<
    Record<string, { open: boolean; instruction: string; refining: boolean }>
  >({});

  // Global chat
  const [chatInput, setChatInput] = useState('');
  const [chatRefining, setChatRefining] = useState(false);

  // Actions
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null); // null = unsaved new plan
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingToCourse, setMovingToCourse] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveSuccess, setMoveSuccess] = useState<string | null>(null);

  // Drag-and-drop
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-populate form when loading from history
  useEffect(() => {
    if (!initialPlan) return;
    setSavedPlanId(initialPlan.id);
    setPlanTitle(initialPlan.title);
    setSections((initialPlan.content || []).map(s => ({ ...s, content: processContent(s.content) })));
    if (initialPlan.metadata) {
      setTopic(initialPlan.metadata.topic);
      setCefrLevel(initialPlan.metadata.cefrLevel);
      setLessonFormat(initialPlan.metadata.lessonFormat);
      setLearnerPersonas(initialPlan.metadata.learnerPersonas);
      setOtherInstructions(initialPlan.metadata.otherInstructions);
    }
    const initStates: typeof sectionStates = {};
    for (const s of initialPlan.content || []) {
      initStates[s.id] = { open: false, instruction: '', refining: false };
    }
    setSectionStates(initStates);
  }, [initialPlan]);

  const handleFileInput = (files: FileList | null) => {
    if (!files) return;
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf');
    setReferencePdfs(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...pdfs.filter(f => !existing.has(f.name))];
    });
  };

  const removeFile = (name: string) => {
    setReferencePdfs(prev => prev.filter(f => f.name !== name));
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // strip data URL prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleGenerate = async () => {
    if (!topic.trim() || !cefrLevel) return;
    setGenerating(true);
    setGenerationError(null);
    setSavedPlanId(null); // new generation → treat as unsaved

    try {
      const referencePdfsBase64 = await Promise.all(referencePdfs.map(readFileAsBase64));

      const res = await fetch('/api/lesson-plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic, cefrLevel, lessonFormat, learnerPersonas, otherInstructions, referencePdfsBase64,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }

      const data = await res.json();
      const processedSections = (data.sections || []).map((s: LessonPlanSection) => ({
        ...s,
        content: processContent(s.content),
      }));
      setPlanTitle(data.title || topic);
      setSections(processedSections);
      const initStates: typeof sectionStates = {};
      for (const s of processedSections) {
        initStates[s.id] = { open: false, instruction: '', refining: false };
      }
      setSectionStates(initStates);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setGenerating(false);
    }
  };

  const handleRefineSection = async (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    const state = sectionStates[sectionId];
    if (!section || !state?.instruction.trim()) return;

    setSectionStates(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], refining: true } }));

    try {
      const res = await fetch('/api/lesson-plans/refine-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionHeading: section.heading,
          currentContent: section.content,
          refinementInstruction: state.instruction,
          lessonContext: { topic, cefrLevel, lessonFormat },
        }),
      });

      if (!res.ok) throw new Error('Refinement failed');
      const data = await res.json();
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, content: processContent(data.content) } : s));
      setSectionStates(prev => ({
        ...prev,
        [sectionId]: { open: false, instruction: '', refining: false },
      }));
    } catch {
      setSectionStates(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], refining: false } }));
    }
  };

  const handleChatRefine = async () => {
    if (!chatInput.trim() || sections.length === 0) return;
    setChatRefining(true);
    try {
      const res = await fetch('/api/lesson-plans/chat-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentSections: sections,
          chatInstruction: chatInput,
          lessonContext: { topic, cefrLevel, lessonFormat },
        }),
      });
      if (!res.ok) throw new Error('Chat refinement failed');
      const data = await res.json();
      if (data.title) setPlanTitle(data.title);
      if (data.sections?.length) {
        setSections(data.sections.map((s: LessonPlanSection) => ({
          ...s,
          content: processContent(s.content),
        })));
      }
      setChatInput('');
    } catch {
      // silently fail — user can retry
    } finally {
      setChatRefining(false);
    }
  };

  // Convert markdown content to HTML for the print window
  const markdownToHTML = (text: string): string => {
    const lines = text.split('\n');
    const out: string[] = [];
    let listTag: 'ul' | 'ol' | null = null;

    const inlineHTML = (s: string) =>
      s
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');

    const closeList = () => {
      if (listTag) { out.push(`</${listTag}>`); listTag = null; }
    };

    for (const line of lines) {
      const isBullet = /^[-*]\s+/.test(line);
      const numberedMatch = /^(\d+)\.\s+(.*)$/.exec(line);

      if (isBullet) {
        if (listTag !== 'ul') { closeList(); out.push('<ul>'); listTag = 'ul'; }
        out.push(`<li>${inlineHTML(line.replace(/^[-*]\s+/, ''))}</li>`);
      } else if (numberedMatch) {
        // Render numbered items as explicit rows so bullet sub-lines don't reset the counter
        closeList();
        out.push(`<div class="num-item"><span class="num">${numberedMatch[1]}.</span><span>${inlineHTML(numberedMatch[2])}</span></div>`);
      } else {
        closeList();
        if (!line.trim()) out.push('<br>');
        else out.push(`<p>${inlineHTML(line)}</p>`);
      }
    }
    closeList();
    return out.join('');
  };

  // Download PDF via browser print — renders all Unicode/IPA correctly
  const handleDownloadPDF = () => {
    const meta = `CEFR: ${cefrLevel}${lessonFormat ? ' | ' + lessonFormat : ''}`;
    const sectionsHTML = sections.map(s => `
      <div class="section">
        <h2>${s.heading}</h2>
        <div class="content">${markdownToHTML(s.content)}</div>
      </div>`).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${planTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12pt; color: #111; padding: 30mm 20mm; line-height: 1.55; }
    h1 { font-size: 18pt; font-weight: 700; margin-bottom: 4px; }
    .meta { font-size: 10pt; color: #555; margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
    .section { margin-bottom: 20px; page-break-inside: avoid; }
    h2 { font-size: 13pt; font-weight: 700; color: #1a1a2e; border-left: 3px solid #4f46e5; padding-left: 8px; margin-bottom: 8px; }
    .content p { margin-bottom: 5px; }
    .content ul { padding-left: 18px; margin-bottom: 5px; }
    .content li { margin-bottom: 3px; }
    .num-item { display: flex; gap: 8px; margin-bottom: 4px; }
    .num-item .num { flex-shrink: 0; font-weight: 600; min-width: 1.5em; }
    strong { font-weight: 600; }
    br { display: block; margin: 3px 0; content: ''; }
    @media print {
      body { padding: 15mm; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${planTitle}</h1>
  <div class="meta">${meta}</div>
  ${sectionsHTML}
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    // Short delay so the browser can finish laying out before print dialog
    setTimeout(() => {
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    }, 400);
  };

  // PDF blob for Move to Course upload — jsPDF with proper inline bold + word-level wrapping
  const generatePDFBlob = useCallback(async (): Promise<Blob> => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;

    // Load NotoSans from GitHub CDN — supports full Unicode including IPA.
    // Falls back to built-in Helvetica (which can't render IPA) if offline or fetch fails.
    let pdfFont = 'helvetica';
    let unicodeOk = false;
    try {
      const toBase64 = (buf: ArrayBuffer): string => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)));
        }
        return btoa(binary);
      };
      const base = 'https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans';
      const [rRes, bRes] = await Promise.all([
        fetch(`${base}/NotoSans-Regular.ttf`),
        fetch(`${base}/NotoSans-Bold.ttf`),
      ]);
      if (rRes.ok && bRes.ok) {
        const [rBuf, bBuf] = await Promise.all([rRes.arrayBuffer(), bRes.arrayBuffer()]);
        doc.addFileToVFS('NotoSans-Regular.ttf', toBase64(rBuf));
        doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
        doc.addFileToVFS('NotoSans-Bold.ttf', toBase64(bBuf));
        doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
        pdfFont = 'NotoSans';
        unicodeOk = true;
      }
    } catch { /* fall through to Helvetica */ }

    // With NotoSans: keep IPA as-is. With Helvetica: strip IPA (/.../ with non-Latin-1 chars)
    // and remaining non-Latin-1 characters to avoid garbling. Always strip markdown asterisks.
    const cleanText = (text: string) => {
      if (!unicodeOk) {
        return text
          .replace(/\/[^/\n]+\//g, m => /[^\x00-\xFF]/.test(m) ? '' : m)
          .replace(/[^\x00-\xFF]/g, '')
          .replace(/\*/g, '');
      }
      return text.replace(/\*/g, '');
    };

    // Split raw markdown into bold/normal segments.
    // Use `if (t)` not `if (t.trim())` so spaces between bold words are preserved.
    const parseSegments = (raw: string): Array<{ t: string; b: boolean }> => {
      const segs: Array<{ t: string; b: boolean }> = [];
      raw.split(/(\*\*[^*]+\*\*)/g).forEach(part => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const t = cleanText(part.slice(2, -2));
          if (t) segs.push({ t, b: true });
        } else {
          const t = cleanText(part);
          if (t) segs.push({ t, b: false });
        }
      });
      return segs;
    };

    const checkPage = () => { if (y > 275) { doc.addPage(); y = 20; } };

    // Word-level line wrapping with inline bold support.
    // Draws from (xStart, current y), wraps within wrapW mm, then advances y.
    const renderInlineWrapped = (
      segs: Array<{ t: string; b: boolean }>,
      fontSize: number,
      xStart = margin,
      wrapW = maxWidth,
    ) => {
      doc.setFontSize(fontSize);
      const lh = fontSize * 0.42 + 0.5;
      let x = xStart;
      let lineIsEmpty = true;
      checkPage();

      for (const seg of segs) {
        doc.setFont(pdfFont, seg.b ? 'bold' : 'normal');
        const tokens = seg.t.split(/(\s+)/g);
        for (const token of tokens) {
          if (!token) continue;
          const isSpace = /^\s+$/.test(token);
          if (isSpace && lineIsEmpty) continue; // skip leading space on a new line
          const w = doc.getTextWidth(token);
          if (!lineIsEmpty && x + w > xStart + wrapW) {
            y += lh;
            checkPage();
            x = xStart;
            lineIsEmpty = true;
            if (isSpace) continue; // discard the space that triggered the wrap
          }
          doc.text(token, x, y);
          x += w;
          lineIsEmpty = false;
        }
      }
      y += lh; // advance past the last rendered line
    };

    // Render plain or inline-bold text, wrapped to page width, starting at left margin
    const addText = (raw: string, fontSize: number, forceBold = false) => {
      if (!raw.trim()) return;
      doc.setFontSize(fontSize);
      const lh = fontSize * 0.42 + 0.5;
      if (forceBold || !raw.includes('**')) {
        doc.setFont(pdfFont, forceBold ? 'bold' : 'normal');
        const safe = cleanText(raw);
        if (!safe.trim()) return;
        const wrapped = doc.splitTextToSize(safe, maxWidth);
        for (const wl of wrapped) { checkPage(); doc.text(wl, margin, y); y += lh; }
        return;
      }
      renderInlineWrapped(parseSegments(raw), fontSize);
    };

    // Render a list item: fixed prefix at left margin, content starts indented on the same line.
    const addListItem = (prefix: string, rawContent: string, fontSize: number, indent: number) => {
      doc.setFontSize(fontSize);
      const lh = fontSize * 0.42 + 0.5;
      checkPage();
      doc.setFont(pdfFont, 'normal');
      doc.text(prefix, margin, y);
      const xContent = margin + indent;
      const wrapW = maxWidth - indent;
      if (!rawContent.includes('**')) {
        const safe = cleanText(rawContent);
        const wrapped = doc.splitTextToSize(safe, wrapW);
        for (let i = 0; i < wrapped.length; i++) {
          if (i > 0) { y += lh; checkPage(); }
          doc.text(wrapped[i], xContent, y);
        }
        y += lh;
      } else {
        renderInlineWrapped(parseSegments(rawContent), fontSize, xContent, wrapW);
      }
    };

    // Title + meta
    addText(planTitle, 18, true);
    addText(`CEFR: ${cefrLevel}${lessonFormat ? ' | ' + lessonFormat : ''}`, 10);
    y += 5;

    for (const section of sections) {
      addText(section.heading, 13, true);
      y += 1;

      for (const line of section.content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) { y += 2; continue; }

        const isHr = /^---+$/.test(trimmed);
        const h3Match = /^###\s+(.*)$/.exec(line);
        const h2Match = /^##\s+(.*)$/.exec(line);
        const isBullet = /^[-*]\s+/.test(line);
        const numberedMatch = /^(\d+)\.\s+(.*)$/.exec(line);

        if (isHr) {
          y += 2;
        } else if (h3Match) {
          addText(h3Match[1], 10, true);
        } else if (h2Match) {
          addText(h2Match[1], 11, true);
        } else if (isBullet) {
          addListItem('\u2022', line.replace(/^[-*]\s+/, ''), 10, 5);
        } else if (numberedMatch) {
          addListItem(`${numberedMatch[1]}.`, numberedMatch[2], 10, 8);
        } else {
          addText(line, 10);
        }
      }
      y += 4;
    }

    return doc.output('blob');
  }, [planTitle, cefrLevel, lessonFormat, sections]);

  const handleDownloadDOCX = async () => {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = [
      new Paragraph({ text: planTitle, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({
        children: [new TextRun({ text: `CEFR: ${cefrLevel}${lessonFormat ? ' | ' + lessonFormat : ''}`, italics: true })],
      }),
      new Paragraph({ text: '' }),
    ];

    for (const section of sections) {
      children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 }));
      for (const line of section.content.split('\n')) {
        if (!line.trim()) { children.push(new Paragraph({ text: '' })); continue; }
        const isBullet = /^[-*]\s+/.test(line);
        const content = line.replace(/^[-*]\s+/, '');
        // Handle bold within line
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const runs: any[] = [];
        const parts = content.split(/(\*\*[^*]+\*\*)/g);
        for (const part of parts) {
          if (part.startsWith('**') && part.endsWith('**')) {
            runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
          } else {
            runs.push(new TextRun({ text: part }));
          }
        }
        children.push(
          new Paragraph({
            children: runs,
            bullet: isBullet ? { level: 0 } : undefined,
          })
        );
      }
      children.push(new Paragraph({ text: '' }));
    }

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${planTitle.replace(/\s+/g, '_')}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveToHistory = async () => {
    if (sections.length === 0) return;
    setSaving(true);
    try {
      const metadata: LessonPlanMetadata = {
        topic, cefrLevel, lessonFormat, learnerPersonas, otherInstructions,
      };
      if (savedPlanId) {
        // Already saved — update the existing record instead of inserting a duplicate
        const ok = await updateLessonPlan(supabase, savedPlanId, planTitle, sections, metadata);
        if (ok) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        }
      } else {
        // Never saved — create a new record
        const plan = await insertLessonPlan(supabase, teacherId, planTitle, sections, metadata);
        if (plan) {
          setSavedPlanId(plan.id); // future saves will update this record
          setSaveSuccess(true);
          onSaved(plan);
          setTimeout(() => setSaveSuccess(false), 3000);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleMoveToCourse = async (courseId: string) => {
    setMovingToCourse(true);
    setMoveError(null);
    try {
      const pdfBlob = await generatePDFBlob();
      const fileName = `${planTitle.replace(/\s+/g, '_')}.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

      const existingLessons = await fetchLessons(supabase, courseId);
      const sortOrder = existingLessons.length;

      const lesson = await insertLesson(supabase, courseId, planTitle, sortOrder);
      if (!lesson) throw new Error('Failed to create lesson record');

      const pdfPath = await uploadLessonPDF(supabase, courseId, lesson.id, pdfFile);
      if (!pdfPath) throw new Error('Failed to upload PDF');

      await updateLesson(supabase, lesson.id, { pdf_path: pdfPath, pdf_file_name: fileName });

      const course = courses.find(c => c.id === courseId);
      setMoveSuccess(`Added to "${course?.name || 'course'}" successfully`);
      setTimeout(() => {
        setMoveSuccess(null);
        setShowMoveModal(false);
      }, 2000);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Failed to move to course');
    } finally {
      setMovingToCourse(false);
    }
  };

  const hasOutput = sections.length > 0;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: Input Form */}
      <div className="lg:w-[340px] flex-shrink-0 space-y-4">
        {/* Reference PDFs */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Reference Lesson Plans
            <span className="text-xs text-muted-foreground font-normal ml-1">(optional, PDF only)</span>
          </label>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFileInput(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 px-4 py-5 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            <Upload className="w-5 h-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground text-center">
              Drop PDFs here or click to browse
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={e => handleFileInput(e.target.files)}
          />
          {referencePdfs.length > 0 && (
            <ul className="mt-2 space-y-1">
              {referencePdfs.map(f => (
                <li key={f.name} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-muted/50 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-muted-foreground flex-shrink-0">
                      ({(f.size / 1024 / 1024).toFixed(1)}MB)
                    </span>
                  </div>
                  <button onClick={() => removeFile(f.name)} className="flex-shrink-0 text-muted-foreground hover:text-destructive">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Lesson Topic */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Lesson Topic <span className="text-destructive">*</span>
          </label>
          <textarea
            rows={4}
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. REST APIs and Web Services for Backend Developers"
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>

        {/* CEFR Level */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Target Language Level (CEFR) <span className="text-destructive">*</span>
          </label>
          <select
            value={cefrLevel}
            onChange={e => setCefrLevel(e.target.value as typeof CEFR_LEVELS[number])}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {CEFR_LEVELS.map(lvl => (
              <option key={lvl} value={lvl}>{lvl}</option>
            ))}
          </select>
        </div>

        {/* Lesson Length & Format */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Lesson Length & Format</label>
          <textarea
            rows={2}
            value={lessonFormat}
            onChange={e => setLessonFormat(e.target.value)}
            placeholder="e.g. 90-min online synchronous class, 20 students"
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>

        {/* Learner Personas */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Learner Personas</label>
          <textarea
            rows={3}
            value={learnerPersonas}
            onChange={e => setLearnerPersonas(e.target.value)}
            placeholder="e.g. Junior developers and QA testers, 2-3 years experience, working in Agile teams"
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>

        {/* Other Instructions */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Other Instructions</label>
          <textarea
            rows={3}
            value={otherInstructions}
            onChange={e => setOtherInstructions(e.target.value)}
            placeholder="e.g. Focus on speaking activities, include a lot of pair work, avoid grammar drills"
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !topic.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Lesson Plan
            </>
          )}
        </button>

        {generationError && (
          <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            {generationError}
          </div>
        )}
      </div>

      {/* Right: Output */}
      <div className="flex-1 min-w-0">
        {!hasOutput && !generating && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground rounded-lg border-2 border-dashed border-border">
            <Sparkles className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">Your lesson plan will appear here</p>
            <p className="text-xs mt-1">Fill in the form and click Generate</p>
          </div>
        )}

        {generating && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground rounded-lg border border-border">
            <Loader2 className="w-8 h-8 mb-3 animate-spin text-primary" />
            <p className="text-sm font-medium">Generating lesson plan...</p>
            <p className="text-xs mt-1">This may take 20–60 seconds</p>
          </div>
        )}

        {hasOutput && !generating && (
          <div className="space-y-4">
            {/* Plan title */}
            <div className="flex items-start gap-2">
              {editingTitle ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { setPlanTitle(titleDraft); setEditingTitle(false); }
                      if (e.key === 'Escape') { setEditingTitle(false); }
                    }}
                    className="flex-1 px-2 py-1 text-lg font-semibold rounded border border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => { setPlanTitle(titleDraft); setEditingTitle(false); }}
                    className="p-1 text-primary hover:bg-primary/10 rounded"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="flex-1 text-lg font-semibold leading-tight">{planTitle}</h2>
                  <button
                    onClick={() => { setTitleDraft(planTitle); setEditingTitle(true); }}
                    className="p-1 text-muted-foreground hover:text-foreground rounded"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                PDF
              </button>
              <button
                onClick={handleDownloadDOCX}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                DOCX
              </button>
              <button
                onClick={handleSaveToHistory}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : saveSuccess ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saveSuccess ? 'Saved!' : savedPlanId ? 'Save Changes' : 'Save to History'}
              </button>
              <button
                onClick={() => { setMoveError(null); setMoveSuccess(null); setShowMoveModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Move to Course
              </button>
            </div>

            {/* Sections */}
            <div className="space-y-3">
              {sections.map(section => {
                const state = sectionStates[section.id] || { open: false, instruction: '', refining: false };
                return (
                  <div key={section.id} className="rounded-lg border border-border bg-card overflow-hidden">
                    {/* Section header */}
                    <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{section.heading}</h3>
                      <button
                        onClick={() => setSectionStates(prev => ({
                          ...prev,
                          [section.id]: { ...state, open: !state.open },
                        }))}
                        className={`flex items-center gap-1 text-xs transition-colors ${
                          state.open
                            ? 'text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Refine
                        {state.open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>

                    {/* Body: content + refine panel side-by-side, top-aligned */}
                    <div className="flex items-start">
                      <div className="flex-1 min-w-0 px-4 py-3 text-sm text-foreground leading-relaxed">
                        {renderMarkdown(section.content)}
                      </div>

                      {state.open && (
                        <div className="w-72 shrink-0 border-l border-border bg-muted/10 px-3 py-3 flex flex-col gap-2">
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            What should change?
                          </p>
                          <textarea
                            autoFocus
                            rows={5}
                            value={state.instruction}
                            onChange={e => setSectionStates(prev => ({
                              ...prev,
                              [section.id]: { ...state, instruction: e.target.value },
                            }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                handleRefineSection(section.id);
                              }
                            }}
                            placeholder={`e.g. "Add more pair-work activities" or "Simplify the vocabulary level"`}
                            className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                          />
                          <button
                            onClick={() => handleRefineSection(section.id)}
                            disabled={state.refining || !state.instruction.trim()}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                          >
                            {state.refining ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ArrowRight className="w-3.5 h-3.5" />
                            )}
                            {state.refining ? 'Refining...' : 'Apply (⌘↵)'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Global chat */}
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                Regenerate entire plan with feedback
              </p>
              <div className="flex items-start gap-2">
                <textarea
                  rows={2}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="e.g. Make the activities more communicative, reduce grammar metalanguage, add a role-play scenario"
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
                <button
                  onClick={handleChatRefine}
                  disabled={chatRefining || !chatInput.trim()}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {chatRefining ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Regenerate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Move to Course Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-base font-semibold mb-1">Move to Course</h3>
            <p className="text-xs text-muted-foreground mb-4">
              The lesson plan will be exported as PDF and added to the selected course.
            </p>

            {moveSuccess ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm">
                <Check className="w-4 h-4" />
                {moveSuccess}
              </div>
            ) : courses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No courses found. Create a course first.</p>
            ) : (
              <ul className="space-y-2 max-h-60 overflow-y-auto">
                {courses.map(course => (
                  <li key={course.id}>
                    <button
                      onClick={() => handleMoveToCourse(course.id)}
                      disabled={movingToCourse}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-border hover:bg-muted text-left transition-colors disabled:opacity-50"
                    >
                      {movingToCourse ? (
                        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                      ) : (
                        <BookOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{course.name}</p>
                        {course.description && (
                          <p className="text-xs text-muted-foreground truncate">{course.description}</p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {moveError && (
              <p className="mt-3 text-xs text-destructive">{moveError}</p>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowMoveModal(false)}
                disabled={movingToCourse}
                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
