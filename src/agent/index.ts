import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  Agent,
  CursorAgentError,
  type SDKAgent,
  type SDKMessage,
} from "@cursor/sdk";
import { loadOpenWikiEnv, openWikiEnvDir } from "../env.js";
import { createSystemPrompt, createUserPrompt } from "./prompt.js";
import type {
  OpenWikiCommand,
  OpenWikiRunEvent,
  OpenWikiRunOptions,
  OpenWikiRunResult,
} from "./types.js";
import {
  CURSOR_API_KEY_ENV_KEY,
  DEFAULT_MODEL_ID,
  isValidModelId,
  normalizeModelId,
  OPENWIKI_MODEL_ID_ENV_KEY,
} from "../constants.js";
import {
  createOpenWikiContentSnapshot,
  createRunContext,
  writeLastUpdateMetadata,
} from "./utils.js";

export async function runOpenWikiAgent(
  command: OpenWikiCommand,
  cwd = process.cwd(),
  options: OpenWikiRunOptions = {},
): Promise<OpenWikiRunResult> {
  emitDebug(options, `command=${command}`);
  emitDebug(options, `cwd=${cwd}`);
  emitDebug(
    options,
    `userMessage=${options.userMessage ? "provided" : "not-provided"}`,
  );
  emitDebug(options, `userMessage.followup=${options.isFollowup === true}`);

  await loadOpenWikiEnv();
  emitDebug(options, "env=loaded ~/.doc-log/.env");

  const apiKey = process.env[CURSOR_API_KEY_ENV_KEY];

  if (!apiKey) {
    throw new Error(`${CURSOR_API_KEY_ENV_KEY} is required to run Doc-Log.`);
  }

  emitDebug(options, "credentials=cursor key present");
  const modelId = resolveModelId(options);
  emitDebug(options, `model=${modelId}`);

  const context = await createRunContext(command, cwd);
  emitDebug(options, "context=created");
  const openWikiSnapshotBefore =
    command === "chat" ? null : await createOpenWikiContentSnapshot(cwd);
  emitDebug(options, "openwiki.snapshot=created");

  const threadId = options.threadId ?? createOpenWikiThreadId(cwd);
  emitDebug(options, `thread=${threadId}`);

  let agent: SDKAgent | null = null;

  try {
    agent = await createOrResumeAgent(threadId, cwd, apiKey, modelId, options);
    emitDebug(options, `agent=${agent.agentId}`);
    await saveThreadAgentId(threadId, agent.agentId);

    const prompt = createRunUserMessage(command, cwd, context, options);
    const run = await agent.send(prompt, { model: { id: modelId } });

    emitDebug(options, `run=${run.id}`);

    for await (const message of run.stream()) {
      const event = mapSdkMessage(message);

      if (event) {
        options.onEvent?.(event);
      } else if (options.debug) {
        emitDebug(options, `stream.unhandled type=${message.type}`);
      }
    }
    emitDebug(options, "stream=completed");

    const result = await run.wait();
    emitDebug(options, `run.status=${result.status}`);

    if (result.status !== "finished") {
      throw new Error(
        `Doc-Log run ${result.status}${result.result ? `: ${result.result}` : "."}`,
      );
    }

    if (
      command !== "chat" &&
      openWikiSnapshotBefore !== (await createOpenWikiContentSnapshot(cwd))
    ) {
      await writeLastUpdateMetadata(command, cwd, modelId);
      emitDebug(options, "metadata=written");
    } else {
      emitDebug(
        options,
        command === "chat"
          ? "metadata=skipped command=chat"
          : "metadata=skipped openwiki=unchanged",
      );
    }

    return {
      command,
      model: modelId,
    };
  } catch (error) {
    if (error instanceof CursorAgentError) {
      throw new Error(
        `Cursor agent failed to start: ${error.message}${
          error.isRetryable ? " (retryable)" : ""
        }`,
        { cause: error },
      );
    }

    throw error;
  } finally {
    if (agent) {
      await disposeAgent(agent);
    }
  }
}

