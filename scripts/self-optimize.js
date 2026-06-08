#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APEX_DIR = path.join(os.homedir(), '.apex');

const BOLD = '\x1b[1m', DIM = '\x1b[2m';
const GREEN = '\x1b[32m', CYAN = '\x1b[36m', YELLOW = '\x1b[33m', RED = '\x1b[31m', RESET = '\x1b[0m';

function print(...a) { console.log(...a); }
function ok(m) { console.log(`  ${GREEN}✓${RESET} ${m}`); }
function warn(m) { console.log(`  ${YELLOW}⚠${RESET} ${m}`); }
function fail(m) { console.log(`  ${RED}✗${RESET} ${m}`); }

function readFile(f) {
  try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return null; }
}

function exists(f) { return fs.existsSync(path.join(ROOT, f)); }

function lineCount(content) { return content ? content.split('\n').length : 0; }

// ── APEX Memory IO ──
function readApex(pathPart) {
  try {
    const fp = path.join(APEX_DIR, pathPart);
    return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
  } catch { return null; }
}

function writeApex(pathPart, content) {
  const fp = path.join(APEX_DIR, pathPart);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fp, content);
}

// ── LDR STATE ──
function loadLdrState() {
  try {
    const raw = readApex('state/STATE.md');
    if (!raw) return { cycles: 0, lastAction: 'Not started' };
    const cycleMatch = raw.match(/sessions:\s*(\d+)/);
    const cycles = cycleMatch ? parseInt(cycleMatch[1], 10) : 0;
    return { cycles, lastAction: raw };
  } catch { return { cycles: 0, lastAction: 'Error reading state' }; }
}

function saveLdrState(metrics) {
  const ts = new Date().toISOString().split('T')[0];
  let state = readApex('state/STATE.md') || '';
  state = state.replace(/sessions:\s*\d+/, `sessions: ${metrics.sessions || 1}`)
               .replace(/last_ldr:\s*\S+/, `last_ldr: ${ts}`);
  if (!state.includes('last_ldr:')) state += `\n- last_ldr: ${ts}\n`;
  writeApex('state/STATE.md', state);
}

// ── SEARCH QUERIES for PLAN phase ──
function generateSearchQueries(issues) {
  const queries = [
    { query: 'best practices Node.js CLI tools 2026', goal: 'Improve CLI ergonomics' },
    { query: 'cross-platform PowerShell bash script Node.js patterns', goal: 'Fix cross-platform compatibility' },
    { query: 'GitHub Actions CI patterns Node.js multi-version matrix', goal: 'Optimize CI pipeline' },
    { query: 'self-improving AI agent architecture patterns', goal: 'Find new self-evolution techniques' },
  ];
  const types = [...new Set(issues.map(i => i.type))];
  if (types.includes('stale-todo')) queries.push({ query: 'automated TODO tracking tools node.js', goal: 'Resolve stale TODOs' });
  if (types.includes('console-log')) queries.push({ query: 'structured logging Node.js CLI best practices', goal: 'Replace console.log' });
  return queries;
}

