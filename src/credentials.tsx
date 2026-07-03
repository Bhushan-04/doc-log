import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  CURSOR_API_KEY_ENV_KEY,
  DEFAULT_PROVIDER,
  getDefaultModelId,
  getProviderModelOptions,
  isValidModelId,
  normalizeModelId,
  DOC_LOG_MODEL_ID_ENV_KEY,
  type DocLogProvider,
} from "./constants.js";
import { docLogEnvPath, saveDocLogEnv } from "./env.js";

export type InitSetupResult = {
  modelId: string | null;
  provider: DocLogProvider | null;
  savedApiKey: boolean;
  savedModelId: boolean;
};

type InitSetupProps = {
  modelIdOverride?: string | null;
  onComplete: (result: InitSetupResult) => void;
  onError: (message: string) => void;
};

type PromptStep = "api-key" | "model";

export function needsCredentialSetup(
  modelIdOverride: string | null = null,
): boolean {
  return (
    !process.env[CURSOR_API_KEY_ENV_KEY] ||
    (modelIdOverride === null &&
      process.env[DOC_LOG_MODEL_ID_ENV_KEY] === undefined)
  );
}

export function InitSetup({
  modelIdOverride = null,
  onComplete,
  onError,
}: InitSetupProps) {
  const [step, setStep] = useState<PromptStep | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [modelSelectionIndex, setModelSelectionIndex] = useState(() =>
    getModelSelectionIndex(
      modelIdOverride ??
        process.env[DOC_LOG_MODEL_ID_ENV_KEY] ??
        getDefaultModelId(DEFAULT_PROVIDER),
    ),
  );
  const [isCustomModelInput, setIsCustomModelInput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const initialStep = getInitialStep(modelIdOverride);

    if (initialStep === null) {
      onComplete({
        modelId:
          modelIdOverride ?? process.env[DOC_LOG_MODEL_ID_ENV_KEY] ?? null,
        provider: DEFAULT_PROVIDER,
        savedApiKey: false,
        savedModelId: false,
      });
      return;
    }

    setStep(initialStep);
  }, [modelIdOverride, onComplete]);

  useInput((inputValue, key) => {
    if (isSaving || step === null) {
      return;
    }

    if (step === "model" && !isCustomModelInput) {
      if (key.upArrow || key.downArrow) {
        setError(null);
        setModelSelectionIndex((index) =>
          moveSelectionIndex(
            index,
            key.upArrow ? -1 : 1,
            getModelSelectionOptions().length,
          ),
        );
        return;
      }

      if (key.return) {
        void submit();
      }

      return;
    }

    if (key.return) {
      void submit();
      return;
    }

    if (key.backspace || key.delete) {
      setInput((value) => value.slice(0, -1));
      return;
    }

    const sanitizedInput = sanitizeInputChunk(inputValue);

    if (sanitizedInput && !key.ctrl && !key.meta) {
      setInput((value) => value + sanitizedInput);
    }
  });

  async function submit() {
    setError(null);

    if (step === "api-key") {
      const trimmedInput = input.trim();

      if (trimmedInput.length === 0) {
        setError(`${CURSOR_API_KEY_ENV_KEY} is required.`);
        return;
      }

      setApiKey(trimmedInput);
      setInput("");

      if (
        modelIdOverride === null &&
        process.env[DOC_LOG_MODEL_ID_ENV_KEY] === undefined
      ) {
        setStep("model");
        return;
      }

      await completeSetup({
        nextApiKey: trimmedInput,
        nextModelId: null,
      });
      return;
    }

    if (step === "model") {
      const selectedModelId = getSelectedModelId(
        modelSelectionIndex,
        input,
        isCustomModelInput,
      );

      if (!selectedModelId) {
        setError("Paste a valid model ID.");
        return;
      }

      if (selectedModelId === "custom") {
        setIsCustomModelInput(true);
        setInput("");
        return;
      }

      setInput("");
      setIsCustomModelInput(false);

      await completeSetup({
        nextApiKey: apiKey,
        nextModelId: selectedModelId,
      });
    }
  }

  type CompleteSetupOptions = {
    nextApiKey: string | null;
    nextModelId: string | null;
  };

  async function completeSetup({
    nextApiKey,
    nextModelId,
  }: CompleteSetupOptions) {
    setIsSaving(true);

    try {
      const updates: Record<string, string> = {};

      if (nextApiKey !== null) {
        updates[CURSOR_API_KEY_ENV_KEY] = nextApiKey;
      }

      if (nextModelId !== null) {
        updates[DOC_LOG_MODEL_ID_ENV_KEY] = nextModelId;
      }

      if (Object.keys(updates).length > 0) {
        await saveDocLogEnv(updates);
      }

      onComplete({
        modelId:
          nextModelId ??
          modelIdOverride ??
          process.env[DOC_LOG_MODEL_ID_ENV_KEY] ??
          null,
        provider: DEFAULT_PROVIDER,
        savedApiKey: nextApiKey !== null,
        savedModelId: nextModelId !== null,
      });
    } catch (saveError) {
      onError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to complete Doc-Log credential setup.",
      );
    }
  }

  const needsCredentialPrompt = needsCredentialSetup(modelIdOverride);

  return (
    <Box flexDirection="column">
      <SetupHeader />

      <Box flexDirection="column" marginBottom={1}>
        <SetupStep
          label="Cursor API key"
          state={
            process.env[CURSOR_API_KEY_ENV_KEY]
              ? "done"
              : step === "api-key"
                ? "current"
                : "pending"
          }
          detail={
            process.env[CURSOR_API_KEY_ENV_KEY]
              ? "available from environment"
              : `save ${CURSOR_API_KEY_ENV_KEY} to ${docLogEnvPath}`
          }
        />
        <SetupStep
          label="Model"
          state={
            modelIdOverride || process.env[DOC_LOG_MODEL_ID_ENV_KEY]
              ? "done"
              : step === "model"
                ? "current"
                : "pending"
          }
          detail={getModelSetupDetail(modelIdOverride)}
        />
        <SetupStep label="Doc-Log" state="done" detail="agent setup" />
      </Box>

      <SetupPanel title="Prompt">
        {step ? (
          <Prompt
            input={input}
            isCustomModelInput={isCustomModelInput}
            modelSelectionIndex={modelSelectionIndex}
            step={step}
          />
        ) : (
          <Text>Inspecting Doc-Log setup...</Text>
        )}
      </SetupPanel>

      {needsCredentialPrompt ? (
        <Text color="gray">Secrets are masked and saved only after setup.</Text>
      ) : null}

      {error ? (
        <SetupPanel title="Error">
          <Text color="red">{error}</Text>
        </SetupPanel>
      ) : null}
      {isSaving ? (
        <SetupPanel title="Saving">
          <Text>Writing Doc-Log setup...</Text>
        </SetupPanel>
      ) : null}
    </Box>
  );
}

