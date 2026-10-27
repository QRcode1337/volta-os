'use client';

// VOLTA Editor — Edit mode preview: one visual layer (video / image / colour / text). Rendered keyed by clip id so a
// pooled <video> survives layer-list changes; hidden (visibility) while it is only primed for an upcoming cut.
import { AlertTriangle } from 'lucide-react';
import { memo, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { FONT_STACK } from '@/lib/nle/model';
import type { NleClip, NleTextStyle } from '@/types/nle';
import { placeTransform, type LayerGeom } from './geometry';

export interface LayerViewProps {
  clip: NleClip;
  /** null = pooled (preloading) but not part of the picture right now. */
  geom: LayerGeom | null;
  z: number;
  fw: number;
  fh: number;
  /** Display scale: displayed frame width / sequence width. */
  k: number;
  mediaRef?: (el: HTMLMediaElement | null) => void;
  innerRef?: (el: HTMLDivElement | null) => void;
  error: boolean;
  onMediaError: (id: string) => void;
  onMediaOk: (id: string) => void;
  onSeeked: (el: HTMLMediaElement) => void;
  editing: boolean;
  /** Inline text edit finished: new content, or null when cancelled. */
  onTextDone: (id: string, content: string | null) => void;
}

/** Shared text styling (preview + inline editor) at display scale k. */
export function textCss(st: NleTextStyle, k: number, fw: number): CSSProperties {
  const px = st.size * k;
  return {
    fontFamily: FONT_STACK[st.font] ?? FONT_STACK.Inter,
    fontSize: px,
    fontWeight: st.weight,
    fontStyle: st.italic ? 'italic' : 'normal',
    color: st.color,
    textAlign: st.align,
    letterSpacing: st.letterSpacing ? st.letterSpacing * k : 0,
    lineHeight: 1.2,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    // export draws the outline strokeWidth px OUTSIDE the glyphs: paint-order stroke-under-fill with a 2× CSS stroke matches it
    WebkitTextStroke: st.stroke && st.strokeWidth > 0 ? `${(st.strokeWidth * 2 * k).toFixed(2)}px ${st.stroke}` : undefined,
    paintOrder: 'stroke fill',
    background: st.background ?? undefined,
    padding: st.background ? `${(0.18 * px).toFixed(2)}px ${(0.35 * px).toFixed(2)}px` : 0,
    borderRadius: st.background ? 0.12 * px : 0,
    width: 'max-content',
    maxWidth: fw * 0.9,
    minWidth: Math.max(4, px * 0.3),
    minHeight: px * 1.2,
  };
}

function EditableText({ clip, style, onDone }: { clip: NleClip; style: CSSProperties; onDone: (content: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const initial = useRef(clip.text?.content ?? '');
  const latest = useRef(initial.current);
  const cancelled = useRef(false);
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // (re)armed on every mount: StrictMode runs this effect twice
    done.current = false;
    cancelled.current = false;
    el.innerText = latest.current;
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      const r = document.createRange();
      r.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    return () => {
      // closed without a blur (seek / undo / unmount): keep what was typed, after this commit settles
      if (done.current || cancelled.current) return;
      done.current = true;
      if (latest.current !== initial.current) {
        const text = latest.current;
        const cb = onDoneRef.current;
        setTimeout(() => cb(text), 0);
      }
    };
  }, []);
  const read = () => (ref.current ? ref.current.innerText.replace(/\n$/, '') : latest.current);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone(cancelled.current ? null : read());
  };
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label="Edit text"
      aria-multiline
      className="cursor-text outline-none"
      style={{ ...style, pointerEvents: 'auto', userSelect: 'text', WebkitUserSelect: 'text', caretColor: '#FF5500', boxShadow: '0 0 0 1px #FF5500' }}
      onInput={() => {
        latest.current = read();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelled.current = true;
          finish();
          ref.current?.blur();
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          finish();
          ref.current?.blur();
        }
      }}
      onBlur={finish}
    />
  );
}

function LayerViewImpl(p: LayerViewProps) {
  const { clip, geom, fw, fh, k } = p;
  // fh only sizes the hidden placeholder box
  const visible = !!geom && geom.opacity > 0.001;
  const wrapper: CSSProperties = {
    zIndex: p.z,
    visibility: geom ? 'visible' : 'hidden',
    clipPath: geom?.reveal ? `inset(0 ${((1 - geom.reveal[1]) * 100).toFixed(3)}% 0 ${(geom.reveal[0] * 100).toFixed(3)}%)` : undefined,
  };
  const inner: CSSProperties = geom
    ? {
        width: geom.w ?? undefined,
        height: geom.h ?? undefined,
        transform: placeTransform(geom),
        opacity: p.editing ? 1 : geom.opacity,
        willChange: 'transform, opacity',
      }
    : { width: fw, height: fh, opacity: 0 };
  const mediaStyle: CSSProperties = { width: '100%', height: '100%', objectFit: 'fill', filter: geom?.filter !== 'none' ? geom?.filter : undefined, display: 'block' };

  let body: React.ReactNode = null;
  if (clip.kind === 'video') {
    body = (
      <video
        ref={p.mediaRef}
        src={clip.src ?? undefined}
        preload="auto"
        playsInline
        muted
        disablePictureInPicture
        style={mediaStyle}
        onSeeked={(e) => p.onSeeked(e.currentTarget)}
        onError={() => p.onMediaError(clip.id)}
        onLoadedData={() => p.onMediaOk(clip.id)}
      />
    );
  } else if (clip.kind === 'image') {
    body = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={clip.src ?? undefined} alt={clip.name} draggable={false} decoding="async" style={mediaStyle} onError={() => p.onMediaError(clip.id)} onLoad={() => p.onMediaOk(clip.id)} />
    );
  } else if (clip.kind === 'color') {
    body = <div style={{ ...mediaStyle, background: clip.color ?? '#111111' }} />;
  } else if (clip.kind === 'text' && clip.text) {
    const css = textCss(clip.text, k, fw);
    if (p.editing) body = <EditableText clip={clip} style={css} onDone={(c) => p.onTextDone(clip.id, c)} />;
    else {
      const content = geom?.chars != null ? clip.text.content.slice(0, geom.chars) : clip.text.content;
      body = <div style={{ ...css, filter: geom?.filter !== 'none' ? geom?.filter : undefined }}>{content || '​'}</div>;
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0" style={wrapper} aria-hidden={!visible} data-clip={clip.id}>
      <div ref={p.innerRef} className="absolute left-0 top-0" style={inner}>
        {body}
        {geom?.wash && geom.wash.alpha > 0 && <div className="absolute inset-0" style={{ background: geom.wash.color, opacity: Math.min(1, geom.wash.alpha) }} />}
        {p.error && (
          <div className="absolute inset-0 flex items-start justify-start bg-[#140808]/80 p-1.5">
            <span className="inline-flex items-center gap-1 rounded bg-[#EF4444] px-1.5 py-0.5 font-mono text-[9px] font-bold text-white shadow" style={{ transform: geom ? `scale(${(1 / Math.max(0.05, geom.s)).toFixed(3)})` : undefined, transformOrigin: 'top left' }}>
              <AlertTriangle size={10} /> MEDIA OFFLINE · {clip.name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export const LayerView = memo(LayerViewImpl);
