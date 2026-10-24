'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal Web Speech API typings (not in every TS dom lib).
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SRAlternative;
}
interface SRResultEvent {
  resultIndex: number;
  results: { length: number; [index: number]: SRResult };
}
interface SRErrorEvent {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SRResultEvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SpeechRecognitionLike;

export type DictationStatus = 'idle' | 'live' | 'simulated';

const NOTICES: Record<string, string> = {
  unsupported: 'Live dictation isn’t supported in this browser — showing a simulated waveform. Keep typing your note.',
  'not-allowed': 'Microphone permission was denied — showing a simulated waveform. Keep typing your note.',
  'service-not-allowed': 'Speech service is blocked here — showing a simulated waveform. Keep typing your note.',
  'audio-capture': 'No microphone detected — showing a simulated waveform. Keep typing your note.',
  network: 'Speech service unreachable (offline) — showing a simulated waveform. Keep typing your note.',
};

function joinText(base: string, add: string): string {
  const a = add.trim();
  if (!a) return base;
  if (!base) return a;
  return /\s$/.test(base) ? base + a : `${base} ${a}`;
}

/**
 * Browser speech-to-text for the pin popover. `onText` receives the full composed text
 * (base text at start + final + interim results) on every result, so interim words appear live.
 */
export function useDictation(onText: (text: string) => void) {
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const cbRef = useRef(onText);
  cbRef.current = onText;

  const fallback = useCallback((reason: string) => {
    recRef.current = null;
    setStatus('simulated');
    setNotice(NOTICES[reason] ?? NOTICES.unsupported);
  }, []);

  const stop = useCallback(() => {
    const r = recRef.current;
    recRef.current = null;
    if (r) {
      r.onend = null;
      r.onresult = null;
      r.onerror = null;
      try {
        r.stop();
      } catch {
        // already stopped
      }
    }
    setStatus('idle');
  }, []);

  const start = useCallback(
    (base: string) => {
      const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
      const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!Ctor) {
        fallback('unsupported');
        return;
      }
      let rec: SpeechRecognitionLike;
      try {
        rec = new Ctor();
      } catch {
        fallback('unsupported');
        return;
      }
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || 'en-US';
      let finalText = '';
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText = joinText(finalText, r[0].transcript);
          else interim = joinText(interim, r[0].transcript);
        }
        cbRef.current(joinText(base, joinText(finalText, interim)));
      };
      rec.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        fallback(e.error);
      };
      rec.onend = () => {
        if (recRef.current === rec) {
          recRef.current = null;
          setStatus('idle');
        }
      };
      try {
        rec.start();
        recRef.current = rec;
        setNotice(null);
        setStatus('live');
      } catch {
        fallback('unsupported');
      }
    },
    [fallback],
  );

  useEffect(
    () => () => {
      const r = recRef.current;
      recRef.current = null;
      try {
        r?.abort();
      } catch {
        // ignore
      }
    },
    [],
  );

  return { status, notice, start, stop };
}
