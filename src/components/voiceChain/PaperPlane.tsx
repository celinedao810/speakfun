"use client";

import React from 'react';
import { Send } from 'lucide-react';
import FunLoading from './FunLoading';

/** Paper plane flying off along a dashed trail while a message is delivered and scored. */
export default function PaperPlane() {
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-sm h-36 overflow-hidden" aria-hidden>
        <svg viewBox="0 0 360 140" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <path
            d="M -10 130 C 80 120, 120 40, 200 70 S 300 60, 380 -10"
            fill="none"
            stroke="var(--primary)"
            strokeOpacity="0.45"
            strokeWidth="2"
            strokeLinecap="round"
            className="vc-trail"
            strokeDasharray="6 8"
          />
        </svg>
        <div className="vc-plane absolute left-0 top-0">
          <Send className="w-9 h-9 text-primary drop-shadow" strokeWidth={1.8} />
        </div>
      </div>
      <FunLoading context="scoring" className="py-2" />
    </div>
  );
}
