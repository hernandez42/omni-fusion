#!/usr/bin/env node
// Omni-Fusion Dynamic Co-installer v2.0
// Detect → Select → Install → Wire — adapts to YOUR environment

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const GREEN = '\x1b[32m', CYAN = '\x1b[36m', YELLOW = '\x1b[33m', RED = '\x1b[31m', RESET = '\x1b[0m', BOLD = '\x1b[1m', DIM = '\x1b[2m';
function log(tag, msg) { console.log(`  [${BOLD}${CYAN}${tag}${RESET}] ${msg}`); }
function ok(msg) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }

const HOME = os.homedir();
const CLAUDE_SKILLS = path.join(HOME, '.claude', 'skills');
const CLAUDE_AGENTS = path.join(HOME, '.claude', 'agents');

function tryExec(cmd, timeout = 60000) {
  try { return execSync(cmd, { encoding: 'utf8', timeout, stdio: 'pipe' }).trim(); }
  catch { return null; }
}

function cmdExists(name) {
  const isWin = process.platform === 'win32';
  return tryExec(isWin ? `where "${name}"` : `command -v "${name}"`, 3000) !== null;
}

async function detect() {
  const env = {
    os: process.platform,
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemGB: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    node: tryExec('node --version'),
    npm: tryExec('npm --version'),
    python: tryExec('python --version 2>&1') || tryExec('python3 --version 2>&1'),
    git: tryExec('git --version'),
    isWin: process.platform === 'win32',
    isMac: process.platform === 'darwin',
    isLinux: process.platform === 'linux',
  };
  env.hasGPU = tryExec('nvcc --version') !== null || (env.isWin && tryExec('where nvcc 2>nul') !== null);
  env.canLocalLLM = env.hasGPU || (env.isMac && env.totalMemGB >= 16) || env.totalMemGB >= 32;
  env.highMem = env.totalMemGB >= 32;
  return env;
}

function npmInstall(pkg) {
  const result = tryExec(`npm install -g "${pkg}"`, 120000);
  if (result !== null) return true;
  // Retry with no cache
  return tryExec(`npm install -g --prefer-offline "${pkg}"`, 120000) !== null;
}

function gitClone(url, dest) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const result = tryExec(`git clone --single-branch --depth 1 "${url}" "${dest}"`, 60000);
  return result !== null;
}