function findIssues(files) {
  const issues = [];
  for (const f of files) {
    const content = readFile(f);
    if (!content) { warn(`${f}: could not read`); continue; }
    const lines = content.split('\n');
    lines.forEach((l, i) => {
      // Exclude self-referential matches (scanner's own regex, search queries, suggestion messages)
      if (/TODO|FIXME|HACK|XXX/.test(l)
          && !l.trim().startsWith('//')
          && !l.trim().startsWith('#')
          && !l.includes('/TODO|FIXME|HACK|XXX/')  // regex literal in scanner itself
          && !l.includes('automated TODO tracking') // search query
          && !l.includes('Stale TODOs')             // suggestion text
          && !l.includes('stale-todo')) {           // type tag
        issues.push({ file: f, line: i + 1, severity: 'medium', type: 'stale-todo', text: l.trim().slice(0, 80) });
      }
    });
    if (f.startsWith('lib/') && !f.endsWith('.json')) {
      lines.forEach((l, i) => {
        if (/console\.(log|debug)/.test(l) && !l.trim().startsWith('//')) {
          issues.push({ file: f, line: i + 1, severity: 'low', type: 'console-log', text: l.trim().slice(0, 80) });
        }
      });
    }
    if (f.endsWith('.js') || f.endsWith('.ps1') || f.endsWith('.sh')) {
      lines.forEach((l, i) => {
        if (/['"][A-Za-z]:\\/.test(l) && !l.includes('process.env') && !l.includes('path.join')) {
          issues.push({ file: f, line: i + 1, severity: 'low', type: 'hardcoded-path', text: l.trim().slice(0, 80) });
        }
      });
    }
    lines.forEach((l, i) => {
      if (l.length > 120 && !l.trim().startsWith('//') && !l.trim().startsWith('#')) {
        issues.push({ file: f, line: i + 1, severity: 'info', type: 'long-line', text: l.length + ' chars' });
      }
    });
  }
  return issues;
}

function generateSuggestions(issues) {
  const suggestions = [];
  const types = [...new Set(issues.map(i => i.type))];
  if (types.includes('stale-todo')) {
    suggestions.push('- **Stale TODOs**: Resolve or remove ' + issues.filter(i => i.type === 'stale-todo').length + ' leftover TODO/FIXME markers');
  }
  if (types.includes('console-log')) {
    suggestions.push('- **Console calls**: Replace ' + issues.filter(i => i.type === 'console-log').length + ' console.log/debug in lib/ with structured logging or remove');
  }
  if (types.includes('hardcoded-path')) {
    suggestions.push('- **Hardcoded paths**: Replace absolute Windows paths with path.join + process.env');
  }
  if (types.includes('long-line')) {
    const count = issues.filter(i => i.type === 'long-line').length;
    if (count > 5) suggestions.push('- **Long lines**: ' + count + ' lines exceed 120 chars — consider breaking them up');
  }
  return suggestions;
}

function checkDependencies() {
  const checks = [];
  try {
    const node = execSync('node --version', { encoding: 'utf8', timeout: 3000 }).trim();
    checks.push({ name: 'Node.js', status: 'ok', detail: node });
  } catch { checks.push({ name: 'Node.js', status: 'fail', detail: 'not found' }); }

  try {
    execSync('npm --version', { encoding: 'utf8', timeout: 3000 });
    checks.push({ name: 'npm', status: 'ok', detail: 'available' });
  } catch { checks.push({ name: 'npm', status: 'fail', detail: 'not found' }); }

  try {
    execSync('git --version', { encoding: 'utf8', timeout: 3000 });
    checks.push({ name: 'git', status: 'ok', detail: 'available' });
  } catch { checks.push({ name: 'git', status: 'fail', detail: 'not found' }); }

  try {
    const out = execSync('codegraph --version', { encoding: 'utf8', timeout: 3000 }).trim();
    checks.push({ name: 'CodeGraph', status: 'ok', detail: out });
  } catch { checks.push({ name: 'CodeGraph', status: 'warn', detail: 'not installed' }); }

  const agentsDir = path.join(os.homedir(), '.claude', 'agents');
  try {
    const count = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).length;
    checks.push({ name: 'ECC agents', status: 'ok', detail: count + ' agents' });
  } catch { checks.push({ name: 'ECC agents', status: 'warn', detail: 'not found' }); }

  return checks;
}

