interface BadgeProps {
  children: React.ReactNode;
  tone?: 'violet' | 'cyan' | 'emerald' | 'amber' | 'neutral';
  className?: string;
}

const tones: Record<NonNullable<BadgeProps['tone']>, string> = {
  violet: 'border-aurora-violet/40 bg-aurora-violet/10 text-violet-300',
  cyan: 'border-aurora-cyan/40 bg-aurora-cyan/10 text-cyan-300',
  emerald: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  amber: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  neutral: 'border-white/10 bg-white/5 text-slate-300',
};

export function Badge({ children, tone = 'neutral', className = '' }: BadgeProps) {
  return (
    <span className={`chip ${tones[tone]} ${className}`}>{children}</span>
  );
}
