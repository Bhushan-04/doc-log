export const OPEN_WIKI_DIR = "openwiki";
export const UPDATE_METADATA_PATH = `${OPEN_WIKI_DIR}/.last-update.json`;
export const CURSOR_API_KEY_ENV_KEY = "CURSOR_API_KEY";
export const OPENWIKI_PROVIDER_ENV_KEY = "DOC_LOG_PROVIDER";
export const OPENWIKI_MODEL_ID_ENV_KEY = "DOC_LOG_MODEL_ID";
export const DEFAULT_PROVIDER = "cursor";

export type OpenWikiProvider = "cursor";

export type SelectableOpenWikiProvider = OpenWikiProvider;

export type ProviderModelOption = {
  id: string;
  label: string;
};

type ProviderConfig = {
  apiKeyEnvKey: string;
  label: string;
  modelOptions: ProviderModelOption[];
};

export const SELECTABLE_OPENWIKI_PROVIDERS = [
  "cursor",
] as const satisfies readonly SelectableOpenWikiProvider[];

export const PROVIDER_CONFIGS: Record<OpenWikiProvider, ProviderConfig> = {
  cursor: {
    apiKeyEnvKey: CURSOR_API_KEY_ENV_KEY,
    label: "Cursor",
    modelOptions: [
      { id: "composer-2.5", label: "Composer" },
      { id: "auto", label: "Auto (server picks)" },
    ],
  },
};

export const DEFAULT_MODEL_ID =
  PROVIDER_CONFIGS[DEFAULT_PROVIDER].modelOptions[0]?.id ?? "composer-2.5";

export function getProviderConfig(provider: OpenWikiProvider): ProviderConfig {
  return PROVIDER_CONFIGS[provider];
}

export function getProviderLabel(provider: OpenWikiProvider): string {
  return getProviderConfig(provider).label;
}

export function getProviderApiKeyEnvKey(provider: OpenWikiProvider): string {
  return getProviderConfig(provider).apiKeyEnvKey;
}

export function getProviderModelOptions(
  provider: OpenWikiProvider,
): ProviderModelOption[] {
  return getProviderConfig(provider).modelOptions;
}

export function getDefaultModelId(provider: OpenWikiProvider): string {
  return getProviderModelOptions(provider)[0]?.id ?? DEFAULT_MODEL_ID;
}

export function normalizeProvider(
  value: string | null | undefined,
): OpenWikiProvider | null {
  if (value === undefined || value === null) {
    return null;
  }

  const provider = value.trim().toLowerCase();

  return isValidProvider(provider) ? provider : null;
}

export function isValidProvider(value: string): value is OpenWikiProvider {
  return value in PROVIDER_CONFIGS;
}

export function resolveConfiguredProvider(
  env: NodeJS.ProcessEnv = process.env,
): OpenWikiProvider {
  return normalizeProvider(env[OPENWIKI_PROVIDER_ENV_KEY]) ?? DEFAULT_PROVIDER;
}

export function normalizeModelId(value: string): string {
  return value.trim();
}

export function isValidModelId(value: string): boolean {
  const modelId = normalizeModelId(value);

  return (
    modelId.length > 0 &&
    modelId.length <= 120 &&
    /^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/u.test(modelId) &&
    !modelId.includes("://")
  );
}

export function normalizeTarget(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/gu, "-")
    .replace(/[^a-z0-9-]/gu, "")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export function isValidTarget(value: string): boolean {
  const target = normalizeTarget(value);

  return (
    target.length > 0 && target.length <= 80 && /^[a-z0-9][a-z0-9-]*$/u.test(target)
  );
}

export const OPENWIKI_VERSION = "0.1.0";
