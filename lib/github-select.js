// GitHub tool selector — finds best tools per category using GitHub API
const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CATEGORIES = {
  analysis: {
    keywords: ['code-analysis', 'ast', 'static-analysis', 'codegraph'],
    top: ['colbymchenry/codegraph', 'ast-grep/ast-grep', 'tree-sitter/tree-sitter'],
  },
  review: {
    keywords: ['code-review', 'ai-code-review', 'code-quality'],
    top: ['affaan-m/ECC', 'reviewdog/reviewdog', 'qiushiyan/ai-code-reviewer'],
  },
  security: {
    keywords: ['security-scanner', 'vulnerability-scan', 'semgrep'],
    top: ['semgrep/semgrep', 'aquasecurity/trivy', 'golangci/golangci-lint'],
  },
  agent: {
    keywords: ['ai-agent', 'autonomous-agent', 'self-improving-agent'],
    top: ['NousResearch/hermes-agent', 'cpacker/MemGPT', 'karpathy/autoresearch'],
  },
  workflow: {
    keywords: ['workflow-orchestration', 'pipeline', 'project-management'],
    top: ['garrytan/gstack', 'n8n-io/n8n', 'PrefectHQ/prefect'],
  },
  coding: {
    keywords: ['coding-agent', 'code-assistant', 'ai-copilot'],
    top: ['openai/codex', 'features/opencode', 'claudie/cursor'],
  },
};

function githubFetch(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      headers: {
        'User-Agent': 'omni-fusion/1.0',
        'Accept': 'application/vnd.github.v3+json',
      },
      timeout: 8000,
    };
    const req = https.get(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from GitHub')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function searchTools(category, env) {
  const cat = CATEGORIES[category];
  if (!cat) return [];

  // Try GitHub search for this category
  try {
    const query = cat.keywords.slice(0, 2).join('+') + `+language:${env.runtimes.python ? 'python' : 'javascript'}`;
    const data = await githubFetch(`/search/repositories?q=${query}&sort=stars&per_page=5`);
    if (data && data.items) {
      return data.items.map(item => ({
        id: item.full_name,
        name: item.name,
        stars: item.stargazers_count,
        url: item.html_url,
        description: item.description,
        language: item.language,
      }));
    }
  } catch {}

  // Fallback: return known top repos
  return cat.top.map(id => ({ id, name: id.split('/')[1], stars: 0, url: `https://github.com/${id}`, description: '', language: '' }));
}

async function selectTools(env) {
  const results = {};

  const categories = Object.keys(CATEGORIES);
  for (const cat of categories) {
    try {
      results[cat] = await searchTools(cat, env);
    } catch {
      results[cat] = [];
    }
  }

  return results;
}

function bestTool(category, searchResults, env) {
  const tools = searchResults[category] || [];
  if (tools.length === 0) return null;

  // Score tools by relevance + compatibility
  const scored = tools.map(t => {
    let score = t.stars || 0; // Stars as base score

    // Prefer tools that work on this OS
    if (env.os.isWindows && (t.language === 'C#' || t.language === 'TypeScript')) score += 10;
    if (env.os.isLinux && (t.language === 'Python' || t.language === 'Rust' || t.language === 'Go')) score += 10;
    if (env.os.isMac) score += 5; // macOS runs most things

    // Prefer tools with active maintenance (recent description mentions versions)
    if (t.description && (t.description.includes('2026') || t.description.includes('2025'))) score += 5;

    return { ...t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

module.exports = { searchTools, selectTools, bestTool, CATEGORIES };

if (require.main === module) {
  const env = require('./env-detect').detect();
  selectTools(env).then(results => {
    console.log('=== Top GitHub Tools by Category ===\n');
    for (const [cat, tools] of Object.entries(results)) {
      console.log(`[${cat.toUpperCase()}]`);
      if (tools.length === 0) { console.log('  (none found)\n'); continue; }
      for (const t of tools.slice(0, 3)) {
        console.log(`  ★ ${t.stars}  ${t.id}`);
        console.log(`     ${(t.description || 'no description').slice(0, 80)}`);
      }
      const best = bestTool(cat, results, env);
      if (best) console.log(`  → Best: ${best.id}\n`);
    }
  }).catch(e => console.error(e));
}