async function main() {
  print(`\n${BOLD}${CYAN}Omni-Fusion APEX — LDR Self-Optimization Engine${RESET}\n`);

  // Phase 0: LDR ORIENT — Read APEX state
  print(`${BOLD}Phase 0: LDR ORIENT — APEX State${RESET}`);
  const ldr = loadLdrState();
  ok(`LDR cycles completed: ${ldr.cycles}`);
  // Track this session
  const sess = ldr.cycles + 1;
  saveLdrState({ sessions: sess });
  ok(`Session #${sess} started`);
  print('');

  // Phase 1: Check environment
  print(`${BOLD}Phase 1: Environment Check${RESET}`);
  const deps = checkDependencies();
  for (const d of deps) {
    if (d.status === 'ok') ok(`${d.name}: ${d.detail}`);
    else if (d.status === 'warn') warn(`${d.name}: ${d.detail}`);
    else fail(`${d.name}: ${d.detail}`);
  }
  print('');

  // Phase 2: Scan source files
  print(`${BOLD}Phase 2: Source Code Audit${RESET}`);
  const sourceFiles = [
    'bin/of.js', 'lib/codegraph.js', 'lib/ecc.js', 'lib/gstack.js',
    'scripts/co-install.js', 'scripts/check-install.js', 'scripts/build-docs.js',
    'scripts/ci-shell-check.js', 'install.ps1', 'install.sh',
    'mcp-bridge/omni-fusion.json', 'fuse.json', 'package.json',
    'CLAUDE.md', 'AGENTS.md', 'FUSION.md'
  ];
  const issues = findIssues(sourceFiles);

  if (issues.length === 0) {
    ok('No issues found in source code scan');
  } else {
    ok(`Found ${issues.length} items`);
    for (const issue of issues.slice(0, 30)) {
      const tag = issue.severity === 'high' ? RED : issue.severity === 'medium' ? YELLOW : DIM;
      print(`  ${tag}[${issue.severity}]${RESET} ${issue.file}:${issue.line} — ${issue.type}: ${issue.text}`);
    }
    if (issues.length > 30) print(`  ${DIM}...and ${issues.length - 30} more${RESET}`);
  }
  print('');

  // Phase 3: File health
  print(`${BOLD}Phase 3: File Health${RESET}`);
  for (const f of sourceFiles) {
    const content = readFile(f);
    if (content) ok(`${f} (${lineCount(content)} lines)`);
    else fail(`${f}: missing or unreadable`);
  }
  print('');

  // Phase 4: Suggestions
  print(`${BOLD}Phase 4: Optimization Suggestions${RESET}`);
  const suggestions = generateSuggestions(issues);
  if (suggestions.length === 0) {
    ok('No optimizations suggested — codebase is clean');
  } else {
    for (const s of suggestions) print(`  ${YELLOW}→${RESET} ${s}`);
  }
  print('');

  // Phase 5: LDR PLAN — Search queries for GapDetect
  print(`${BOLD}Phase 5: LDR PLAN — Internet Gap Detection Queries${RESET}`);
  const queries = generateSearchQueries(issues);
  print(`  ${DIM}Search these topics to find improvement gaps:${RESET}`);
  for (const q of queries) {
    print(`  ${GREEN}→${RESET} "${q.query}" ${DIM}— ${q.goal}${RESET}`);
  }
  print('');

  // Phase 6: LDR PERSIST — Write to APEX evolution log + metrics
  print(`${BOLD}Phase 6: LDR PERSIST — APEX Memory Update${RESET}`);
  const ts = new Date().toISOString().split('T')[0];
  const evoEntry = [
    `\n## ${ts} — Session #${sess} (LDR Cycle)`,
    `- Issues found: ${issues.length}`,
    `- Dependencies: ${deps.filter(d => d.status === 'ok').length}/${deps.length} ok`,
    `- Suggestions: ${suggestions.length}`,
    `- Search queries generated: ${queries.length}`,
    `- Files checked: ${sourceFiles.length}`,
    '',
  ].join('\n');

  const evoPath = 'memory/evolution_log.md';
  let evo = readApex(evoPath) || `# Omni-Fusion APEX Evolution Log\n\n## ${ts} — Initialization\n- APEX system initialized\n`;
  evo += evoEntry;
  writeApex(evoPath, evo);
  ok(`evolution_log.md updated`);

  // Update METRICS.json
  let metrics = { omniFusion: { version: '1.0.0', ldr: { cyclesComplete: sess, gapsFound: issues.length, fixesApplied: 0, lastCycle: ts }, codeQuality: { lintPass: issues.length === 0, issuesOpen: issues.length }, coverage: { componentsInstalled: deps.filter(d => d.status === 'ok').length, cliCommands: 5, npmScripts: 7 } }, health: issues.length === 0 ? 'T2 STABLE' : 'T1 BOOTSTRAP', sessions: sess, lastUpdated: ts };
  try {
    const existing = JSON.parse(readApex('state/METRICS.json') || '{}');
    if (existing.omniFusion) metrics = { ...existing, omniFusion: { ...existing.omniFusion, ldr: { ...existing.omniFusion.ldr, cyclesComplete: sess, gapsFound: issues.length, lastCycle: ts }, codeQuality: { ...existing.omniFusion.codeQuality, issuesOpen: issues.length } }, sessions: sess, lastUpdated: ts, health: issues.length === 0 ? 'T2 STABLE' : 'T1 BOOTSTRAP' };
  } catch (e) { warn(`Metrics update failed: ${e.message}`); }
  writeApex('state/METRICS.json', JSON.stringify(metrics, null, 2));
  ok(`METRICS.json updated (health: ${metrics.health})`);

  // Save report
  const outDir = path.join(ROOT, '.of-optimize');
  try {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const timestamp = Date.now();
    let report = `# Omni-Fusion APEX Optimization Report\n\n*Generated: ${new Date().toISOString()}*\n\n`;
    report += `## LDR Session #${sess}\n\n`;
    report += `## Environment\n\n`;
    for (const d of deps) report += `- ${d.name}: ${d.detail}\n`;
    report += `\n## Issues Found: ${issues.length}\n\n`;
    for (const issue of issues) {
      report += `- [${issue.severity}] ${issue.file}:${issue.line} — ${issue.type}: ${issue.text}\n`;
    }
    report += `\n## Suggestions\n\n`;
    for (const s of suggestions) report += `${s}\n`;
    report += `\n## Search Queries for Next PLAN Phase\n\n`;
    for (const q of queries) report += `- "${q.query}" — ${q.goal}\n`;
    const outFile = path.join(outDir, `report-${timestamp}.md`);
    fs.writeFileSync(outFile, report);
    ok(`Report saved: ${outFile}`);
  } catch (e) {
    warn(`Could not save report: ${e.message}`);
  }

  print(`\n${BOLD}${DIM}LDR cycle complete. Next:${RESET}`);
  print(`  ${DIM}1. Run internet searches from Phase 5 to find gaps${RESET}`);
  print(`  ${DIM}2. Implement the highest-impact gap${RESET}`);
  print(`  ${DIM}3. npm run lint && npm run test to verify${RESET}`);
  print(`  ${DIM}4. npm run optimize again to log the improvement${RESET}\n`);
}

main().catch(e => { console.error(e.message || e); process.exitCode = 1; });
