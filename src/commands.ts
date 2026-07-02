import {
  isValidModelId,
  isValidTarget,
  normalizeModelId,
  normalizeTarget,
} from "./constants.js";
import type { OpenWikiCommand } from "./agent/types.js";

export type HelpRow = {
  label: string;
  description: string;
};

export type HelpContent = {
  title: string;
  description: string;
  usage: string[];
  commands: HelpRow[];
  options: HelpRow[];
  developmentOptions: HelpRow[];
  examples: string[];
  developmentExamples: string[];
};

export type CliCommand =
  | { kind: "help"; exitCode: 0 }
  | { kind: "doctor"; exitCode: 0 }
  | {
      kind: "run";
      exitCode: 0;
      command: OpenWikiCommand;
      dryRun: boolean;
      modelId: string | null;
      print: boolean;
      shouldStart: boolean;
      target: string | null;
      userMessage: string | null;
    }
  | {
      kind: "error";
      exitCode: 1;
      message: string;
    };

export function parseCommand(argv: string[]): CliCommand {
  if (argv[0] === "--help" || argv[0] === "-h") {
    return { kind: "help", exitCode: 0 };
  }

  let dryRun = false;
  let modelId: string | null = null;
  let print = false;
  let command: OpenWikiCommand = "chat";
  let target: string | null = null;
  const userMessageParts: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      return { kind: "help", exitCode: 0 };
    }

    if (arg === "--doctor" || arg === "doctor") {
      return { kind: "doctor", exitCode: 0 };
    }

    const isTargetSubcommand =
      (arg === "flow" ||
        arg === "section" ||
        arg === "--flow" ||
        arg === "--section") &&
      command === "chat" &&
      userMessageParts.length === 0;

    if (isTargetSubcommand) {
      command = arg === "flow" || arg === "--flow" ? "flow" : "section";
      const rawTarget = argv[index + 1];

      if (!rawTarget || rawTarget.startsWith("-")) {
        return {
          kind: "error",
          exitCode: 1,
          message: `${command} requires a name, for example: doc-log ${command} access-control`,
        };
      }

      if (!isValidTarget(rawTarget)) {
        return {
          kind: "error",
          exitCode: 1,
          message: `Invalid ${command} name: ${rawTarget}. Use lowercase letters, numbers, and hyphens.`,
        };
      }

      target = normalizeTarget(rawTarget);
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      if (!isDevelopmentMode()) {
        return {
          kind: "error",
          exitCode: 1,
          message: `Unknown option: ${arg}`,
        };
      }

      dryRun = true;
      continue;
    }

    if (arg === "--print" || arg === "-p") {
      print = true;
      continue;
    }

    if (arg === "--init" || arg === "--update") {
      const nextCommand = arg === "--init" ? "init" : "update";

      if (command !== "chat" && command !== nextCommand) {
        return {
          kind: "error",
          exitCode: 1,
          message: "--init and --update cannot be used together.",
        };
      }

      command = nextCommand;
      continue;
    }

    if (arg === "--modelId" || arg === "--model-id") {
      const nextArg = argv[index + 1];

      if (!nextArg || nextArg.startsWith("-")) {
        return {
          kind: "error",
          exitCode: 1,
          message: `${arg} requires a model ID.`,
        };
      }

      const parsedModelId = normalizeModelId(nextArg);

      if (!isValidModelId(parsedModelId)) {
        return {
          kind: "error",
          exitCode: 1,
          message: `Invalid model ID: ${nextArg}`,
        };
      }

      modelId = parsedModelId;
      index += 1;
      continue;
    }

    if (arg.startsWith("--modelId=") || arg.startsWith("--model-id=")) {
      const [, rawModelId = ""] = arg.split("=", 2);
      const parsedModelId = normalizeModelId(rawModelId);

      if (!isValidModelId(parsedModelId)) {
        return {
          kind: "error",
          exitCode: 1,
          message: `Invalid model ID: ${rawModelId}`,
        };
      }

      modelId = parsedModelId;
      continue;
    }

    if (arg.startsWith("-")) {
      return {
        kind: "error",
        exitCode: 1,
        message: `Unknown option: ${arg}`,
      };
    }

    userMessageParts.push(arg);
  }

  const userMessage =
    userMessageParts.length > 0 ? userMessageParts.join(" ") : null;
  const shouldStart = command !== "chat" || userMessage !== null;

  if (print && !shouldStart) {
    return {
      kind: "error",
      exitCode: 1,
      message: "-p, --print requires a message, --init, or --update.",
    };
  }

  return {
    kind: "run",
    exitCode: 0,
    command,
    dryRun,
    modelId,
    print,
    shouldStart,
    target,
    userMessage,
  };
}

