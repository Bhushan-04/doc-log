import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Cursor } from "@cursor/sdk";
import {
  CURSOR_API_KEY_ENV_KEY,
  DEFAULT_MODEL_ID,
  OPENWIKI_MODEL_ID_ENV_KEY,
} from "./constants.js";
import {
  getCredentialDiagnostics,
  loadOpenWikiEnv,
  openWikiEnvPath,
} from "./env.js";

const execFileAsync = promisify(execFile);

export async function runDoctor(): Promise<number> {
  await loadOpenWikiEnv();

  const write = (line = "") => process.stdout.write(`${line}\n`);

  write("Doc-Log doctor");
  write();
  write(`node       ${process.version} (${process.platform} ${process.arch})`);
  write(`cwd        ${process.cwd()}`);
  write(`env file   ${openWikiEnvPath}`);
  write(`git        ${await getGitVersion()}`);
  write(`git repo   ${await isInsideGitRepo()}`);
  write();

  write("Credentials (secrets are masked)");

  for (const diagnostic of await getCredentialDiagnostics()) {
    const warnings =
      diagnostic.warnings.length > 0
        ? ` warnings=${diagnostic.warnings.join(", ")}`
        : "";

    write(
      `  ${diagnostic.key.padEnd(18)} source=${diagnostic.source} length=${
        diagnostic.length ?? "unset"
      } preview=${diagnostic.preview}${warnings}`,
    );
  }

  write();

  const apiKey = process.env[CURSOR_API_KEY_ENV_KEY];

  if (!apiKey) {
    write(
      `${CURSOR_API_KEY_ENV_KEY} is not set. Run doc-log in an interactive terminal to save it, or export it in your shell.`,
    );

    return 1;
  }

  const configuredModelId =
    process.env[OPENWIKI_MODEL_ID_ENV_KEY] ?? DEFAULT_MODEL_ID;

  try {
    const user = await Cursor.me({ apiKey });

    write(
      `Cursor API OK (key: ${user.apiKeyName}${user.userEmail ? `, user: ${user.userEmail}` : ""})`,
    );
  } catch (error) {
    write(
      `Cursor API check failed: ${error instanceof Error ? error.message : String(error)}`,
    );

    return 1;
  }

  try {
    const models = await Cursor.models.list({ apiKey });
    const modelIds = models.map((model) => model.id);
    const isConfiguredModelAvailable =
      configuredModelId === "auto" || modelIds.includes(configuredModelId);

    write(
      `Configured model: ${configuredModelId} ${
        isConfiguredModelAvailable ? "(available)" : "(NOT in model list)"
      }`,
    );
    write(`Available models (${modelIds.length}):`);

    for (const modelId of modelIds) {
      write(`  ${modelId}`);
    }
  } catch (error) {
    write(
      `Model list failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return 0;
}

async function getGitVersion(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["--version"]);

    return stdout.trim();
  } catch {
    return "not found";
  }
}

async function isInsideGitRepo(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", [
      "rev-parse",
      "--is-inside-work-tree",
    ]);

    return stdout.trim() === "true" ? "yes" : "no";
  } catch {
    return "no";
  }
}
