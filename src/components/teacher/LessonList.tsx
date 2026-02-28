"use client";

import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Lesson, ExtractedLessonContent, LessonExercises } from '@/lib/types';
import { GripVertical, Pencil, Trash2, FileText, Check, X, Eye, ExternalLink, ChevronUp, CheckCircle, Zap } from 'lucide-react';
import LessonContentExtractor from '@/components/homework/teacher/LessonContentExtractor';

interface LessonListProps {
  lessons: Lesson[];
  onReorder: (lessons: Lesson[]) => void;
  onRename: (lessonId: string, newTitle: string) => void;
  onDelete: (lessonId: string) => void;
  pdfUrls?: Record<string, string>;
  // Homework extraction props (optional — only shown when classId+sessionId provided)
  classId?: string;
  sessionId?: string;
  extractedContents?: Record<string, ExtractedLessonContent>;
  exerciseData?: Record<string, LessonExercises>;
  onContentExtracted?: (lessonId: string, content: ExtractedLessonContent) => void;
  onExercisesGenerated?: (lessonId: string, exercises: LessonExercises) => void;
}

interface SortableLessonProps {
  lesson: Lesson;
  index: number;
  onRename: (lessonId: string, newTitle: string) => void;
  onDelete: (lessonId: string) => void;
  pdfUrl?: string;
  isPreviewOpen: boolean;
  onTogglePreview: (lessonId: string) => void;
  // Homework extraction (optional)
  classId?: string;
  sessionId?: string;
  extractedContent?: ExtractedLessonContent;
  exerciseDataItem?: LessonExercises;
  onContentExtracted?: (lessonId: string, content: ExtractedLessonContent) => void;
  onExercisesGenerated?: (lessonId: string, exercises: LessonExercises) => void;
}

function SortableLesson({ lesson, index, onRename, onDelete, pdfUrl, isPreviewOpen, onTogglePreview, classId, sessionId, extractedContent, exerciseDataItem, onContentExtracted, onExercisesGenerated }: SortableLessonProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(lesson.title);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSave = () => {
    if (title.trim()) {
      onRename(lesson.id, title.trim());
    } else {
      setTitle(lesson.title);
    }
    setEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-4 py-3 group ${
        isDragging ? 'opacity-50 shadow-lg z-10' : ''
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical className="w-5 h-5" />
      </button>

      {/* Order number */}
      <span className="text-xs font-mono text-slate-400 w-6 text-center shrink-0">
        {index + 1}
      </span>

      {/* PDF icon */}
      <FileText className={`w-4 h-4 shrink-0 ${lesson.pdf_path ? 'text-red-500' : 'text-slate-300'}`} />

      {/* Title */}
      {editing ? (
        <div className="flex items-center gap-2 flex-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') { setTitle(lesson.title); setEditing(false); }
            }}
          />
          <button onClick={handleSave} className="text-green-600 hover:text-green-700">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => { setTitle(lesson.title); setEditing(false); }} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <span className="flex-1 text-sm text-slate-700 truncate">{lesson.title}</span>
      )}

      {/* File name badge */}
      {lesson.pdf_file_name && !editing && (
        <span className="text-xs text-slate-400 truncate max-w-32 hidden sm:block">
          {lesson.pdf_file_name}
        </span>
      )}

      {/* Homework status chips */}
      {!editing && onContentExtracted && (
        <>
          {extractedContent?.extractionStatus === 'DONE' && exerciseDataItem?.generationStatus !== 'DONE' && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 shrink-0 hidden sm:inline-flex">
              <CheckCircle className="w-3 h-3" />
              Extracted
            </span>
          )}
          {exerciseDataItem?.generationStatus === 'DONE' && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 shrink-0 hidden sm:inline-flex">
              <Zap className="w-3 h-3" />
              Exercises ready
            </span>
          )}
        </>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
          {pdfUrl && (
            <button
              onClick={() => onTogglePreview(lesson.id)}
              className={`p-1 ${isPreviewOpen ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-600'}`}
              title={isPreviewOpen ? 'Close preview' : 'Preview PDF'}
            >
              {isPreviewOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            className="text-slate-400 hover:text-slate-600 p-1"
            title="Rename"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this lesson?')) onDelete(lesson.id);
            }}
            className="text-slate-400 hover:text-red-500 p-1"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* PDF Preview (expanded) */}
      {isPreviewOpen && pdfUrl && (
        <div className="col-span-full w-full border-t border-slate-200 bg-slate-50 px-4 py-4 mt-3 -mx-4 -mb-3 rounded-b-lg"
          style={{ width: 'calc(100% + 2rem)' }}
        >
          <div className="flex justify-end mb-2">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in new tab
            </a>
          </div>
          <iframe
            src={pdfUrl}
            className="w-full rounded-lg border border-slate-200"
            style={{ height: '60vh' }}
            title={lesson.title}
          />
        </div>
      )}

      {/* Homework content extraction (shown whenever lesson has a PDF and handler is provided) */}
      {lesson.pdf_path && onContentExtracted && (
        <div className="w-full -mx-4 px-4" style={{ width: 'calc(100% + 2rem)' }}>
          <LessonContentExtractor
            lessonId={lesson.id}
            lessonTitle={lesson.title}
            pdfPath={lesson.pdf_path}
            classId={classId}
            sessionId={sessionId}
            extractedContent={extractedContent || null}
            exerciseData={exerciseDataItem || null}
            onExtracted={(content) => onContentExtracted(lesson.id, content)}
            onGenerated={onExercisesGenerated ? (exercises) => onExercisesGenerated(lesson.id, exercises) : undefined}
          />
        </div>
      )}
    </div>
  );
}

const LessonList: React.FC<LessonListProps> = ({
  lessons, onReorder, onRename, onDelete, pdfUrls = {},
  classId, sessionId, extractedContents = {}, exerciseData = {},
  onContentExtracted, onExercisesGenerated,
}) => {
  const [previewLessonId, setPreviewLessonId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleTogglePreview = (lessonId: string) => {
    setPreviewLessonId(prev => prev === lessonId ? null : lessonId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = lessons.findIndex(l => l.id === active.id);
    const newIndex = lessons.findIndex(l => l.id === over.id);
    const reordered = arrayMove(lessons, oldIndex, newIndex);
    onReorder(reordered);
  };

  if (lessons.length === 0) {
    return (
      <div className="text-center py-10 bg-white rounded-xl border border-slate-200">
        <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No lessons yet. Upload PDF files to add lessons.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">
        Lessons ({lessons.length})
      </h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={lessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {lessons.map((lesson, index) => (
              <SortableLesson
                key={lesson.id}
                lesson={lesson}
                index={index}
                onRename={onRename}
                onDelete={onDelete}
                pdfUrl={pdfUrls[lesson.id]}
                isPreviewOpen={previewLessonId === lesson.id}
                onTogglePreview={handleTogglePreview}
                classId={classId}
                sessionId={sessionId}
                extractedContent={extractedContents[lesson.id]}
                exerciseDataItem={exerciseData[lesson.id]}
                onContentExtracted={onContentExtracted}
                onExercisesGenerated={onExercisesGenerated}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default LessonList;
