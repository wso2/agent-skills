#!/usr/bin/env node
// Single entry point for the api-design assessment flow.
//
// Runs Spectral for any combination of {agent readiness, security, design},
// merges in the model's LLM analysis (passed via a file path), assembles the
// final report JSON, generates the self-contained HTML report, prints a
// summary, and optionally opens the HTML in the default browser.
//
// Usage:
//   node assess.js \
//     --spec <spec-file-path> \
//     --skill-dir <absolute-path-to-skill> \
//     --meta '<json-string>' \
//     [--agent] [--security] [--design] \
//     [--ai-issues <path-to-ai-issues.json>] \
//     [--open]

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const { parseArgs } = require('node:util');
const { pathToFileURL } = require('node:url');

const SEVERITY_MAP = { 0: 'CRITICAL', 1: 'HIGH', 2: 'MEDIUM', 3: 'LOW' };
const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
// Per-violation severity penalty, mirrors AI_SEVERITY_PENALTY in the
// api-governance package. Each rule's contribution to the score is the max
// penalty across its violations, so multiple violations of the same rule don't
// double-count.
const SEVERITY_PENALTY = { CRITICAL: 1.0, HIGH: 0.6, MEDIUM: 0.3, LOW: 0.15 };

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

// Tally an issue array by severity and compute a 0..100 score for the dimension.
// Mirrors the per-bucket score in api-governance/src/reports/generate-report.js:
//   score = round( (totalRules − Σ rulePenalty) / totalRules × 100 ), clamped 0..100
//   rulePenalty = max( SEVERITY_PENALTY across that rule's violations )
// Returns { critical, high, medium, low, score }. No rating word — the score is
// the canonical grade; HTML colour-codes by score band.
function computeScore(issues, totalRules) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  // Track the worst-severity penalty for each rule so multiple violations of
  // the same rule contribute at most one rule's worth of penalty.
  const penaltyByRule = new Map();
  for (const issue of issues) {
    const sev = (issue.severity || '').toUpperCase();
    if (sev === 'CRITICAL') counts.critical += 1;
    else if (sev === 'HIGH') counts.high += 1;
    else if (sev === 'MEDIUM') counts.medium += 1;
    else if (sev === 'LOW') counts.low += 1;

    const penalty = SEVERITY_PENALTY[sev] || 0;
    const rule = issue.rule || '';
    if ((penaltyByRule.get(rule) || 0) < penalty) penaltyByRule.set(rule, penalty);
  }

  let score;
  if (!totalRules || totalRules <= 0) {
    score = 100;
  } else {
    let sumPenalty = 0;
    for (const p of penaltyByRule.values()) sumPenalty += p;
    score = Math.round(((totalRules - sumPenalty) / totalRules) * 100);
    if (score < 0) score = 0;
    if (score > 100) score = 100;
  }
  return { ...counts, score };
}