export function isDevelopmentMode(): boolean {
  return (
    process.env.NODE_ENV === "development" || process.env.DOC_LOG_DEV === "1"
  );
}

export const helpContent: HelpContent = {
  title: "Doc-Log",
  description:
    "Run a Cursor-powered documentation agent that generates and maintains a project wiki.",
  usage: [
    "doc-log [--modelId <model>]",
    "doc-log [--modelId <model>] [message]",
    "doc-log --init [message]",
    "doc-log --update [message]",
    "doc-log flow <name> [message]",
    "doc-log section <area> [message]",
  ],
  commands: [
    {
      label: "doc-log",
      description: "Open the interactive Doc-Log chat.",
    },
  ],
  options: [
    {
      label: "--init",
      description: "Generate initial OpenWiki documentation.",
    },
    {
      label: "--update",
      description: "Update existing OpenWiki documentation.",
    },
    {
      label: "flow <name>",
      description: "Write a deep-dive, SDK-blueprint page for one flow.",
    },
    {
      label: "section <area>",
      description: "Build a full domain section: overview, flows, references.",
    },
    {
      label: "-p, --print",
      description: "Run once and print the final assistant output.",
    },
    {
      label: "--modelId <id>",
      description: "Use a Cursor model ID for this run.",
    },
    {
      label: "--doctor",
      description: "Print environment and credential diagnostics.",
    },
  ],
  developmentOptions: [
    {
      label: "--dry-run",
      description: "Show what would run without invoking the agent.",
    },
  ],
  examples: [
    "doc-log",
    "doc-log --init",
    "doc-log --update",
    "doc-log flow access-control",
    'doc-log section gallery-experience "focus on the image grid and selection"',
    'doc-log "What can you do?"',
    'doc-log -p "Summarize what Doc-Log can do"',
    "doc-log --modelId composer-2.5",
    'doc-log --update --modelId composer-2.5 "Please document the API routes first"',
  ],
  developmentExamples: ["doc-log --dry-run"],
};

export function getHelpText(): string {
  const helpSections = [
    helpContent.title,
    `  ${helpContent.description}`,
    "",
    "Usage",
    ...helpContent.usage.map((line) => `  ${line}`),
    "",
    "Commands",
    ...formatRows(helpContent.commands),
    "",
    "Options",
    ...formatRows(helpContent.options),
    "",
  ];

  if (isDevelopmentMode()) {
    helpSections.push(
      "Development Options",
      ...formatRows(helpContent.developmentOptions),
      "",
    );
  }

  helpSections.push(
    "Examples",
    ...helpContent.examples.map((line) => `  ${line}`),
  );

  if (isDevelopmentMode()) {
    helpSections.push(
      ...helpContent.developmentExamples.map((line) => `  ${line}`),
    );
  }

  return helpSections.join("\n");
}

function formatRows(rows: HelpRow[]): string[] {
  const labelWidth = Math.max(...rows.map((row) => row.label.length));

  return rows.map(
    (row) => `  ${row.label.padEnd(labelWidth)}  ${row.description}`,
  );
}
