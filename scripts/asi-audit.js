// ASI audit: find hardcoded paths, console.log in prod, catch{} emptiness, fake data
const fs = require('fs');
const path = require('path');
const root = process.argv[2] || __dirname;
const bugs = [];

function walk(dir, relPrefix) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.of-optimize' || e.name === '.of-reviews' || e.name === '.of-plans') continue;
    const fp = path.join(dir, e.name);
    const rel = relPrefix ? relPrefix + '/' + e.name : e.name;
    if (e.isDirectory()) walk(fp, rel);
    else if (/\.(js|json|ps1|sh)$/.test(e.name)) auditFile(fp, rel);
  }
}

function auditFile(fp, rel) {
  let content;
  try { content = fs.readFileSync(fp, 'utf8'); } catch { return; }
  const lines = content.split('\n');

  // Hardcoded absolute Windows paths
  if (rel.endsWith('.js') || rel.endsWith('.ps1') || rel.endsWith('.sh')) {
    lines.forEach((l, i) => {
      const trimmed = l.trim();
      if (/['"][A-Za-z]:\\/.test(trimmed)
          && !trimmed.includes('process.env')
          && !trimmed.includes('path.join')
          && !trimmed.includes('__dirname')
          && !trimmed.includes('os.homedir')
          && !trimmed.includes('APEX_DIR')
          && !trimmed.includes('ROOT')) {
        bugs.push({ file: rel, line: i + 1, severity: 'high', type: 'hardcoded-path', text: trimmed.slice(0, 100) });
      }
    });
  }

  // console.log in lib/meta/bin
  if (/^(lib|meta|bin)\//.test(rel.replace(/\\/g, '/')) && rel.endsWith('.js')) {
    lines.forEach((l, i) => {
      const trimmed = l.trim();
      if (/console\.(log|debug)/.test(trimmed) && !trimmed.startsWith('//')) {
        bugs.push({ file: rel, line: i + 1, severity: 'low', type: 'console-log', text: trimmed.slice(0, 100) });
      }
    });
  }

  // Empty catch {} blocks
  if (rel.endsWith('.js')) {
    lines.forEach((l, i) => {
      if (/^\s*catch\s*\{\s*\}/.test(l)) {
        bugs.push({ file: rel, line: i + 1, severity: 'medium', type: 'empty-catch', text: 'Empty catch block — swallows errors' });
      }
    });
  }
}

walk(root, '');
console.log(JSON.stringify(bugs, null, 2));
