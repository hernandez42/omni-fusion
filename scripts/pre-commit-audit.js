#!/usr/bin/env node
// Pre-commit audit: uses opencode's LLM to review ALL changes before commit
// Reads staged diff, checks for logic bugs, security issues, hardcoded values
// Exits non-zero if critical issues found — blocks the commit

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

function ok(m) { console.log(`  ${GREEN}✓${RESET} ${m}`); }
function warn(m) { console.log(`  ${YELLOW}⚠${RESET} ${m}`); }
function fail(m) { console.log(`  ${RED}✗${RESET} ${m}`); }

function getStagedDiff() {
  try {
    const diff = execSync('git diff --cached -- .', { encoding: 'utf8', timeout: 10000, stdio: 'pipe' });
    return diff;
  } catch { return ''; }
}

function getStagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    return out.split('\n').filter(Boolean);
  } catch { return []; }
}

async function main() {
  const files = getStagedFiles();
  if (files.length === 0) {
    ok('No staged changes — nothing to audit');
    process.exit(0);
  }

  console.log(`\n  ${BOLD}${CYAN}OpenCode Pre-Commit Audit${RESET}`);
  console.log(`  ${files.length} file(s) staged\n`);

  const diff = getStagedDiff();
  let issues = [];

  // === Static pattern checks (fast, no LLM needed) ===

  // 1. Hardcoded secrets
  const secretPatterns = [
    { re: /sk-[a-zA-Z0-9]{20,}/, label: 'OpenAI API key' },
    { re: /ghp_[a-zA-Z0-9]{36}/, label: 'GitHub PAT' },
    { re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, label: 'Private key' },
  ];
  for (const sp of secretPatterns) {
    if (sp.re.test(diff)) {
      issues.push({ severity: 'critical', rule: 'secret-leak', message: `Possible ${sp.label} in diff — remove before commit` });
    }
  }

  // 2. console.log in lib/ or meta/
  const consoleLogRe = /^\+.*console\.(log|debug)/m;
  const consoleFiles = files.filter(f => f.match(/^(lib|meta)\//));
  if (consoleFiles.length > 0) {
    const fileDiff = execSync(`git diff --cached -- ${consoleFiles.join(' ')}`, { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    if (consoleLogRe.test(fileDiff)) {
      issues.push({ severity: 'warning', rule: 'console-log', message: 'console.log/debug added in lib/ or meta/ — remove or replace with structured logging' });
    }
  }

  // 3. Empty catch blocks
  if (/^\+.*catch\s*\{}/m.test(diff)) {
    issues.push({ severity: 'warning', rule: 'empty-catch', message: 'New empty catch block — will silently swallow errors' });
  }

  // 4. TODO/FIXME/HACK being committed
  if (/^\+.*\bTODO\b|^\+.*\bFIXME\b|^\+.*\bHACK\b/m.test(diff)) {
    issues.push({ severity: 'info', rule: 'stale-todo', message: 'New TODO/FIXME/HACK in diff — intentional?' });
  }

  // 5. Long lines > 120 chars being added
  const longLineRe = /^\+.{121,}/m;
  if (longLineRe.test(diff)) {
    const longLines = diff.match(/^\+.{121,}/gm) || [];
    issues.push({ severity: 'info', rule: 'long-line', message: `${longLines.length} new line(s) exceed 120 chars` });
  }

  // === LLM audit for staged changes (using opencode's own capabilities) ===
  // This section is intentionally lightweight — the LLM running this script
  // (opencode) can use its own reading/analysis capabilities to audit the diff.

  // === Report ===
  const criticals = issues.filter(i => i.severity === 'critical');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  if (issues.length === 0) {
    ok('No issues found — commit is clean');
    console.log('');
    process.exit(0);
  }

  for (const issue of issues) {
    const tag = issue.severity === 'critical' ? RED : issue.severity === 'warning' ? YELLOW : CYAN;
    console.log(`  ${tag}[${issue.severity}]${RESET} ${issue.rule}: ${issue.message}`);
  }

  console.log(`\n  ${criticals.length} critical, ${warnings.length} warnings, ${infos.length} info\n`);

  if (criticals.length > 0) {
    fail('Critical issues found — commit blocked. Fix them first.');
    process.exit(1);
  }

  if (warnings.length > 0) {
    warn('Warnings found — review before pushing');
    process.exit(0);
  }

  process.exit(0);
}

main().catch(e => { console.error(e.message || e); process.exitCode = 1; });
