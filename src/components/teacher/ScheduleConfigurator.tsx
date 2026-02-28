"use client";

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { updateZoomUrl } from '@/lib/supabase/queries/sessions';
import { Video } from 'lucide-react';

interface ScheduleConfiguratorProps {
  classId: string;
  meetUrl: string;
  onUrlSaved?: () => void;
}

export default function ScheduleConfigurator({
  classId,
  meetUrl,
  onUrlSaved,
}: ScheduleConfiguratorProps) {
  const [zoomUrl, setZoomUrl] = useState(meetUrl || '');
  const [saved, setSaved] = useState(false);
  const urlRef = useRef(meetUrl || '');

  const handleUrlBlur = async () => {
    const trimmed = zoomUrl.trim();
    if (trimmed === urlRef.current) return;
    urlRef.current = trimmed;

    const ok = await updateZoomUrl(supabase, classId, trimmed);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUrlSaved?.();
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
      <div className="mb-1">
        <label className="text-xs font-medium text-slate-500 mb-1 block">Zoom Link</label>
        <div className="relative">
          <Video className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="url"
            value={zoomUrl}
            onChange={(e) => setZoomUrl(e.target.value)}
            onBlur={handleUrlBlur}
            placeholder="https://zoom.us/j/..."
            className="w-full pl-9 pr-16 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {saved && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600 font-medium">
              Saved
            </span>
          )}
        </div>
        {zoomUrl && (
          <a
            href={zoomUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-600 hover:text-indigo-700 mt-1 inline-block"
          >
            Open Zoom link
          </a>
        )}
      </div>
    </div>
  );
}
