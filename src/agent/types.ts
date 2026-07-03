export type DocLogCommand = "chat" | "init" | "update" | "flow" | "section";

export type DocLogRunResult = {
  command: DocLogCommand;
  model: string;
  target?: string | null;
};

export type DocLogRunEvent =
  | {
      source?: "main" | "subgraph";
      type: "text";
      text: string;
    }
  | {
      type: "tool_start";
      call: string;
      id: string;
      input: unknown;
      name: string;
    }
  | {
      type: "tool_end";
      id: string;
      name: string;
      status: "error" | "finished";
    }
  | {
      type: "debug";
      message: string;
    };

export type DocLogRunOptions = {
  debug?: boolean;
  isFollowup?: boolean;
  modelId?: string | null;
  onEvent?: (event: DocLogRunEvent) => void;
  target?: string | null;
  threadId?: string;
  userMessage?: string | null;
};

export type UpdateMetadata = {
  updatedAt: string;
  command: DocLogCommand;
  gitHead?: string;
  model: string;
};

export type RunContext = {
  lastUpdate: UpdateMetadata | null;
  gitSummary: string;
};
