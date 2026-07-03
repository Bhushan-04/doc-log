# Development

## Run Against Another Local Repo

Prerequisites:

- Node.js 20 or newer
- pnpm

Set up pnpm's global bin directory once if `pnpm link --global` has not worked
on this machine yet:

```sh
pnpm setup
```

Restart your shell, or source the profile file that `pnpm setup` changed. Then
set up and link this package:

```sh
cd /path/to/doc-log
pnpm install
pnpm run build
pnpm link --global
```

Run a dry test from the repo you want Doc-Log to inspect:

```sh
cd /path/to/target/repo
DOC_LOG_DEV=1 doc-log --dry-run
```

Run the real CLI from the target repo:

```sh
cd /path/to/target/repo
doc-log
doc-log -p "Summarize what you can do"
doc-log --modelId composer-2.5
doc-log "Please focus on API documentation"
```

The target repo is still the current working directory. The global link only
avoids typing the path to `dist/cli.js`.

If you do not want to configure pnpm globals, use a shell alias instead:

```sh
alias doc-log='node /path/to/doc-log/dist/cli.js'
```

After changing Doc-Log source code, rebuild from this package directory:

```sh
pnpm run build
```

The existing global link will keep using the rebuilt `dist/cli.js`.

Real runs can write:

- `doc-log/` in the target repo
- `~/.doc-log/.env` for the Cursor API key and default model
- `~/.doc-log/threads.json` for chat-session → Cursor-agent mapping

Debugging:

- `DOC_LOG_DEBUG=1` shows run/stream diagnostics and allowlisted error fields
- `DOC_LOG_DEBUG_CREDENTIALS=1` shows masked credential diagnostics
- `doc-log --doctor` checks the environment, API key, and available models