// Extract [major, minor] from a guideline-style rule reference like "Rule 3.3"
// so AI issues can be sorted in the same order as the source guideline categories.
// Falls back to [999, 999] for unrecognised strings so they sort last.
function ruleSortKey(ruleStr) {
  const m = String(ruleStr || '').match(/Rule\s+(\d+)\.(\d+)/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  return [999, 999];
}

// Join a Spectral-style path array (e.g. ["paths", "/orders", "post"]) into the
// dotted display string used in the report ("paths./orders.post").
function pathStr(parts) {
  return (parts || []).map((p) => String(p)).join('.');
}

// Enrich raw Spectral lint results into the report's issue shape.
// Sorts by (path, code) for deterministic output, assigns sequential IDs
// (`<prefix>-NNN`), pulls description / fixSuggestion / autoFixable from the
// metadata file, and resolves severity (metadata override → integer map → HIGH).
// `fallbackPath` is used when a violation has no path (top-level spec issues).
function processSpectral(rawResults, metadata, prefix, fallbackPath) {
  const sorted = [...rawResults].sort((a, b) => {
    const pa = pathStr(a.path);
    const pb = pathStr(b.path);
    if (pa < pb) return -1;
    if (pa > pb) return 1;
    const ca = a.code || '';
    const cb = b.code || '';
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    return 0;
  });
  return sorted.map((result, idx) => {
    const code = result.code || '';
    const parts = result.path || [];
    const p = parts.length ? pathStr(parts) : fallbackPath;
    const meta = metadata[code] || {};
    const severity = meta.effectiveSeverity != null
      ? meta.effectiveSeverity
      : (SEVERITY_MAP[result.severity != null ? result.severity : 1] || 'HIGH');
    return {
      id: `${prefix}-${String(idx + 1).padStart(3, '0')}`,
      severity,
      rule: code,
      path: p,
      issue: result.message || '',
      description: meta.description || '',
      fixSuggestion: meta.fixSuggestion || '',
      autoFixable: meta.autoFixable || false,
    };
  });
}

// Normalise the model's LLM-analysis output into the report's issue shape.
// Sorts by guideline rule order (Rule N.M), assigns `ai-NNN` IDs, and forces
// `autoFixable: false` since LLM-found issues need human judgment to fix safely.
function processAiIssues(rawIssues) {
  const sorted = [...rawIssues].sort((a, b) => {
    const ka = ruleSortKey(a.rule);
    const kb = ruleSortKey(b.rule);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    return ka[1] - kb[1];
  });
  return sorted.map((item, idx) => ({
    id: `ai-${String(idx + 1).padStart(3, '0')}`,
    severity: item.severity || 'MEDIUM',
    rule: item.rule || '',
    path: item.path || '',
    issue: item.issue || '',
    description: item.description || '',
    fixSuggestion: item.fixSuggestion || '',
    autoFixable: false,
  }));
}

// ---------------------------------------------------------------------------
// Spectral preflight + invocation
// ---------------------------------------------------------------------------

// Verify the `spectral` CLI is on PATH before doing any expensive work.
// Exits 1 with an install hint if missing — defence-in-depth; the SKILL.md flow
// also runs `spectral --version` upfront so the model can catch this earlier.
function spectralPreflight() {
  const result = spawnSync('spectral', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.error || result.status !== 0) {
    process.stderr.write(
      'Spectral CLI not found on PATH.\n' +
      'Install it with:  npm install -g @stoplight/spectral-cli\n'
    );
    process.exit(1);
  }
}

// Run `spectral lint` for one ruleset and return the parsed JSON violation array.
// Spectral exits non-zero both when it finds violations and when it fails outright
// (e.g. unreadable spec, broken ruleset). We disambiguate via stdout: a JSON array
// means a successful lint; empty stdout with non-zero exit is a real failure.
function runSpectral(specFile, ruleset) {
  const result = spawnSync(
    'spectral',
    ['lint', specFile, '--ruleset', ruleset, '--format', 'json'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const out = (result.stdout || Buffer.alloc(0)).toString('utf8').trim();
  const err = (result.stderr || Buffer.alloc(0)).toString('utf8').trim();

  // Spectral exits non-zero in two cases: (1) violations found — stdout has
  // the JSON array, which is expected; (2) hard failure (unreadable spec,
  // broken ruleset) — stdout is empty. Empty stdout with a non-zero exit
  // means a real failure, not a clean spec.
  if (!out) {
    if (result.status !== 0 || result.error) {
      process.stderr.write(
        `Spectral failed for ruleset ${ruleset}:\n${err || result.error?.message || '(no error output)'}\n`
      );
      process.exit(1);
    }
    return [];
  }
  try {
    return JSON.parse(out);
  } catch (e) {
    process.stderr.write(`Failed to parse Spectral output for ${ruleset}: ${e.message}\n${err}\n`);
    process.exit(1);
  }
}

// Load a per-dimension metadata file and return its `rules` map (rule code → info).
// These files (e.g. ai-readiness-metadata.json) supply the description, fix hint,
// and severity overrides that processSpectral attaches to each issue.
function readMetadata(filePath) {
  return (JSON.parse(fs.readFileSync(filePath, 'utf8')).rules) || {};
}

// Count AI Analysis rules in the guidelines doc — used as the denominator for
// the AI Analysis dimension's score. Looks for level-3 headings of the form
// "### Rule N.M". Returns 0 if the doc is missing, which makes computeScore
// fall back to its trivial-clean score of 100 for that section.
function countAiAnalysisRules(skillDir) {
  const docPath = path.join(skillDir, 'references', 'agent-readiness-guidelines.md');
  if (!fs.existsSync(docPath)) return 0;
  const text = fs.readFileSync(docPath, 'utf8');
  const matches = text.match(/^### Rule \d+\.\d+/gm);
  return matches ? matches.length : 0;
}

// ---------------------------------------------------------------------------
// Output path resolution + HTML/summary
// ---------------------------------------------------------------------------

// Safe directory check — returns false (instead of throwing) when the path
// doesn't exist or isn't accessible. Used by the output-path resolver.
function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

// Decide where the report JSON goes. Priority:
//   1. <CWD>/api-reports/ if it exists (this catches the directory the model
//      created when writing ai-issues.json there)
//   2. <spec-parent>/api-reports/ if it exists (legacy convenience)
//   3. Otherwise create <CWD>/api-reports/
// Filename is `<spec-stem>-api-readiness-report.json`.
function resolveOutputPath(specFile) {
  const cwd = process.cwd();
  let reportDir;
  if (isDir(path.join(cwd, 'api-reports'))) {
    reportDir = path.join(cwd, 'api-reports');
  } else if (isDir(path.join(path.dirname(specFile), 'api-reports'))) {
    reportDir = path.join(path.dirname(specFile), 'api-reports');
  } else {
    reportDir = path.join(cwd, 'api-reports');
    fs.mkdirSync(reportDir, { recursive: true });
  }
  const stem = path.parse(specFile).name;
  return path.join(reportDir, `${stem}-api-readiness-report.json`);
}

// Replace a path's extension with `.html`. Used to derive the HTML report path
// from the JSON report path so the two files sit side by side.
function withHtmlSuffix(p) {
  const ext = path.extname(p);
  return ext ? p.slice(0, -ext.length) + '.html' : p + '.html';
}

// Produce the self-contained HTML report by inlining the report JSON into the
// template at assets/report_template.html (placeholder: __REPORT_DATA_JSON__).
// The output is a single file the user can open offline — no server, no fetches.
function generateHtml(reportData, templatePath, outputPath) {
  if (!fs.existsSync(templatePath)) {
    process.stderr.write(`Error: HTML template not found at ${templatePath}\n`);
    process.exit(1);
  }
  const template = fs.readFileSync(templatePath, 'utf8');
  // Escape characters that would break out of the <script> block or be
  // misinterpreted as JS string-literal line terminators. JSON.stringify
  // doesn't escape `<` or U+2028/U+2029 because JSON itself doesn't require it.
  const safeJson = JSON.stringify(reportData)
    .replace(/</g, '\\u003c')
    .replace(new RegExp('\\u2028', 'g'), '\\u2028')
    .replace(new RegExp('\\u2029', 'g'), '\\u2029');
  // Use a function replacer so `$&`, `$1`, etc. in the JSON aren't
  // interpreted as String.replace backreferences.
  const html = template.replace('__REPORT_DATA_JSON__', () => safeJson);
  fs.writeFileSync(outputPath, html);
}

// Format one severity-summary line for the printed summary. Label is padded to
// 31 chars and the score cell to 10 so columns line up across dimensions.
function sevLine(label, score) {
  return `${label.padEnd(31)}${(score.score + '%').padEnd(10)} — ${score.critical} critical, ${score.high} high, ${score.medium} medium, ${score.low} low`;
}

// Print the human-facing assessment summary to stdout: one line per dimension
// that ran, the Top 3 issues across all dimensions ranked by severity, and the
// absolute paths to the generated JSON and HTML reports.
function printSummary(report, reportPath, htmlPath) {
  const lines = ['Assessment Summary', '='.repeat(18)];
  const all = [];
  const ar = report.agentReadiness || {};
  if (ar.spectral) {
    lines.push(sevLine('Agent Readiness · Spectral:', ar.spectral.score));
    all.push(...(ar.spectral.issues || []));
  }
  if (ar.aiAnalysis) {
    lines.push(sevLine('Agent Readiness · AI Analysis:', ar.aiAnalysis.score));
    all.push(...(ar.aiAnalysis.issues || []));
  }
  const sr = (report.securityReadiness || {}).spectral;
  if (sr) {
    lines.push(sevLine('Security Readiness:', sr.score));
    all.push(...(sr.issues || []));
  }
  const dr = (report.designReadiness || {}).spectral;
  if (dr) {
    lines.push(sevLine('Design Readiness:', dr.score));
    all.push(...(dr.issues || []));
  }
  all.sort((a, b) => {
    const sa = SEV_ORDER[(a.severity || '').toUpperCase()] ?? 99;
    const sb = SEV_ORDER[(b.severity || '').toUpperCase()] ?? 99;
    return sa - sb;
  });
  lines.push('');
  lines.push('Top 3 issues:');
  all.slice(0, 3).forEach((issue, i) => {
    const sev = (issue.severity || '?').padEnd(8);
    const iid = issue.id || '?';
    const text = issue.issue || '';
    lines.push(`  ${i + 1}. [${sev}] ${iid} — ${text}`);
  });
  lines.push('');
  lines.push(`Report: ${path.resolve(reportPath)}`);
  lines.push(`HTML:   ${path.resolve(htmlPath)}`);
  process.stdout.write(lines.join('\n') + '\n');
}

// Launch the user's default browser with the given file:// URL.
// Platform switch: `open` on macOS, `cmd /c start` on Windows, `xdg-open` on
// Linux. The child is detached and unref'd so this script exits immediately.
function openInBrowser(target) {
  let cmd;
  let args;
  if (process.platform === 'darwin') {
    cmd = 'open'; args = [target];
  } else if (process.platform === 'win32') {
    cmd = 'cmd'; args = ['/c', 'start', '""', target];
  } else {
    cmd = 'xdg-open'; args = [target];
  }
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Entry point. Validates flags, fails fast on missing inputs, runs Spectral for
// each requested dimension, merges in the LLM analysis (if --ai-issues was given),
// assembles the final report, writes JSON + HTML, deletes the ai-issues handoff
// file, prints the summary, and optionally opens the report in a browser.
function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      spec: { type: 'string' },
      'skill-dir': { type: 'string' },
      meta: { type: 'string' },
      agent: { type: 'boolean', default: false },
      security: { type: 'boolean', default: false },
      design: { type: 'boolean', default: false },
      'ai-issues': { type: 'string' },
      open: { type: 'boolean', default: false },
    },
  });

  if (!values.spec || !values['skill-dir'] || !values.meta) {
    process.stderr.write('Error: --spec, --skill-dir, and --meta are required\n');
    process.exit(1);
  }
  if (!values.agent && !values.security && !values.design) {
    process.stderr.write('Error: at least one of --agent / --security / --design must be set\n');
    process.exit(1);
  }

  const specFile = values.spec;
  const skillDir = values['skill-dir'];

  // Fail fast on missing inputs *before* spending time on spectral runs.
  if (values['ai-issues'] && !fs.existsSync(values['ai-issues'])) {
    process.stderr.write(`Error: --ai-issues file not found: ${values['ai-issues']}\n`);
    process.exit(1);
  }

  spectralPreflight();

  const meta = JSON.parse(values.meta);
  const report = { meta };

  // ---- Spectral runs ----
  // Track total rule counts per dimension (denominator for the 0..100 score).
  let specIssues = null, specTotal = 0;
  let secIssues = null, secTotal = 0;
  let desIssues = null, desTotal = 0;

  if (values.agent) {
    process.stdout.write('Running AI agent readiness rules (Spectral)...\n');
    const raw = runSpectral(
      specFile,
      path.join(skillDir, 'references', 'agent-readiness-spectral', 'ai-readiness.yaml'),
    );
    const md = readMetadata(path.join(skillDir, 'references', 'ai-readiness-metadata.json'));
    specIssues = processSpectral(raw, md, 'spec', path.basename(specFile));
    specTotal = Object.keys(md).length;
  }
  if (values.security) {
    process.stdout.write('Running security rules (OWASP-derived)...\n');
    const raw = runSpectral(
      specFile,
      path.join(skillDir, 'references', 'owasp-top-10-raw.yaml'),
    );
    const md = readMetadata(path.join(skillDir, 'references', 'owasp-top-10-metadata.json'));
    secIssues = processSpectral(raw, md, 'sec', path.basename(specFile));
    secTotal = Object.keys(md).length;
  }
  if (values.design) {
    process.stdout.write('Running design guidelines rules (WSO2 REST)...\n');
    const raw = runSpectral(
      specFile,
      path.join(skillDir, 'references', 'wso2-design-guidelines-raw.yaml'),
    );
    const md = readMetadata(path.join(skillDir, 'references', 'wso2-design-guidelines-metadata.json'));
    desIssues = processSpectral(raw, md, 'des', path.basename(specFile));
    desTotal = Object.keys(md).length;
  }

  // ---- AI analysis (if file provided) ----
  let aiIssues = null, aiTotal = 0;
  if (values['ai-issues']) {
    if (!fs.existsSync(values['ai-issues'])) {
      process.stderr.write(`Error: --ai-issues file not found: ${values['ai-issues']}\n`);
      process.exit(1);
    }
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(values['ai-issues'], 'utf8'));
    } catch (e) {
      process.stderr.write(`Error: --ai-issues file is not valid JSON: ${e.message}\n`);
      process.exit(1);
    }
    aiIssues = processAiIssues(raw);
    aiTotal = countAiAnalysisRules(skillDir);
  }

  // ---- Assemble report ----
  if (specIssues || aiIssues) {
    const ar = {};
    if (specIssues) {
      ar.spectral = {
        status: 'completed',
        ruleset: 'references/agent-readiness-spectral/ai-readiness.yaml',
        score: computeScore(specIssues, specTotal),
        issues: specIssues,
      };
    }
    if (aiIssues) {
      ar.aiAnalysis = {
        status: 'completed',
        score: computeScore(aiIssues, aiTotal),
        issues: aiIssues,
      };
    }
    report.agentReadiness = ar;
  }
  if (secIssues) {
    report.securityReadiness = {
      spectral: {
        status: 'completed',
        ruleset: 'references/owasp-top-10-raw.yaml',
        score: computeScore(secIssues, secTotal),
        issues: secIssues,
      },
    };
  }
  if (desIssues) {
    report.designReadiness = {
      spectral: {
        status: 'completed',
        ruleset: 'references/wso2-design-guidelines-raw.yaml',
        score: computeScore(desIssues, desTotal),
        issues: desIssues,
      },
    };
  }

  // ---- Write outputs ----
  const reportPath = resolveOutputPath(specFile);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const htmlPath = withHtmlSuffix(reportPath);
  const templatePath = path.join(skillDir, 'assets', 'report_template.html');
  generateHtml(report, templatePath, htmlPath);

  // Delete the AI issues file now that it's no longer needed. Keep the
  // surrounding ./api-reports/ directory — it now holds the report.
  if (values['ai-issues'] && fs.existsSync(values['ai-issues'])) {
    fs.rmSync(values['ai-issues'], { force: true });
  }

  printSummary(report, reportPath, htmlPath);

  if (values.open) {
    openInBrowser(pathToFileURL(path.resolve(htmlPath)).toString());
  }
}

main();
