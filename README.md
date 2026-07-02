# Doc-Log

Doc-Log is a CLI that writes and maintains OpenWiki-style documentation for your codebase, built for both humans and coding agents. It runs on your **Cursor subscription** via the [Cursor SDK](https://cursor.com/docs/sdk/typescript) — no separate model-provider API keys required.

It is a fork of [langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) (MIT) with the LangChain/DeepAgents engine replaced by the Cursor agent.

## Requirements

- Node.js 20+
- A Cursor API key (`CURSOR_API_KEY`) — create one at Cursor Dashboard → Integrations
- `git` available on your PATH

## Install (from this repo)

```sh
pnpm install
pnpm run build
pnpm link --global   # exposes the `doc-log` binary
```

## Quick Start

From the repository you want to document:

```sh
doc-log --init
```

On the first interactive run, Doc-Log prompts for your `CURSOR_API_KEY` and a default model, and saves them to `~/.doc-log/.env`. In CI or non-interactive shells, export `CURSOR_API_KEY` instead.

## Usage

```sh
doc-log                      # interactive chat about the repo/docs
doc-log "message"            # chat with an initial request
doc-log --init [message]     # generate initial documentation in openwiki/
doc-log --update [message]   # surgically refresh docs from repo changes
doc-log flow <name>          # deep-dive, SDK-blueprint page for one flow
doc-log section <area>       # full domain section (overview + flows + reference)
doc-log -p "message"         # one-shot run, print output, exit
doc-log --modelId <id>       # use a specific Cursor model for the run
doc-log --doctor             # environment/credential/model diagnostics
doc-log --help               # usage and examples
```

Inside interactive chat, the same runs are available as slash commands:
`/init`, `/update`, `/flow <name>`, `/section <area>`, `/model`, `/provider`,
`/clear`, `/help`, `/exit`.

### Deep-dive flows and sections

`doc-log flow <name>` writes a single, thorough page at
`openwiki/flows/<name>.md` using a fixed 11-section template: overview, entry
points, UI component tree, state layer, hooks layer, services/API layer, the
data/type contract, an end-to-end walkthrough with Mermaid diagrams, edge cases,
an **SDK-refactor blueprint** (what business logic to extract into a
framework-agnostic core, plus inconsistencies that block extraction), and a
change guide. Names are slugs: lowercase letters, numbers, and hyphens.

`doc-log section <area>` builds a cohesive section under `openwiki/<area>/`: an
`overview.md`, one deep-dive page per flow in `openwiki/<area>/flows/`, and an
optional `reference.md` capturing the shared types, stores, hooks, and services
(the SDK contract for that area).

## How it works

- Documentation is written to `openwiki/` in the target repository (`quickstart.md` is the entrypoint).
- Run metadata (timestamp, git HEAD, model) is recorded in `openwiki/.last-update.json`, and update runs diff the repo against the recorded git HEAD so edits stay surgical. Metadata is only written when doc content actually changed.
- Doc-Log adds/refreshes an OpenWiki reference section in your top-level `AGENTS.md` / `CLAUDE.md` so coding agents discover the docs.
- Chat follow-ups in one session resume the same Cursor agent (conversation state is kept in `~/.doc-log/threads.json`).

## Configuration

Everything lives in `~/.doc-log/.env`:

| Key                | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| `CURSOR_API_KEY`   | Cursor API key used for all runs                   |
| `DOC_LOG_MODEL_ID` | Default Cursor model (e.g. `composer-2.5`, `auto`) |

Environment variables always win over the file. `DOC_LOG_DEBUG=1` enables verbose run diagnostics.
