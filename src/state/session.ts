/**
 * Enhanced Session State with context inference
 */

export interface PendingTask {
  id: string;
  type: 'research' | 'studio';
  notebookId: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  startedAt: number;
  lastCheckedAt?: number;
  result?: unknown;
  error?: string;
}

export interface SessionState {
  // Current context (auto-inference)
  notebookId: string | null;
  notebookTitle: string | null;
  lastSourceId: string | null;
  
  // Conversation state
  conversationId: string | null;
  lastQuery: string | null;
  lastAnswer: string | null;
  
  // Background tasks
  pendingTasks: PendingTask[];
  
  // Auth status
  authValid: boolean;
  lastAuthCheck: number;
  
  // Timestamps
  lastActivity: number;
  sessionStartedAt: number;
}

// Default state
const defaultState: SessionState = {
  notebookId: null,
  notebookTitle: null,
  lastSourceId: null,
  conversationId: null,
  lastQuery: null,
  lastAnswer: null,
  pendingTasks: [],
  authValid: false,
  lastAuthCheck: 0,
  lastActivity: Date.now(),
  sessionStartedAt: Date.now(),
};

// In-memory state
let state: SessionState = { ...defaultState };

/**
 * Get current state (read-only)
 */
export function getState(): Readonly<SessionState> {
  return state;
}

/**
 * Update state partially
 */
export function updateState(partial: Partial<SessionState>): void {
  state = { ...state, ...partial, lastActivity: Date.now() };
}

/**
 * Set active notebook
 */
export function setActiveNotebook(id: string | null, title: string | null): void {
  updateState({ notebookId: id, notebookTitle: title });
}

/**
 * Set last source (for context inference)
 */
export function setLastSource(sourceId: string | null): void {
  updateState({ lastSourceId: sourceId });
}

/**
 * Set conversation context
 */
export function setConversation(
  conversationId: string | null,
  lastQuery?: string,
  lastAnswer?: string
): void {
  updateState({
    conversationId,
    lastQuery: lastQuery ?? state.lastQuery,
    lastAnswer: lastAnswer ?? state.lastAnswer,
  });
}

/**
 * Get active notebook (returns id and title)
 */
export function getActiveNotebook(): { id: string | null; title: string | null } {
  return { id: state.notebookId, title: state.notebookTitle };
}

/**
 * Get conversation state
 */
export function getConversation(): {
  conversationId: string | null;
  lastQuery: string | null;
  lastAnswer: string | null;
} {
  return {
    conversationId: state.conversationId,
    lastQuery: state.lastQuery,
    lastAnswer: state.lastAnswer,
  };
}

/**
 * Add pending task
 */
export function addPendingTask(task: PendingTask): void {
  const existing = state.pendingTasks.findIndex(t => t.id === task.id);
  if (existing >= 0) {
    state.pendingTasks[existing] = task;
  } else {
    state.pendingTasks.push(task);
  }
  updateState({ pendingTasks: [...state.pendingTasks] });
}

/**
 * Update pending task status
 */
export function updatePendingTask(
  taskId: string,
  updates: Partial<PendingTask>
): void {
  const task = state.pendingTasks.find(t => t.id === taskId);
  if (task) {
    Object.assign(task, updates, { lastCheckedAt: Date.now() });
    updateState({ pendingTasks: [...state.pendingTasks] });
  }
}

/**
 * Remove pending task
 */
export function removePendingTask(taskId: string): void {
  const filtered = state.pendingTasks.filter(t => t.id !== taskId);
  updateState({ pendingTasks: filtered });
}

/**
 * Get pending tasks by type
 */
export function getPendingTasks(type?: 'research' | 'studio'): PendingTask[] {
  if (!type) return state.pendingTasks;
  return state.pendingTasks.filter(t => t.type === type);
}

/**
 * Set auth status
 */
export function setAuthStatus(valid: boolean): void {
  updateState({ authValid: valid, lastAuthCheck: Date.now() });
}

/**
 * Check if auth was recently validated
 */
export function isAuthRecent(maxAgeMs: number = 5 * 60 * 1000): boolean {
  return state.authValid && (Date.now() - state.lastAuthCheck) < maxAgeMs;
}

/**
 * Reset state
 */
export function reset(): void {
  state = { ...defaultState, sessionStartedAt: Date.now() };
}

/**
 * Get context summary for AI
 */
export function getContextSummary(): string {
  const parts: string[] = [];
  
  if (state.notebookTitle) {
    parts.push(`Active notebook: "${state.notebookTitle}" (${state.notebookId})`);
  }
  
  if (state.lastSourceId) {
    parts.push(`Last source: ${state.lastSourceId}`);
  }
  
  if (state.conversationId) {
    parts.push(`Conversation active`);
    if (state.lastQuery) {
      parts.push(`Last query: "${state.lastQuery.slice(0, 50)}..."`);
    }
  }
  
  const pending = state.pendingTasks.filter(t => t.status === 'pending' || t.status === 'processing');
  if (pending.length > 0) {
    parts.push(`Pending tasks: ${pending.map(t => `${t.type}:${t.id.slice(0, 8)}`).join(', ')}`);
  }
  
  return parts.length > 0 ? parts.join('\n') : 'No active context';
}
