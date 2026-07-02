import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const CURSOR_RIPGREP_PATH_ENV = "CURSOR_RIPGREP_PATH";
const require = createRequire(import.meta.url);

function hasConfiguredRipgrepPath(): boolean {
  const configured = process.env[CURSOR_RIPGREP_PATH_ENV];

  return (
    typeof configured === "string" &&
    configured.length > 0 &&
    path.isAbsolute(configured)
  );
}

function getRipgrepExecutableName(): string {
  return process.platform === "win32" ? "rg.exe" : "rg";
}

function resolvePlatformPackageRipgrep(): string | undefined {
  const exe = getRipgrepExecutableName();
  const platformPackage = `@cursor/sdk-${process.platform}-${process.arch}`;

  try {
    const packageJsonPath = require.resolve(`${platformPackage}/package.json`);
    const candidate = path.join(path.dirname(packageJsonPath), "bin", exe);

    if (existsSync(candidate)) {
      return candidate;
    }
  } catch {
    // Optional platform package may be missing on this OS/arch.
  }

  try {
    const sdkPackageJsonPath = require.resolve("@cursor/sdk/package.json");
    const sdkRoot = path.dirname(sdkPackageJsonPath);
    const candidate = path.join(sdkRoot, "..", platformPackage, "bin", exe);

    if (existsSync(candidate)) {
      return candidate;
    }
  } catch {
    // @cursor/sdk may not be resolvable in some test harnesses.
  }

  return undefined;
}

function resolveEditorBundledRipgrep(): string | undefined {
  const exe = getRipgrepExecutableName();
  const candidates: string[] = [];

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;

    if (localAppData) {
      candidates.push(
        path.join(
          localAppData,
          "Programs",
          "cursor",
          "resources",
          "app",
          "node_modules",
          "@vscode",
          "ripgrep",
          "bin",
          exe,
        ),
        path.join(
          localAppData,
          "Programs",
          "Microsoft VS Code",
          "resources",
          "app",
          "node_modules",
          "@vscode",
          "ripgrep",
          "bin",
          exe,
        ),
      );
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Cursor.app/Contents/Resources/app/node_modules/@vscode/ripgrep/bin/rg",
      "/Applications/Visual Studio Code.app/Contents/Resources/app/node_modules/@vscode/ripgrep/bin/rg",
    );
  }

  return candidates.find((candidate) => existsSync(candidate));
}

function resolveRipgrepOnPath(): string | undefined {
  try {
    if (process.platform === "win32") {
      const output = execFileSync("where", ["rg"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const candidate = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);

      return candidate && existsSync(candidate) ? candidate : undefined;
    }

    const output = execFileSync("which", ["rg"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return output.length > 0 && existsSync(output) ? output : undefined;
  } catch {
    return undefined;
  }
}

export function bootstrapCursorSdkEnv(): void {
  if (hasConfiguredRipgrepPath()) {
    return;
  }

  const bundled =
    resolvePlatformPackageRipgrep() ?? resolveEditorBundledRipgrep();
  const onPath = bundled ? undefined : resolveRipgrepOnPath();
  const resolved = bundled ?? onPath;

  if (resolved) {
    process.env[CURSOR_RIPGREP_PATH_ENV] = resolved;
  }
}

bootstrapCursorSdkEnv();