async function main() {
  console.log(`\n  ${BOLD}${CYAN}Omni-Fusion Dynamic Setup${RESET}`);
  console.log(`  ${DIM}Detects your environment → selects best tools → installs & wires${RESET}\n`);

  // Phase 1: Detect
  console.log(`  ${BOLD}Phase 1: Environment Detect${RESET}`);
  const env = await detect();
  ok(`${env.os} ${env.arch}, ${env.cpus} CPUs, ${env.totalMemGB}GB RAM`);
  ok(`Node ${env.node}, npm ${env.npm}${env.python ? ', ' + env.python.split('\n')[0] : ''}`);
  if (env.hasGPU) ok(`GPU detected (CUDA available)`);
  else if (env.canLocalLLM) warn(`No discrete GPU, but ${env.totalMemGB}GB RAM can run small local models`);
  else warn(`Standard hardware — cloud LLM recommended for heavy tasks`);
  console.log('');

  // Phase 2: Select tools
  console.log(`  ${BOLD}Phase 2: Tool Selection${RESET}`);
  const plan = [];

  // Core — always install
  plan.push({ id: 'omni-fusion', desc: 'Meta-Orchestrator + CLI + self-evolution', always: true });
  plan.push({ id: 'codegraph', desc: 'AST knowledge graph (fast code indexing)', npm: '@colbymchenry/codegraph' });

  // Recommended for most users
  if (env.canLocalLLM || env.highMem) {
    plan.push({ id: 'ecc', desc: '48 AI code review + planning agents', npm: 'ecc-universal', post: 'ecc install --profile developer --target claude' });
  } else {
    plan.push({ id: 'ecc-lite', desc: 'Code review agents (cloud mode)', npm: 'ecc-universal', post: 'ecc install --profile developer --target claude' });
  }

  // gstack workflow system
  plan.push({ id: 'gstack', desc: 'Virtual engineering sprint lifecycle', git: 'https://github.com/garrytan/gstack.git', dest: path.join(CLAUDE_SKILLS, 'gstack') });

  // Enhanced tools for capable hardware
  if (env.canLocalLLM && env.python) {
    plan.push({ id: 'autoresearch', desc: 'Auto research agent (Karpathy)', git: 'https://github.com/karpathy/autoresearch.git', dest: path.join(HOME, '.omni', 'tools', 'autoresearch'), optional: true });
  }
  if (env.highMem && env.python) {
    plan.push({ id: 'letta', desc: 'Persistent memory (MemGPT)', git: 'https://github.com/cpacker/MemGPT.git', dest: path.join(HOME, '.omni', 'tools', 'letta'), optional: true });
  }
  if (env.python && tryExec('pip --version') !== null) {
    plan.push({ id: 'semgrep', desc: 'Static security analysis', pip: 'semgrep', optional: true });
  }

  // Sort: required first, then optional
  plan.sort((a, b) => (a.always ? 0 : 1) - (b.always ? 0 : 1) || (a.optional ? 1 : 0) - (b.optional ? 1 : 0));

  for (const p of plan) {
    const tag = p.always ? '' : p.optional ? DIM + '(optional)' + RESET : '';
    console.log(`  ${GREEN}→${RESET} ${p.id}${tag ? ' ' + tag : ''}`);
    console.log(`     ${DIM}${p.desc}${RESET}`);
  }
  console.log('');

  // Phase 3: Install
  console.log(`  ${BOLD}Phase 3: Install${RESET}`);
  const results = [];
  for (const p of plan) {
    if (p.id === 'omni-fusion') {
      // Link local CLI
      tryExec(`npm link`, 10000);
      ok(`omni-fusion CLI linked (of + meta commands)`);
      results.push(true);
      continue;
    }

    if (p.npm) {
      const existing = cmdExists(p.id === 'ecc' || p.id === 'ecc-lite' ? 'ecc' : p.id);
      if (existing) { ok(`${p.id}: already installed`); results.push(true); continue; }
      const installed = npmInstall(p.npm);
      if (installed) {
        if (p.post) {
          const postResult = tryExec(p.post, 120000);
          if (postResult !== null) ok(`${p.id}: installed + post-setup done`);
          else warn(`${p.id}: installed but post-setup failed (run: ${p.post})`);
        } else { ok(`${p.id}: installed`); }
        results.push(true);
      } else if (p.optional) {
        warn(`${p.id}: install failed (optional, continuing)`);
        results.push(null);
      } else {
        warn(`${p.id}: install failed. Try: npm install -g ${p.npm}`);
        results.push(false);
      }
      continue;
    }

    if (p.git) {
      const existing = fs.existsSync(p.dest);
      if (existing) { ok(`${p.id}: already cloned`); results.push(true); continue; }
      const cloned = gitClone(p.git, p.dest);
      if (cloned) { ok(`${p.id}: cloned`); results.push(true); }
      else if (p.optional) { warn(`${p.id}: clone failed (optional)`); results.push(null); }
      else { warn(`${p.id}: clone failed. Try: git clone ${p.git} ${p.dest}`); results.push(false); }
      continue;
    }

    if (p.pip) {
      const installed = tryExec(`pip install ${p.pip}`, 120000) !== null || tryExec(`pip3 install ${p.pip}`, 120000) !== null;
      if (installed) { ok(`${p.id}: installed via pip`); results.push(true); }
      else if (p.optional) { warn(`${p.id}: pip install failed (optional)`); results.push(null); }
      else { warn(`${p.id}: pip install failed`); results.push(false); }
      continue;
    }
  }
  console.log('');

  // Phase 4: Wire
  console.log(`  ${BOLD}Phase 4: Wire${RESET}`);
  const installedCount = results.filter(Boolean).length;
  const totalCount = plan.length;

  // Write fuse.json with personalized manifest
  const manifest = {
    version: '2.0',
    installedAt: new Date().toISOString(),
    env: { os: env.os, arch: env.arch, cpus: env.cpus, ramGB: env.totalMemGB, gpu: env.hasGPU, node: env.node },
    tools: plan.map(p => ({
      id: p.id, description: p.desc, installed: (p.dest && fs.existsSync(p.dest)) || cmdExists(p.id) || cmdExists('ecc'),
      source: p.git || p.npm || p.pip || 'local',
    })),
    metaOrchestrator: {
      available: true,
      command: 'meta "<task>"',
      supportedLLMs: ['claude-sonnet', 'claude-opus', 'gpt-4o', 'gemini-pro', 'deepseek-v4', 'hermes'],
      apiKeyRequired: process.env.OPENROUTER_API_KEY ? 'set' : 'not set (run: set OPENROUTER_API_KEY=your_key)',
    },
  };
  const manifestPath = path.join(ROOT, 'fuse.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  ok(`Personalized manifest written to fuse.json`);

  // Wire CLI global links
  tryExec(`npm link`, 10000);
  ok(`CLI wired: of <cmd> | meta "<task>"`);

  console.log('');

  // Summary
  console.log(`  ${BOLD}${CYAN}═══ Setup Complete ═══${RESET}`);
  console.log(`  ${installedCount}/${totalCount} tools installed`);
  console.log(`  Tier: ${env.canLocalLLM ? (env.highMem ? 'ENHANCED' : 'STANDARD') : 'BASIC'}`);
  console.log(`  Hardware: ${env.cpus} CPUs, ${env.totalMemGB}GB RAM${env.hasGPU ? ', GPU' : ''}`);
  console.log('');
  console.log(`  ${DIM}Next steps:${RESET}`);
  console.log(`  ${DIM}  1. meta "explain this project"${RESET}`);
  console.log(`  ${DIM}  2. of status   (check all components)${RESET}`);
  console.log(`  ${DIM}  3. set OPENROUTER_API_KEY for real LLM calls${RESET}`);
  console.log(`  ${DIM}  4. npm run optimize   (first LDR cycle)${RESET}`);
  console.log('');
}

main().catch(e => { console.error(e.message || e); process.exitCode = 1; });
