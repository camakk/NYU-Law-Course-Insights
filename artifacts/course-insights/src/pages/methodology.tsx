import { fmtInt, LOW_SAMPLE, useDataset } from '@/lib/data';
import { PageError, PageLoading, useTitle } from '@/components/kit';

export default function MethodologyPage() {
  useTitle('Methodology');
  const { data, isLoading, error, refetch } = useDataset();
  if (isLoading) return <PageLoading />;
  if (error || !data) return <PageError error={error} onRetry={() => refetch()} />;
  const inacc = data.records.filter((r) => r.inaccessible).length;
  const zero = data.records.filter((r) => !r.inaccessible && !r.responded).length;
  return (
    <article className="rise max-w-3xl">
      <div className="text-[11px] uppercase tracking-[0.25em] text-primary font-semibold">Methodology</div>
      <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2 mb-6">How the numbers are made</h1>
      <div className="space-y-6 text-[15px] leading-relaxed">
        <section>
          <h2 className="font-display text-2xl mb-2">The ten questions</h2>
          <p className="text-muted-foreground mb-2">Questions 1–6 describe teaching; 7–10 describe the course. Rankings default to question 6 for professors and question 9 for courses.</p>
          <ol className="list-decimal pl-6 space-y-1">{data.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-2">Response weighting</h2>
          <p>Each average is Σ(score × responded) ÷ Σ(responded), taken over offerings with a non-null score, a positive responded count, and an accessible source. The source gives only an offering-level responded count, not per-question respondent counts, so the weighting is an approximation. Scores were already rounded in the source.</p>
          <p className="mt-2">Response totals add offering-level counts. They are not counts of unique students, and they are never summed across questions.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-2">Missing data</h2>
          <p>Missing ratings display as N/A and are excluded, never treated as zero. In this dataset {fmtInt(inacc)} offerings are marked inaccessible and {fmtInt(zero)} have zero or unavailable responses; they remain visible in offering detail but do not affect averages.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-2">Caveats</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Evaluations are subjective student feedback and reflect who chose to respond.</li>
            <li>Averages under {LOW_SAMPLE} offering-level responses are flagged as low sample.</li>
            <li>Courses are identified by exact title; renamed courses appear separately. No course codes or departments are provided.</li>
            <li>Professors are identified by the exact source string. "Last, First" names are displayed as "First Last". Multiple offerings in the same term are kept as separate sections.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-2">Source notes</h2>
          {data.sourceNotes.length ? (
            <ul className="space-y-2">{data.sourceNotes.map((n, i) => <li key={i} className="bg-card border rounded-lg p-3 text-sm">{n}</li>)}</ul>
          ) : <p className="text-muted-foreground">No source notes were provided.</p>}
        </section>
      </div>
    </article>
  );
}
