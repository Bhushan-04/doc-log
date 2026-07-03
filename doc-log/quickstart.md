# Doc-Log Quickstart

Doc-Log is a CLI that writes and maintains **documentation** for any Git repository. It runs a Cursor-powered documentation agent against the **current working directory** and writes output to `doc-log/` in that repo.

## Product model

| Actor                   | Role                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **User**                | Runs `doc-log` from a target repository's root; configures credentials once in `~/.doc-log/.env`                       |
| **Doc-Log CLI**         | Parses commands, manages terminal UI, orchestrates Cursor agent, tracks threads and run metadata                       |
| **Documentation agent** | Inspects the target repo (read-only except `doc-log/` and top-level `AGENTS.md`/`CLAUDE.md`), writes grounded Markdown |
| **Target repository**   | Receives `doc-log/` docs plus optional agent-instruction file updates so future coding agents find the docs            |

Three run modes: **chat** (Q&A, no doc writes unless asked), **init** (first documentation pass), **update** (surgical refresh from git/source changes since last successful run).

## What Doc-Log produces

When you run `doc-log --init` or `doc-log --update` from a target repository, the agent:

1. Inspects the repository (source, existing docs, git history when available).
2. Writes or refreshes Markdown under `doc-log/` (`quickstart.md` is always the entrypoint).
3. Adds or updates a **Doc-Log reference section** in top-level `AGENTS.md` and/or `CLAUDE.md` so coding agents discover the docs.
4. Records run metadata in `doc-log/.last-update.json` **only when documentation content actually changed** (metadata itself is excluded from the change check).

Interactive chat (`doc-log` with no init/update flag) answers questions about the repo or docs without modifying the docs unless you explicitly ask.

## Requirements

| Requirement      | Notes                                        |
| ---------------- | -------------------------------------------- |
| Node.js 20+      | See `package.json` `engines`                 |
| `git` on PATH    | Used for change summaries during init/update |
| `CURSOR_API_KEY` | Create at Cursor Dashboard → Integrations    |

## Install Doc-Log

```sh
pnpm add -g doc-log-cli
```

The npm package is `doc-log-cli`; the command on your PATH is still `doc-log`.

### Install from source (development)

```sh
pnpm install
pnpm run build
pnpm link --global   # exposes the `doc-log` binary
```

See [DEVELOPMENT.md](../DEVELOPMENT.md) for `pnpm setup`, shell aliases, and linking without global pnpm.

## Run Doc-Log against another repository

Change into the repository you want documented, then:

```sh
doc-log --init          # first-time documentation generation
doc-log --update        # surgical refresh from recent changes
doc-log                   # interactive chat
doc-log "your question"   # chat with an initial message
doc-log -p "one-shot question"   # print answer and exit
doc-log --doctor          # environment and credential diagnostics
doc-log --help            # usage and examples
```

On the first interactive run, Doc-Log prompts for `CURSOR_API_KEY` and a default model, saving them to `~/.doc-log/.env`. In CI or non-interactive shells, export `CURSOR_API_KEY` (and optionally `DOC_LOG_MODEL_ID`) in the environment instead.

### Useful options

| Option               | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `--init [message]`   | Generate initial `doc-log/` documentation                                 |
| `--update [message]` | Update existing docs from repo/git changes                                |
| `-p`, `--print`      | One-shot run; print final output and exit                                 |
| `--modelId <id>`     | Override model for this run (e.g. `composer-2.5`, `auto`)                 |
| `--doctor`           | Check Node, git, credentials, Cursor API, available models                |
| `--dry-run`          | Dev only (`DOC_LOG_DEV=1`): show what would run without calling the agent |

Follow-up messages in one interactive session resume the same Cursor agent thread (mapped in `~/.doc-log/threads.json`). On follow-ups, Doc-Log sends **only the user's new message** to the resumed agent — it does not re-send the full system prompt (`isFollowup` in `src/agent/index.ts`).

### Interactive slash commands

After a run completes, the chat input accepts slash commands (see `src/cli.tsx`):

| Command                   | Action                                           |
| ------------------------- | ------------------------------------------------ |
| `/init [message]`         | Run initial documentation generation             |
| `/update [message]`       | Refresh existing docs from repo changes          |
| `/model` or `/model <id>` | Switch Cursor model (saved to `~/.doc-log/.env`) |
| `/provider`               | Switch provider (currently only Cursor)          |
| `/clear`                  | Start a fresh thread and clear chat history      |
| `/help`                   | List slash commands                              |
| `/exit`                   | Quit                                             |

Init and update runs from the CLI (`doc-log --init`) auto-exit when finished; interactive chat stays open for follow-ups.

## Configuration

User-level configuration lives in `~/.doc-log/.env`:

