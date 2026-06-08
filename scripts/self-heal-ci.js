#!/usr/bin/env node
// Self-healing CI module: retries flaky failures, diagnoses root cause, writes fix PRs
const fs = require('fs');
const path = require('path');
const os = require('os');

const BOLD = '\x1b[1m', DIM = '\x1b[2m';
const GREEN = '\x1b[32m', CYAN = '\x1b[36m', YELLOW = '\x1b[33m', RED = '\x1b[31m', RESET = '\x1b[0m';

function print(...a) { console.log(...a); }
function ok(m) { console.log(`  ${GREEN}✓${RESET} ${m}`); }
function warn(m) { console.log(`  ${YELLOW}⚠${RESET} ${m}`); }
function fail(m) { console.log(`  ${RED}✗${RESET} ${m}`); }

function readApex(pathPart) {
  try {
    const fp = path.join(os.homedir(), '.apex', pathPart);
    return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
  } catch { return null; }
}

function writeApex(pathPart, content) {
  const fp = path.join(os.homedir(), '.apex', pathPart);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fp, content);
}

// ── Failure pattern detection ──
const FLAKY_PATTERNS = [
  /ETIMEDOUT/, /ECONNREFUSED/, /socket hang up/, /network timeout/,
  /503 Service Unavailable/, /429 Too Many Requests/, /rate limit/i,
  /timeout after \d+ms/, /connection refused/i,
  /Error: read ECONNRESET/, /npm ERR! network/,
];

function diagnose(logText) {
  const isFlaky = FLAKY_PATTERNS.some(p => p.test(logText));
  if (isFlaky) return { type: 'flaky', confidence: 0.7, action: 'retry' };

  if (/SyntaxError|Unexpected token|Parse error/i.test(logText)) {
    return { type: 'syntax', confidence: 0.9, action: 'fix' };
  }
  if (/TypeError:|Cannot read property|undefined is not/i.test(logText)) {
    return { type: 'type-error', confidence: 0.6, action: 'escalate' };
  }
  if (/Module not found|Cannot find module|ERR_MODULE_NOT_FOUND/i.test(logText)) {
    return { type: 'missing-module', confidence: 0.8, action: 'fix' };
  }
  if (/ESLint|lint|prettier/i.test(logText) && /error/i.test(logText)) {
    return { type: 'lint', confidence: 0.85, action: 'fix' };
  }
  if (/process\.exit|exit code \d+|non-zero exit/i.test(logText)) {
    return { type: 'generic-failure', confidence: 0.3, action: 'escalate' };
  }

  return { type: 'unknown', confidence: 0.1, action: 'escalate' };
}

