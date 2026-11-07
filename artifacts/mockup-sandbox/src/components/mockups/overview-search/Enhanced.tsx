import { useState } from 'react';
import { Search, X } from 'lucide-react';
import './_group.css';

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="overview-search-featured group relative flex-1 min-w-[220px]">
      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary transition-transform group-focus-within:scale-110" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type a professor name or course title"
        aria-label="Search professors and courses"
        className="h-14 w-full rounded-xl border border-primary/30 bg-card pl-12 pr-12 text-base font-medium shadow-sm outline-none transition-all duration-300 placeholder:text-muted-foreground/80 hover:border-primary/50 hover:shadow-md focus:border-primary focus:ring-4 focus:ring-ring/20"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 hover:bg-muted"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </label>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

export function Enhanced() {
  const [query, setQuery] = useState('');

  return (
    <div className="overview-search-preview min-h-screen bg-background p-8 text-foreground">
      <main className="mx-auto max-w-[1216px]">
        <section className="grid items-end gap-10 border-t-[3px] border-double border-foreground/70 pb-10 pt-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">
              The NYU Law Unofficial Course Catalog · Spring 2016 to Spring 2026
            </p>
            <h1 className="mt-4 font-serif text-5xl font-semibold leading-[0.95] md:text-7xl">
              Pick the teacher,<br />
              <span className="italic text-primary">not just the class.</span>
            </h1>
            <p className="mt-5 max-w-xl text-muted-foreground">
              Ten years of student evaluations, organized so you can see who taught a course, how students rated them, and the data behind each number.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Unique Course Offerings" value="7,744" sub="6,558 with student reviews" />
            <StatCard label="NYU Law Professors Reviewed" value="1,215" sub="584 taught in the last three years" />
            <StatCard label="Seminars Reviewed" value="2,996" sub="819 in the last three years" />
            <StatCard label="Clinics Reviewed" value="1,260" sub="350 in the last three years" />
          </div>
        </section>

        <section className="mb-10 mt-0">
          <SearchBox value={query} onChange={setQuery} />
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-serif text-2xl">Most effective teachers</h2>
            <p className="mt-2 text-sm text-muted-foreground">Daniel Harawa · Evidence · Spring 2026</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-serif text-2xl">Most reviewed upperclassman courses</h2>
            <p className="mt-2 text-sm text-muted-foreground">Professional Responsibility and the Regulation of Lawyers</p>
          </div>
        </section>
      </main>
    </div>
  );
}