function SetupHeader() {
  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      flexDirection="column"
      marginBottom={1}
      paddingX={1}
    >
      <Text>
        <Text bold color="cyan">
          Doc-Log
        </Text>{" "}
        <Text color="gray">credential setup</Text>
      </Text>
      <Text>
        Configure your Cursor API key (cursor.com/dashboard → Integrations) and
        a default model.
      </Text>
    </Box>
  );
}

type SetupStepProps = {
  label: string;
  state: "current" | "done" | "optional" | "pending";
  detail: string;
};

function SetupStep({ label, state, detail }: SetupStepProps) {
  const color =
    state === "done"
      ? "green"
      : state === "current"
        ? "yellow"
        : state === "optional"
          ? "cyan"
          : "gray";

  return (
    <Text>
      <Text color={color}>[{state.toUpperCase()}]</Text>{" "}
      <Text bold>{label.padEnd(16)}</Text> <Text color="gray">{detail}</Text>
    </Text>
  );
}

type SetupPanelProps = {
  title: string;
  children: React.ReactNode;
};

function SetupPanel({ title, children }: SetupPanelProps) {
  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
    >
      <Text bold color="cyan">
        {title}
      </Text>
      {children}
    </Box>
  );
}

type PromptProps = {
  input: string;
  isCustomModelInput: boolean;
  modelSelectionIndex: number;
  step: PromptStep;
};