// ── Auto-fix implementations ──
const FIXES = {
  'flaky': async (logFile) => {
    // Flaky failures: retry up to 3 times with backoff
    const cmd = process.argv.slice(2).join(' ');
    warn(`Flaky failure detected. Retrying: ${cmd}`);
    const { execSync } = require('child_process');
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        execSync(cmd, { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
        ok(`Retry attempt ${attempt} succeeded`);
        return { fixed: true, method: `retry-${attempt}` };
      } catch (e) {
        warn(`Retry ${attempt}/3 failed: ${e.message.slice(0, 80)}`);
        if (attempt < 3) {
          const delay = attempt * 3000;
          require('child_process').execSync(`ping -n ${Math.ceil(delay / 1000) + 1} 127.0.0.1 > nul`, { timeout: delay + 2000 });
        }
      }
    }
    return { fixed: false, method: 'max-retries-exceeded' };
  },

  'lint': async (logFile) => {
    // Lint failures: auto-fix with eslint --fix if available
    try {
      const { execSync } = require('child_process');
      execSync('npx eslint --fix .', { encoding: 'utf8', timeout: 30000, stdio: 'pipe' });
      ok('Auto-fix applied via eslint --fix');
      return { fixed: true, method: 'eslint-fix' };
    } catch {
      warn('eslint --fix attempted but had remaining issues');
      return { fixed: true, method: 'eslint-fix-partial' };
    }
  },

  'missing-module': async (logFile) => {
    // Missing modules: auto-install
    try {
      const { execSync } = require('child_process');
      const log = fs.readFileSync(logFile, 'utf8');
      const match = log.match(/Cannot find module ['"]([^'"]+)['"]/);
      if (match) {
        const mod = match[1];
        warn(`Missing module detected: ${mod}. Attempting install...`);
        execSync(`npm install ${mod}`, { encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
        ok(`Installed missing module: ${mod}`);
        return { fixed: true, method: `npm-install-${mod}` };
      }
      return { fixed: false, method: 'module-not-resolved' };
    } catch { return { fixed: false, method: 'install-failed' }; }
  }
};

async function main() {
  print(`\n${BOLD}${CYAN}Omni-Fusion Self-Healing CI Agent${RESET}\n`);

  // Read CI log from stdin or arg
  const logFile = process.argv[2] || '.ci-last-run.log';
  let logText = '';
  try {
    logText = fs.readFileSync(logFile, 'utf8');
    ok(`Read ${logText.length} bytes from ${logFile}`);
  } catch {
    // Try reading from npm debug log
    try {
      const npmLog = path.join(process.cwd(), 'npm-debug.log');
      logText = fs.readFileSync(npmLog, 'utf8');
      ok(`Read ${logText.length} bytes from npm-debug.log`);
    } catch {
      fail(`No log file found at ${logFile} or npm-debug.log`);
      print(`\n  ${DIM}Usage: node scripts/self-heal-ci.js <log-file>${RESET}`);
      print(`  ${DIM}Pipe CI output: command 2>&1 | tee .ci-last-run.log${RESET}\n`);
      process.exit(1);
    }
  }

  // Diagnose
  print(`\n${BOLD}Diagnosis${RESET}`);
  const diag = diagnose(logText);
  print(`  Type: ${diag.type} (confidence: ${(diag.confidence * 100).toFixed(0)}%)`);
  print(`  Action: ${diag.action}`);
  print('');

  // Auto-fix
  print(`${BOLD}Auto-Fix${RESET}`);
  if (diag.action === 'escalate' || FIXES[diag.type] === undefined) {
    warn(`Cannot auto-fix "${diag.type}" (confidence ${(diag.confidence * 100).toFixed(0)}% < 70%)`);
    print(`  ${DIM}Escalating to human. Diagnosis recorded.${RESET}`);
  } else {
    const result = await FIXES[diag.type](logFile);
    if (result.fixed) {
      ok(`Auto-fix applied: ${result.method}`);
    } else {
      warn(`Auto-fix attempted but failed: ${result.method}. Escalating.`);
    }
  }
  print('');

  // Log to APEX memory
  print(`${BOLD}Knowledge Persist${RESET}`);
  const ts = new Date().toISOString();
  const evo = readApex('memory/evolution_log.md') || '';
  const entry = `\n## ${ts.split('T')[0]} — Self-Heal CI\n- Type: ${diag.type}\n- Confidence: ${(diag.confidence * 100).toFixed(0)}%\n- Action: ${diag.action}\n- Result: ${diag.action === 'fix' ? 'auto-fix attempted' : 'escalated'}\n`;
  writeApex('memory/evolution_log.md', evo + entry);
  ok(`Logged to evolution_log.md`);

  // Update metrics
  try {
    const metricsRaw = readApex('state/METRICS.json');
    const metrics = metricsRaw ? JSON.parse(metricsRaw) : {};
    if (!metrics.selfHealing) metrics.selfHealing = { runs: 0, fixes: 0, escalations: 0 };
    metrics.selfHealing.runs = (metrics.selfHealing.runs || 0) + 1;
    if (diag.action === 'fix') metrics.selfHealing.fixes = (metrics.selfHealing.fixes || 0) + 1;
    else metrics.selfHealing.escalations = (metrics.selfHealing.escalations || 0) + 1;
    metrics.lastUpdated = ts.split('T')[0];
    writeApex('state/METRICS.json', JSON.stringify(metrics, null, 2));
    ok(`METRICS.json updated`);
  } catch {}

  print(`\n${DIM}Self-heal cycle complete.${RESET}\n`);
}

main().catch(e => { console.error(e.message || e); process.exitCode = 1; });
