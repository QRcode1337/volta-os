import type { EffortLevel, ModelTier } from '@/types/os';
import { EFFORT_LEVELS, MODEL_COLORS } from '@/lib/mock-data';
import { cn } from '@/lib/cn';

export interface ModelEffortBadgeProps {
  model: ModelTier;
  effort?: EffortLevel;
  /** Override label, e.g. "JEV ROUTED". */
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Color-coded pill: HAIKU green · SONNET teal · OPUS purple · FABLE amber. */
export function ModelEffortBadge({ model, effort, label, size = 'sm', className }: ModelEffortBadgeProps) {
  const color = MODEL_COLORS[model];
  const text = label ?? (effort ? `${model} · ${effort}` : model);
  const level = effort ? EFFORT_LEVELS.indexOf(effort) + 1 : 0; // 1..5
  return (
    <span
      title={effort ? `${model} model · ${effort} effort` : `${model} model`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-mono font-semibold uppercase leading-none tracking-[0.06em]',
        size === 'sm' ? 'h-5 px-2 text-[9px]' : 'h-6 px-2.5 text-[10px]',
        className,
      )}
      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}88` }} />
      {text}
      {size === 'md' && level > 0 && (
        // 5-step effort meter (md only, keeps sm pills compact)
        <span aria-hidden className="ml-0.5 flex items-end gap-[1.5px]">
          {EFFORT_LEVELS.map((_, i) => (
            <span
              key={i}
              className="w-[2px] rounded-[1px]"
              style={{ height: 3 + i * 1.5, background: color, opacity: i < level ? 0.95 : 0.22 }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

export default ModelEffortBadge;