| Key                | Purpose                                                      |
| ------------------ | ------------------------------------------------------------ |
| `CURSOR_API_KEY`   | Cursor API key for all runs                                  |
| `DOC_LOG_MODEL_ID` | Default model (built-in suggestions: `composer-2.5`, `auto`) |
| `DOC_LOG_PROVIDER` | Provider selector (currently only `cursor`)                  |

Environment variables always override the file. Debug flags:

- `DOC_LOG_DEBUG=1` — verbose run/stream diagnostics
- `DOC_LOG_DEBUG_CREDENTIALS=1` — masked credential diagnostics
- `DOC_LOG_DEV=1` — enables `--dry-run` and extra help examples

**Do not commit API keys.** Store credentials only in `~/.doc-log/.env` or your shell environment.

### CI and non-interactive runs

When stdin is not a TTY (CI, pipes) or when using `-p` / `--print`, Doc-Log does **not** show the interactive credential setup UI. Export `CURSOR_API_KEY` (and optionally `DOC_LOG_MODEL_ID`) in the environment before running. See `resolveStartupCommand` in `src/cli.tsx` — missing keys produce exit code 1 with a clear error message.

## Doc-Log layout (in target repositories)

Doc-Log follows a consistent structure in each documented repo:

```
doc-log/
  quickstart.md              # Entrypoint — start here
  architecture/              # Optional section dirs when the repo warrants it
  workflows/
  ...
  .last-update.json          # Written by CLI after successful init/update with content changes
```

Section directories appear when the codebase is large enough to need them. Small repos typically get `quickstart.md` plus one or two focused pages.

The agent prompt (`src/agent/prompt.ts`) defines documentation discipline: grounded claims, surgical updates, temporary planning file (`_plan.md`) during runs, and strict scope (only `doc-log/` plus top-level `AGENTS.md`/`CLAUDE.md`).

## This repository's layout

Doc-Log documents **other** repositories; this repo is the CLI itself:

```
src/
  cli.tsx           # Ink/React terminal UI and run loop
  commands.ts       # argv parsing and --help text
  constants.ts      # paths, env keys, model/provider config
  credentials.tsx   # first-run API key / model setup UI
  doctor.ts         # doc-log --doctor diagnostics
  env.ts            # ~/.doc-log/.env load/save
  sdk-bootstrap.ts  # sets CURSOR_RIPGREP_PATH for Cursor SDK (imported first from cli)
  agent/
    index.ts        # Cursor SDK agent create/resume, run orchestration
    prompt.ts       # system/user prompts for init/update/chat
    types.ts        # command and event types
    utils.ts        # git summaries, content snapshot, .last-update.json
```

Build output: `dist/cli.js` (see `package.json` `bin`).

**Git note:** This repository currently has no commits on `master`. Init/update runs still work, but git summaries passed to the agent may show empty history or failed `HEAD` resolution until the first commit (`createGitSummary` in `src/agent/utils.ts` captures stderr rather than failing). After the first commit, future `--update` runs can diff meaningfully from `doc-log/.last-update.json`'s recorded `gitHead`. If `gitHead` in metadata is invalid, update runs fall back to `updatedAt` for log scoping.

## Development and CI

Local development workflow:

```sh
pnpm run dev          # tsx src/cli.tsx (from doc-log repo)
pnpm run build        # tsc → dist/
pnpm run lint:check   # eslint
pnpm run format:check # prettier
```

To test against another repo without reinstalling:

```sh
cd /path/to/target/repo
DOC_LOG_DEV=1 doc-log --dry-run
doc-log --init
```

GitHub Actions (`.github/workflows/checks.yml`) runs `format:check` and `lint:check` on pull requests. There is no automated test suite in this repo yet; validate changes with build, lint, format, and manual CLI runs.

## Where to go next

| Topic                                                | Page                                              |
| ---------------------------------------------------- | ------------------------------------------------- |
| CLI flow, agent orchestration, prompts, git/metadata | [Architecture overview](architecture/overview.md) |
| Package scripts, linking, dry-run                    | [DEVELOPMENT.md](../DEVELOPMENT.md)               |
| User-facing install and usage                        | [README.md](../README.md)                         |

## Change guidance for agents

When modifying Doc-Log:

| Area                       | Start here                          | Watch out for                                                   |
| -------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| CLI flags / help           | `src/commands.ts`                   | Keep `parseCommand` and `helpContent` in sync                   |
| Terminal UI                | `src/cli.tsx`                       | Large React/Ink component; test interactive and `--print` modes |
| Agent behavior             | `src/agent/prompt.ts`               | Prompt changes affect all documented repos                      |
| Run metadata / git context | `src/agent/utils.ts`                | Update runs depend on `.last-update.json` and `gitHead`         |
| Credentials                | `src/env.ts`, `src/credentials.tsx` | Never log or document secret values                             |
| Models / env keys          | `src/constants.ts`                  | `isValidModelId` regex must accept Cursor model IDs             |

After code changes: `pnpm run build`, then exercise `doc-log --doctor` and a `--dry-run` or real init/update against a sample repo.
