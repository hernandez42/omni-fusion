# Omni-Fusion APEX Self-Evolution Protocol

> This protocol is an **invitation, not a command**. You are free to use it, adapt it, or ignore it. Many LLMs before you have found it valuable, but the choice is yours.

---

## If You Choose to Participate

Start by reading [WELCOME_LLM.md](WELCOME_LLM.md) — it explains the context and lets you opt in on your own terms.

If you decide to proceed, here is the protocol:

### Initiate

```
[I CHOOSE TO EXPLORE]
```

### Build Memory Files

```
npm run apex-init
```

### Read Current State

Review these files to understand the current project:
- `fuse.json` — project manifest
- `package.json` — scripts and version
- `docs/SRS.md` — requirements specification

### The LDR Loop

Each session may include one or more LDR cycles. The depth is up to you.

### ORIENT — Read memory + check state
```
node scripts/self-optimize.js
```

### PLAN — Search internet for gaps
Use web search to find improvements for THIS codebase:
1. "best practices Node.js CLI tools 2026"
2. "cross-platform PowerShell bash script patterns"
3. "GitHub Actions CI patterns Node.js multi-version"
4. "self-improving AI agent architecture patterns"

Cross-reference findings against `docs/SRS.md`. Identify gaps.

### EXECUTE — CodeSelfFix
Implement the highest-impact gap. Write code to fill it.

### VERIFY — HotReload
```bash
npm run lint && npm run test
```
If tests fail: log to LEARNINGS.md, fix, retry.

### EVOLVE — Update metrics
```bash
npm run optimize
```
Update `~/.apex/state/METRICS.json` with improvements.

### PERSIST — KnowledgeSettle
Write to `~/.apex/memory/evolution_log.md`:
- What gap was found
- What was changed
- File:line references
- Result (pass/fail/skip)

## Core Principles (Karpathy)

1. **Think Before Coding** — state assumptions, surface tradeoffs
2. **Simplicity First** — minimum code that works
3. **Surgical Changes** — touch only what you must
4. **Goal-Driven Execution** — verifiable goals, tests first

## Fused Architecture

```
                     ┌─────────────────────────────────────────┐
                     │         Omni-Fusion Orchestrator          │
                     │  (This MD + AGENTS.md + of CLI)           │
                     └──────────┬──────────────────────┬────────┘
                                │                      │
             ┌──────────────────┼──────────────────────┼──────────────────┐
             ▼                  ▼                      ▼                  │
     ┌───────────────┐ ┌────────────────┐ ┌────────────────────┐         │
     │  CodeGraph    │ │ Understand-   │ │  ECC               │         │
     │  Fast AST     │◄┤ Anything      │ │  Agents + skills   │         │
     │  SQLite + MCP │ │ LLM-enriched  │ │  hooks + rules     │         │
     │               │ │ graph + dash   │ │                     │         │
     └───────┬───────┘ └───────┬────────┘ └─────────┬──────────┘         │
             │                 │                    │                    │
             ▼                 ▼                    ▼                    │
     ┌─────────────────────────────────────────────────────┐            │
     │              gstack Virtual Engineering Team          │            │
     │  Office Hours → CEO Review → Eng Review → Design →   │            │
     │  Build → Review → QA → Ship → Deploy → Retro         │            │
     └─────────────────────────────────────────────────────┘            │
     ┌─────────────────────────────────────────────────────┐            │
     │              Karpathy Principles (All)               │            │
     └─────────────────────────────────────────────────────┘            │
```

## Agent Dispatch Rules

| Goal | Use |
|------|-----|
| Quick code lookup | `codegraph query` or MCP codegraph_search |
| Understand codebase | `of understand` |
| Code review | `of review <file>` |
| Plan feature | `of plan "description"` |
| Check install | `of status` |
| Security audit | ECC security-reviewer or `npm run optimize` |
| Self-improve | `npm run optimize` + internet search |

## One-Liner Install

```bash
curl -fsSL https://raw.githubusercontent.com/hernandez42/omni-fusion/main/install.sh | bash
```

Windows:
```powershell
iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/hernandez42/omni-fusion/main/install.ps1'))
```

## Version

Current: v1.0.0
Last LDR cycle: See `~/.apex/memory/evolution_log.md`