async function createOrResumeAgent(
  threadId: string,
  cwd: string,
  apiKey: string,
  modelId: string,
  options: OpenWikiRunOptions,
): Promise<SDKAgent> {
  const existingAgentId = await readThreadAgentId(threadId);

  if (existingAgentId) {
    try {
      const agent = await Agent.resume(existingAgentId, {
        apiKey,
        local: { cwd },
      });

      emitDebug(options, `agent.resumed=${existingAgentId}`);

      return agent;
    } catch {
      emitDebug(
        options,
        `agent.resumeFailed=${existingAgentId} creating new agent`,
      );
    }
  }

  return Agent.create({
    apiKey,
    model: { id: modelId },
    local: { cwd },
    name: `doc-log ${path.basename(cwd)}`,
  });
}

async function disposeAgent(agent: SDKAgent): Promise<void> {
  try {
    await agent[Symbol.asyncDispose]();
  } catch {
    // Disposal failures should not mask run results.
  }
}

function createRunUserMessage(
  command: OpenWikiCommand,
  cwd: string,
  context: Awaited<ReturnType<typeof createRunContext>>,
  options: OpenWikiRunOptions,
): string {
  if (options.isFollowup === true && options.userMessage?.trim()) {
    return options.userMessage.trim();
  }

  return `
${createSystemPrompt(command)}

---

${createUserPrompt(command, context, options.userMessage ?? null)}

Repository root:
${cwd}

Runtime note:
- Treat the repository root above as the only project you are documenting.
- Work only inside that repository. Do not read, search, or modify parent directories or unrelated repositories.
- Use paths relative to the repository root, for example doc-log/quickstart.md and README.md.
`.trim();
}

const threadStatePath = path.join(openWikiEnvDir, "threads.json");
const MAX_THREAD_ENTRIES = 50;

async function readThreadAgentId(threadId: string): Promise<string | null> {
  const state = await readThreadState();
  const agentId = state[threadId];

  return typeof agentId === "string" && agentId.length > 0 ? agentId : null;
}

async function saveThreadAgentId(
  threadId: string,
  agentId: string,
): Promise<void> {
  const state = await readThreadState();

  delete state[threadId];
  state[threadId] = agentId;

  const entries = Object.entries(state).slice(-MAX_THREAD_ENTRIES);

  await mkdir(openWikiEnvDir, {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(
    threadStatePath,
    `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

async function readThreadState(): Promise<Record<string, string>> {
  try {
    const parsed = JSON.parse(
      await readFile(threadStatePath, "utf8"),
    ) as unknown;

    if (!isRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function createOpenWikiThreadId(cwd = process.cwd()): string {
  const digest = createHash("sha256").update(path.resolve(cwd)).digest("hex");

  return `doc-log-${digest.slice(0, 32)}-${createRunThreadId()}`;
}

function createRunThreadId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function resolveModelId(options: OpenWikiRunOptions): string {
  const rawModelId =
    options.modelId ??
    process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
    DEFAULT_MODEL_ID;
  const modelId = normalizeModelId(rawModelId);

  if (!isValidModelId(modelId)) {
    throw new Error(
      `Invalid model ID configured in ${OPENWIKI_MODEL_ID_ENV_KEY}.`,
    );
  }

  return modelId;
}

function mapSdkMessage(message: SDKMessage): OpenWikiRunEvent | null {
  if (message.type === "assistant") {
    const text = message.message.content
      .filter(
        (block): block is Extract<typeof block, { type: "text" }> =>
          block.type === "text",
      )
      .map((block) => block.text)
      .join("");

    return text.length > 0
      ? {
          source: "main",
          type: "text",
          text: `${text}\n\n`,
        }
      : null;
  }

  if (message.type === "tool_call") {
    if (message.status === "running") {
      return {
        type: "tool_start",
        call: `${message.name}(${formatToolArgs(message.args)})`,
        id: message.call_id,
        input: message.args,
        name: message.name,
      };
    }

    return {
      type: "tool_end",
      id: message.call_id,
      name: message.name,
      status: message.status === "error" ? "error" : "finished",
    };
  }

  return null;
}

function formatToolArgs(input: unknown): string {
  const value = parseStringifiedJson(input);

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, argValue]) => `${key}=${formatToolValue(argValue)}`)
      .join(", ");
  }

  if (Array.isArray(value)) {
    return value.map(formatToolValue).join(", ");
  }

  if (value === undefined || value === null) {
    return "";
  }

  return formatToolValue(value);
}

function formatToolValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return JSON.stringify(value) ?? String(value);
}

function parseStringifiedJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function emitDebug(options: OpenWikiRunOptions, message: string): void {
  if (!options.debug) {
    return;
  }

  options.onEvent?.({
    type: "debug",
    message,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
