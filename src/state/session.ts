/**
 * Session State
 * 
 * Minimal state - chỉ track context cần thiết cho compaction
 */

// ============================================================================
// State Shape (flat, minimal)
// ============================================================================

interface State {
  // Current context
  notebookId: string | null;
  notebookTitle: string | null;
  conversationId: string | null;
  
  // Last query for context preservation
  lastQuery: string | null;
  lastAnswer: string | null;
  
  // Background tasks (pending only, không cache results)
  pendingTasks: Array<{
    type: "research" | "studio";
    id: string;
    notebookId: string;
    label: string;
  }>;
}

let state: State = {
  notebookId: null,
  notebookTitle: null,
  conversationId: null,
  lastQuery: null,
  lastAnswer: null,
  pendingTasks: [],
};

// ============================================================================
// Getters
// ============================================================================

export const getState = (): Readonly<State> => state;

export const getActiveNotebook = () => ({
  id: state.notebookId,
  title: state.notebookTitle,
});

export const getConversation = () => ({
  id: state.conversationId,
  lastQuery: state.lastQuery,
  lastAnswer: state.lastAnswer,
});

export const getPendingTasks = () => state.pendingTasks;

// ============================================================================
// Setters (immutable updates)
// ============================================================================

export function setActiveNotebook(id: string | null, title?: string): void {
  state = {
    ...state,
    notebookId: id,
    notebookTitle: title || id,
  };
}

export function setConversation(id: string | null, query?: string, answer?: string): void {
  state = {
    ...state,
    conversationId: id,
    ...(query && { lastQuery: query }),
    ...(answer && { lastAnswer: answer?.slice(0, 300) }), // Only keep summary
  };
}

export function addPendingTask(
  type: "research" | "studio",
  id: string,
  notebookId: string,
  label: string
): void {
  state = {
    ...state,
    pendingTasks: [...state.pendingTasks, { type, id, notebookId, label }],
  };
}

export function removePendingTask(id: string): void {
  state = {
    ...state,
    pendingTasks: state.pendingTasks.filter((t) => t.id !== id),
  };
}

export function reset(): void {
  state = {
    notebookId: null,
    notebookTitle: null,
    conversationId: null,
    lastQuery: null,
    lastAnswer: null,
    pendingTasks: [],
  };
}

// ============================================================================
// Context Summary (for session compaction)
// ============================================================================

export function getContextSummary(): string {
  const parts: string[] = [];

  if (state.notebookId) {
    parts.push(`Notebook: ${state.notebookTitle} (${state.notebookId})`);
  }

  if (state.conversationId && state.lastQuery) {
    parts.push(`Last Q: "${state.lastQuery}"`);
    if (state.lastAnswer) {
      parts.push(`Last A: ${state.lastAnswer}`);
    }
  }

  if (state.pendingTasks.length > 0) {
    const tasks = state.pendingTasks.map((t) => `${t.type}:${t.label}`);
    parts.push(`Pending: ${tasks.join(", ")}`);
  }

  return parts.join("\n");
}