function Prompt({
  input,
  isCustomModelInput,
  modelSelectionIndex,
  step,
}: PromptProps) {
  if (step === "api-key") {
    return (
      <Box flexDirection="column">
        <Text>Paste your Cursor API key.</Text>
        <Text>
          <Text color="gray">$</Text> {CURSOR_API_KEY_ENV_KEY}={" "}
          <Text color="yellow">{mask(input)}</Text>
        </Text>
        <Text color="gray">Press Enter to save it.</Text>
      </Box>
    );
  }

  if (step === "model") {
    if (isCustomModelInput) {
      return (
        <Box flexDirection="column">
          <Text>Paste a custom Cursor model ID.</Text>
          <Text>
            <Text color="gray">$</Text> {DOC_LOG_MODEL_ID_ENV_KEY}={" "}
            <Text color="yellow">{input}</Text>
          </Text>
          <Text color="gray">Press Enter to save it.</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Text>Choose a Cursor model.</Text>
        {getModelSelectionOptions().map((option, index) => {
          if (option.kind === "custom") {
            return (
              <Text key="custom">
                <SelectionMarker isSelected={index === modelSelectionIndex} />{" "}
                Custom model ID
              </Text>
            );
          }

          return (
            <Text key={option.id}>
              <SelectionMarker isSelected={index === modelSelectionIndex} />{" "}
              {option.label} <Text color="gray">{option.id}</Text>
              {option.id === getDefaultModelId(DEFAULT_PROVIDER) ? (
                <Text color="gray"> default</Text>
              ) : null}
            </Text>
          );
        })}
        <Text color="gray">Use up/down arrows, then press Enter.</Text>
      </Box>
    );
  }

  return null;
}

function SelectionMarker({ isSelected }: { isSelected: boolean }) {
  return (
    <Text color={isSelected ? "cyan" : "gray"}>{isSelected ? ">" : " "}</Text>
  );
}

function getInitialStep(modelIdOverride: string | null): PromptStep | null {
  if (!process.env[CURSOR_API_KEY_ENV_KEY]) {
    return "api-key";
  }

  if (
    modelIdOverride === null &&
    process.env[DOC_LOG_MODEL_ID_ENV_KEY] === undefined
  ) {
    return "model";
  }

  return null;
}

function getModelSetupDetail(modelIdOverride: string | null): string {
  if (modelIdOverride) {
    return `using ${modelIdOverride} for this run`;
  }

  if (process.env[DOC_LOG_MODEL_ID_ENV_KEY]) {
    return process.env[DOC_LOG_MODEL_ID_ENV_KEY] ?? "";
  }

  return `default ${getDefaultModelId(DEFAULT_PROVIDER)}`;
}

type ModelSelectionOption =
  | {
      id: string;
      kind: "preset";
      label: string;
    }
  | {
      kind: "custom";
    };

function getModelSelectionOptions(): ModelSelectionOption[] {
  return [
    ...getProviderModelOptions(DEFAULT_PROVIDER).map((model) => ({
      id: model.id,
      kind: "preset" as const,
      label: model.label,
    })),
    { kind: "custom" },
  ];
}

function getSelectedModelId(
  selectedIndex: number,
  input: string,
  isCustomInput: boolean,
): string | "custom" | null {
  if (!isCustomInput) {
    const selectedOption = getModelSelectionOptions()[selectedIndex];

    if (!selectedOption) {
      return null;
    }

    return selectedOption.kind === "custom" ? "custom" : selectedOption.id;
  }

  const normalizedModelId = normalizeModelId(input);

  return isValidModelId(normalizedModelId) ? normalizedModelId : null;
}

function getModelSelectionIndex(selectedModelId: string): number {
  const selectedIndex = getModelSelectionOptions().findIndex(
    (option) => option.kind === "preset" && option.id === selectedModelId,
  );

  return selectedIndex === -1 ? 0 : selectedIndex;
}

function moveSelectionIndex(
  currentIndex: number,
  offset: number,
  itemCount: number,
): number {
  if (itemCount <= 0) {
    return 0;
  }

  return (currentIndex + offset + itemCount) % itemCount;
}

function sanitizeInputChunk(value: string): string {
  return value.replace(/[\r\n]/gu, "");
}

function mask(value: string): string {
  if (value.length === 0) {
    return "";
  }

  return "*".repeat(value.length);
}
