"use client";

import React, { useRef, useState } from 'react';
import { Upload, FileText } from 'lucide-react';

interface LessonUploaderProps {
  onUpload: (files: File[]) => Promise<void>;
  uploading: boolean;
}

const LessonUploader: React.FC<LessonUploaderProps> = ({ onUpload, uploading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const handleFiles = (fileList: FileList) => {
    const pdfs = Array.from(fileList).filter(f => f.type === 'application/pdf');
    if (pdfs.length === 0) return;
    setPendingFiles(pdfs);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleConfirmUpload = async () => {
    if (pendingFiles.length === 0) return;
    await onUpload(pendingFiles);
    setPendingFiles([]);
  };

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
          dragOver
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-slate-300 hover:border-slate-400 bg-white'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <Upload className={`w-8 h-8 mx-auto mb-2 ${dragOver ? 'text-indigo-500' : 'text-slate-400'}`} />
        <p className="text-sm text-slate-600 font-medium">
          Drop PDF files here or click to browse
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Lesson titles will be auto-generated from file names
        </p>
      </div>

      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-700 mb-3">
            {pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''} ready to upload
          </p>
          <div className="space-y-2 mb-4">
            {pendingFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                <FileText className="w-4 h-4 text-red-500 shrink-0" />
                <span className="truncate">{file.name}</span>
                <span className="text-xs text-slate-400 shrink-0">
                  ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmUpload}
              disabled={uploading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition text-sm font-medium"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <button
              onClick={() => setPendingFiles([])}
              disabled={uploading}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LessonUploader;
