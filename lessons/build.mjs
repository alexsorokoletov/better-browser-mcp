// Render lessons (committed: lessons.jsonl; optional local: ../local/lessons.local.jsonl) into markdown:
// lessons.md (all lessons) and models.md (bias profile per model). Usage: node lessons/build.mjs [--local]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const read = (u) => (existsSync(u) ? readFileSync(u, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const local = process.argv.includes('--local');
const L = [...read(new URL('./lessons.jsonl', import.meta.url)), ...(local ? read(new URL('../local/lessons.local.jsonl', import.meta.url)) : [])];
const outDir = local ? new URL('../local/', import.meta.url) : new URL('./', import.meta.url);
let md = `# Lessons (${L.length})\n\nDecision key: **tool** = change the tool so every model succeeds; **prompt** = tell the model; **harness** = infra.\n\n| id | models | area | decision | status | symptom |\n|---|---|---|---|---|---|\n`;
for (const l of L) md += `| ${l.id} | ${l.models.join(', ')} | ${l.area} | ${l.decision} | ${l.status} | ${l.symptom.slice(0, 110)} |\n`;
for (const l of L) {
  md += `\n## ${l.id} · ${l.area} · ${l.models.join(', ')}\n\n- Symptom: ${l.symptom}\n- Root cause: ${l.root_cause}\n- Decision: **${l.decision}** — ${l.why}\n- Change: ${l.change}\n- Regression check: ${l.regression}\n- Metric: before ${l.metric?.before} → after ${l.metric?.after}\n- Evidence: ${l.evidence.map((e) => `${e.type}: ${e.ref}`).join('; ')}\n- Status: ${l.status} (${l.date}, ${l.harness})\n`;
}
writeFileSync(new URL('lessons.md', outDir), md);
const models = [...new Set(L.flatMap((l) => l.models))];
let pm = '# Model bias profiles\n\nGenerated from lessons. `*` = applies to all models.\n';
for (const m of models) {
  const ls = L.filter((l) => l.models.includes(m));
  pm += `\n## ${m}\n\n` + ls.map((l) => `- [${l.id}] (${l.decision}) ${l.symptom}`).join('\n') + '\n';
}
writeFileSync(new URL('models.md', outDir), pm);
console.log(`${L.length} lessons, ${models.length} model profiles -> ${outDir.pathname}`);
