// Environment detector — OS, CPU, GPU, RAM, runtimes, package managers
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function tryExec(cmd, timeout = 3000) {
  try { return execSync(cmd, { encoding: 'utf8', timeout, stdio: 'pipe' }).trim(); }
  catch { return null; }
}

function detect() {
  const env = {};

  // OS
  env.os = {
    platform: os.platform(),       // win32, darwin, linux
    release: os.release(),
    arch: os.arch(),               // x64, arm64
    homedir: os.homedir(),
    hostname: os.hostname(),
    isWindows: os.platform() === 'win32',
    isMac: os.platform() === 'darwin',
    isLinux: os.platform() === 'linux',
  };
  env.os.label = env.os.isWindows ? 'Windows' : env.os.isMac ? 'macOS' : 'Linux';

  // Hardware
  env.hardware = {
    cpus: os.cpus().length,
    cpuModel: os.cpus().length > 0 ? os.cpus()[0].model : 'unknown',
    totalMemGB: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
    freeMemGB: Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10,
  };

  // GPU detection
  env.hardware.gpu = null;
  try {
    if (env.os.isWindows) {
      const gpu = tryExec('wmic path win32_VideoController get name 2>nul');
      if (gpu) {
        const lines = gpu.split('\n').filter(l => l.trim() && !l.includes('Name'));
        if (lines.length > 0) env.hardware.gpu = lines[0].trim();
      }
    } else if (env.os.isLinux) {
      env.hardware.gpu = tryExec('lspci | grep -i "vga\\|3d" 2>/dev/null') || tryExec('glxinfo -B 2>/dev/null | grep "Device:"');
    } else if (env.os.isMac) {
      env.hardware.gpu = tryExec('system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model"');
    }
  } catch {}

  // Detect NVIDIA CUDA
  env.hardware.hasCuda = tryExec('nvcc --version 2>/dev/null') !== null
    || (env.os.isWindows && tryExec('where nvcc 2>nul') !== null);

  // Detect ROCm / Apple Metal
  env.hardware.hasRocm = tryExec('rocminfo 2>/dev/null') !== null;
  env.hardware.hasMetal = env.os.isMac;

  // Runtimes
  env.runtimes = {
    node: tryExec('node --version'),
    npm: tryExec('npm --version'),
    python: tryExec('python --version 2>&1') || tryExec('python3 --version 2>&1'),
    pip: tryExec('pip --version 2>&1') || tryExec('pip3 --version 2>&1'),
    git: tryExec('git --version'),
    rust: tryExec('rustc --version'),
    go: tryExec('go version'),
    java: tryExec('java -version 2>&1'),
    docker: tryExec('docker --version'),
  };

  // Package managers
  env.pkgManagers = {
    npm: env.runtimes.npm !== null,
    pip: env.runtimes.pip !== null,
    cargo: tryExec('cargo --version') !== null,
    go: tryExec('go version') !== null,
    brew: tryExec('brew --version') !== null,
    choco: tryExec('choco --version') !== null,
    winget: tryExec('winget --version') !== null,
    apt: tryExec('apt --version 2>/dev/null') !== null,
  };

  // Existing omni-fusion components
  env.existing = {
    codegraph: tryExec('codegraph --version') || 'not installed',
    ecc: fs.existsSync(path.join(os.homedir(), '.claude', 'agents')) ? 'installed' : 'not installed',
    gstack: fs.existsSync(path.join(os.homedir(), '.claude', 'skills', 'gstack')) ? 'installed' : 'not installed',
    claudeCode: tryExec('claude --version') || 'not installed',
    codexCLI: tryExec('codex --version') || 'not installed',
    opencode: tryExec('opencode --version') || 'not installed',
  };

  // Derived capability scores
  env.capability = {
    canRunLocalLLM: (env.hardware.hasCuda || env.hardware.hasRocm || env.hardware.hasMetal)
      && env.hardware.totalMemGB >= 16,
    isHighMem: env.hardware.totalMemGB >= 32,
    isServer: env.hardware.totalMemGB >= 64 && env.os.isLinux,
    hasModernNode: env.runtimes.node ? parseFloat(env.runtimes.node.replace('v', '')) >= 18 : false,
  };

  return env;
}

// Generate install profile from environment
function recommendProfile(env) {
  const profile = {
    tier: 'basic',
    tools: [],
    reason: [],
  };

  // Tier classification
  if (env.capability.isServer && env.capability.canRunLocalLLM) {
    profile.tier = 'ultimate';
    profile.reason.push('Server-grade hardware with GPU — full stack');
  } else if (env.capability.canRunLocalLLM && env.capability.isHighMem) {
    profile.tier = 'enhanced';
    profile.reason.push('GPU + 32GB+ RAM — local LLM capable');
  } else if (env.capability.canRunLocalLLM) {
    profile.tier = 'standard';
    profile.reason.push('GPU available — some local inference');
  } else {
    profile.tier = 'basic';
    profile.reason.push('Standard hardware — cloud LLM recommended');
  }

  // Tool recommendations by category
  const tools = [
    { id: 'codegraph', category: 'analysis', minTier: 'basic', desc: 'AST knowledge graph (fast, local)' },
    { id: 'ecc-agents', category: 'review', minTier: 'basic', desc: '48 code review agents' },
    { id: 'gstack', category: 'workflow', minTier: 'basic', desc: 'Virtual engineering sprint lifecycle' },
    { id: 'semgrep', category: 'security', minTier: 'standard', desc: 'Static analysis security scanning', has: env.runtimes.python },
    { id: 'trivy', category: 'security', minTier: 'standard', desc: 'Vulnerability scanner', has: env.pkgManagers.brew || env.pkgManagers.apt || env.os.isWindows },
    { id: 'autoresearch', category: 'research', minTier: 'enhanced', desc: 'Auto research agent loop (Karpathy)', has: env.runtimes.python && env.capability.canRunLocalLLM },
    { id: 'hermes-agent', category: 'agent', minTier: 'standard', desc: 'Self-improving AI agent (Nous Research)', has: env.runtimes.python },
    { id: 'letta', category: 'memory', minTier: 'standard', desc: 'MemGPT persistent memory', has: env.runtimes.python },
    { id: 'codex-cli', category: 'coding', minTier: 'standard', desc: 'OpenAI Codex CLI coding agent', has: env.capability.hasModernNode && env.pkgManagers.npm },
  ];

  const tierOrder = { basic: 0, standard: 1, enhanced: 2, ultimate: 3 };
  const currentTier = tierOrder[profile.tier];

  for (const tool of tools) {
    if (tierOrder[tool.minTier] > currentTier) continue;
    if (tool.has === false) continue; // explicitly unavailable
    profile.tools.push(tool);
  }

  return profile;
}

module.exports = { detect, recommendProfile };

if (require.main === module) {
  const env = detect();
  const profile = recommendProfile(env);
  console.log(JSON.stringify({ env, profile }, null, 2));
}
