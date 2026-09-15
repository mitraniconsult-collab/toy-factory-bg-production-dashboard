export type Phase = "upload" | "generating" | "preview" | "checkout" | "timeout" | "error";
export type State = { phase: Phase; progress: number; error: string | null };
export type Event = { type: "START" | "READY" | "CHECKOUT" | "RESET" } | { type: "PROGRESS"; value: number } | { type: "ERROR" | "TIMEOUT"; message: string };
export const initialState: State = { phase: "upload", progress: 0, error: null };
export function builderReducer(state: State, event: Event): State {
  switch (event.type) {
    case "RESET": return initialState;
    case "START": return { phase: "generating", progress: 0, error: null };
    case "READY": return { phase: "preview", progress: 100, error: null };
    case "CHECKOUT": return state.phase === "preview" ? { ...state, phase: "checkout", error: null } : state;
    case "PROGRESS": return state.phase === "generating" ? { ...state, progress: Math.max(0, Math.min(100, event.value)) } : state;
    case "TIMEOUT": return { ...state, phase: "timeout", error: event.message };
    case "ERROR": return { ...state, phase: "error", error: event.message };
  }
}
