export type WidgetState = "idle" | "listening" | "thinking" | "speaking";

export type StateEvent =
  | { type: "START" }
  | { type: "STOP" }
  | { type: "VAD_DONE" }
  | { type: "LLM_DONE" }
  | { type: "TTS_END" }
  | { type: "ERROR" };

export function reduceState(prev: WidgetState, ev: StateEvent): WidgetState {
  // ANY -> idle
  if (ev.type === "STOP" || ev.type === "ERROR") return "idle";

  switch (prev) {
    case "idle": {
      if (ev.type === "START") return "listening";
      return prev;
    }
    case "listening": {
      if (ev.type === "VAD_DONE") return "thinking";
      return prev;
    }
    case "thinking": {
      if (ev.type === "LLM_DONE") return "speaking";
      return prev;
    }
    case "speaking": {
      if (ev.type === "TTS_END") return "idle";
      return prev;
    }
    default:
      return "idle";
  }
}


