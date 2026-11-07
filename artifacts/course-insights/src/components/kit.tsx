import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, RotateCcw, Search, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fmt, fmtInt, LOW_SAMPLE, scoreTone } from '@/lib/data';

export function useTitle(t: string) {
  useEffect(() => {
    document.title = t ? `${t} · NYU Course Insights` : 'NYU Course Insights';
  }, [t]);
}

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/professors', label: 'Professors' },
  { href: '/courses', label: 'Courses' },
  { href: '/after-exam', label: 'After the exam' },
];

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="bg-sidebar text-sidebar-foreground sticky top-0 z-40 border-b border-sidebar-border">
        <div className="mx-auto max-w-7xl w-full px-4 md:px-6 lg:px-8 min-h-14 py-2 flex flex-wrap items-center gap-x-3 gap-y-2 lg:gap-x-6 lg:py-0">
          <Link href="/" className="flex items-baseline gap-2 shrink-0" data-testid="link-home">
            <span className="font-display text-xl font-semibold">Course Insights</span>
            <span className="hidden md:inline text-[11px] uppercase tracking-[0.2em] text-sidebar-primary">NYU Law</span>
          </Link>
          <nav aria-label="Main navigation" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 text-sm">
            {NAV.map((n) => {
              const active = n.href === '/' ? loc === '/' : loc.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  data-testid={`link-nav-${n.label.toLowerCase()}`}
                  className={cn(
                    'relative px-2 py-1.5 lg:px-3 rounded-md whitespace-nowrap transition-colors',
                    active ? 'text-sidebar-primary' : 'text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                  )}
                >
                  {n.label}
                  {active && <span className="absolute left-2 right-2 -bottom-1 h-0.5 bg-sidebar-primary rounded-full lg:left-3 lg:right-3" />}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 md:px-8 py-8 md:py-12">{children}</main>
      <footer className="border-t mt-12">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-6 text-xs text-muted-foreground flex flex-wrap justify-between gap-2">
          <span>Historical student evaluations, read-only. Ratings on a 1–5 scale.</span>
          <Link href="/methodology" className="underline underline-offset-4 hover:text-primary">How scores are calculated</Link>
        </div>
      </footer>
    </div>
  );
}

export function Score({ v, size = 'md', testId }: { v: number | null; size?: 'sm' | 'md' | 'lg'; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'num inline-flex items-center justify-center rounded font-semibold',
        scoreTone(v),
        size === 'sm' && 'text-[11px] min-w-[2.6rem] h-5 px-1',
        size === 'md' && 'text-sm min-w-[3.2rem] h-7 px-1.5',
        size === 'lg' && 'text-2xl min-w-[5rem] h-12 px-3',
      )}
      title={v == null ? 'No usable rating' : `${v.toFixed(2)} / 5`}
    >
      {fmt(v)}
    </span>
  );
}

export function LowSample({ responses }: { responses: number }) {
  if (responses >= LOW_SAMPLE || responses === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-accent-foreground bg-accent px-1.5 py-0.5 rounded" title={`Fewer than ${LOW_SAMPLE} offering-level responses`}>
      <AlertTriangle className="h-3 w-3" /> low sample
    </span>
  );
}

export function SearchBox({ value, onChange, placeholder, testId }: { value: string; onChange: (v: string) => void; placeholder: string; testId: string }) {
  return (
    <label className="relative flex-1 min-w-[220px] group">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="w-full h-11 pl-9 pr-9 rounded-lg bg-card border border-input text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted" aria-label="Clear search" data-testid={`${testId}-clear`}>
          <X className="h-4 w-4" />
        </button>
      )}
    </label>
  );
}

export function NativeSelect({ value, onChange, children, label, testId }: { value: string; onChange: (v: string) => void; children: ReactNode; label: string; testId: string }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="h-11 rounded-lg bg-card border border-input px-3 text-sm normal-case tracking-normal text-foreground outline-none focus:border-primary cursor-pointer"
      >
        {children}
      </select>
    </label>
  );
}

export function PageLoading() {
  return (
    <div className="space-y-6" data-testid="status-loading">
      <Skeleton className="h-10 w-2/3 max-w-lg" />
      <Skeleton className="h-4 w-1/2 max-w-md" />
      <div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12" />)}
    </div>
  );
}

export function PageError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="max-w-lg mx-auto text-center py-20" data-testid="status-error">
      <p className="font-display text-3xl mb-2">The archive did not open.</p>
      <p className="text-muted-foreground text-sm mb-6">{error instanceof Error ? error.message : 'Unknown error loading evaluations.'}</p>
      <button onClick={onRetry} data-testid="button-retry" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[.98] transition">
        <RotateCcw className="h-4 w-4" /> Try again
      </button>
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="border border-dashed rounded-xl py-14 px-6 text-center" data-testid="status-empty">
      <p className="font-display text-2xl">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-1">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function NotFoundEntity({ kind }: { kind: string }) {
  return (
    <Empty
      title={`No ${kind} at this address.`}
      hint="The link may be outdated or mistyped."
      action={<Link href={kind === 'professor' ? '/professors' : '/courses'} className="text-primary underline underline-offset-4">Browse all {kind === 'professor' ? 'professors' : 'courses'}</Link>}
    />
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function LoadMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-4 mt-4 text-sm text-muted-foreground">
      <span className="num">Showing {fmtInt(Math.min(shown, total))} of {fmtInt(total)}</span>
      {shown < total && (
        <div className="flex gap-2">
          <button onClick={onMore} data-testid="button-load-more" className="h-9 px-4 rounded-lg border bg-card hover:border-primary hover:text-primary transition">Show 100 more</button>
        </div>
      )}
    </div>
  );
}

export interface BarDatum { name: string; value: number; responses: number; offerings: number; href?: string }

export function RankBars({ data, onSelect, metricLabel }: { data: BarDatum[]; onSelect?: (d: BarDatum) => void; metricLabel: string }) {
  const h = Math.max(120, data.length * 34 + 40);
  return (
    <div style={{ height: h }} className="w-full" data-testid="chart-ranking">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={190}
            interval={0}
            tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
            tickFormatter={(v: string) => (v.length > 28 ? v.slice(0, 26) + '...' : v)}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--secondary))' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as BarDatum;
              return (
                <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs max-w-xs">
                  <div className="font-semibold text-sm mb-1">{d.name}</div>
                  <div className="text-muted-foreground mb-1">{metricLabel}</div>
                  <div className="num text-base font-semibold text-primary">{d.value.toFixed(2)} / 5</div>
                  <div className="num text-muted-foreground">{fmtInt(d.responses)} responses · {d.offerings} offering{d.offerings === 1 ? '' : 's'}</div>
                  {d.responses < LOW_SAMPLE && <div className="mt-1 text-accent-foreground">Low sample, interpret cautiously</div>}
                </div>
              );
            }}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            barSize={18}
            onClick={(d: unknown) => onSelect?.((d as { payload: BarDatum }).payload)}
            className={onSelect ? 'cursor-pointer' : ''}
            label={{ position: 'right', fontSize: 11, fill: 'hsl(var(--foreground))', formatter: (v: number) => v.toFixed(2) }}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.responses < LOW_SAMPLE ? 'hsl(38 88% 58%)' : 'hsl(var(--chart-1))'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
