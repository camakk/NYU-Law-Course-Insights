import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Keep the existing JSON as the single source of truth, but embed its contents
// into the initial JavaScript bundle instead of fetching it at runtime.
export default function bundledEvaluations() {
  const source = fileURLToPath(new URL('./public/data/evaluations.json', import.meta.url));
  const moduleId = 'virtual:course-evaluations';
  const resolvedId = `\0${moduleId}`;
  return {
    name: 'bundled-course-evaluations',
    resolveId(id) {
      if (id === moduleId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      this.addWatchFile(source);
      const data = JSON.parse(readFileSync(source, 'utf8'));
      if (!Array.isArray(data.records) || !Array.isArray(data.questions) || !Array.isArray(data.sourceNotes)) {
        throw new Error('Evaluation file is malformed.');
      }
      return `export default ${JSON.stringify(data)};`;
    },
  };
}
