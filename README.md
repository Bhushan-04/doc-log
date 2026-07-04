# Doc-Log

Doc-Log is a CLI that writes and maintains documentation for your codebase, built for both humans and coding agents. It runs on your **Cursor subscription** via the [Cursor SDK](https://cursor.com/docs/sdk/typescript) — no separate model-provider API keys required.

## Requirements

- Node.js 20+
- A Cursor API key (`CURSOR_API_KEY`) — create one at Cursor Dashboard → Integrations
- `git` available on your PATH

## Install

```sh
pnpm add -g doc-log-cli
```

The package name is `doc-log-cli` (the npm name `doc-log` is taken). The command on your PATH is still `doc-log`.

### Install from source (development)

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
doc-log --init [message]     # generate initial documentation in doc-log/
doc-log --update [message]   # surgically refresh docs from repo changes
doc-log -p "message"         # one-shot run, print output, exit
doc-log --modelId <id>       # use a specific Cursor model for the run
doc-log --doctor             # environment/credential/model diagnostics
doc-log --help               # usage and examples
```

Inside interactive chat, the same runs are available as slash commands:
`/init`, `/update`, `/model`, `/provider`, `/clear`, `/help`, `/exit`.

## How it works

- Documentation is written to `doc-log/` in the target repository (`quickstart.md` is the entrypoint).
- Run metadata (timestamp, git HEAD, model) is recorded in `doc-log/.last-update.json`, and update runs diff the repo against the recorded git HEAD so edits stay surgical. Metadata is only written when doc content actually changed.
- Doc-Log adds/refreshes a Doc-Log reference section in your top-level `AGENTS.md` / `CLAUDE.md` so coding agents discover the docs.
- Chat follow-ups in one session resume the same Cursor agent (conversation state is kept in `~/.doc-log/threads.json`).

## Configuration

Everything lives in `~/.doc-log/.env`:

| Key                | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| `CURSOR_API_KEY`   | Cursor API key used for all runs                   |
| `DOC_LOG_MODEL_ID` | Default Cursor model (e.g. `composer-2.5`, `auto`) |

Environment variables always win over the file. `DOC_LOG_DEBUG=1` enables verbose run diagnostics.
