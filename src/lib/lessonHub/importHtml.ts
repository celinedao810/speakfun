// Read the data block out of an E4IT hub HTML file (the teacher's own files).
// The block runs from `let COURSE =` to the first renderer line `const $ =` and is
// plain object literals, so it is evaluated in isolation and returned.

import type { Hub, Topic } from './types';

export interface ImportedHub {
  fileName: string;
  hub: Hub;
  topics: Topic[];
}

export function parseHubHtml(html: string, fileName: string): ImportedHub {
  const start = html.indexOf('let COURSE');
  const end = html.indexOf('const $ =', start);
  if (start < 0 || end < 0) throw new Error(`${fileName}: no E4IT data block found`);
  const decl = html.slice(start, end);
  const names = [...decl.matchAll(/^\s*(?:let\s+)?([A-Z_]+)\s*=/gm)].map(m => m[1]);
  if (!names.includes('TOPICS')) throw new Error(`${fileName}: TOPICS not found`);

  // eslint-disable-next-line no-new-func
  const data = new Function(`${decl}; return {${names.join(',')}};`)() as Record<string, any>;

  const hub: Hub = {
    course: data.COURSE,
    project: data.PROJECT,
    grouping: data.GROUPING ?? { whole: null, teacher: 0, solo: 1 },
    phases: data.PHASES,
    plan: data.PLAN,
    tracks: data.TRACKS,
    soon: data.SOON ?? {},
    rules: data.RULES,
  };
  return { fileName, hub, topics: data.TOPICS as Topic[] };
}

/** One-line fingerprint used to tell versions of the same topic apart in the picker. */
export function topicSummary(t: Topic): string {
  if (t.rounds) {
    const parts = t.rounds.reduce((n, r) => n + (r.parts?.length ?? 0), 0);
    return `${t.rounds.length} rounds · ${parts} parts`;
  }
  const bits = [
    `${t.vocabulary?.length ?? 0} words`,
    `${t.structures?.length ?? 0} frames`,
    `${t.dialogue?.lines.length ?? 0} lines`,
  ];
  if (t.scenes) bits.push(`${t.scenes.length} scene${t.scenes.length > 1 ? 's' : ''}`);
  if (t.flow) bits.push('flow sketch');
  return bits.join(' · ');
}
