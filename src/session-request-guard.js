export class SessionRequestGuard {
  constructor() {
    this.currentSessionId = null;
    this.generation = 0;
    this.sequence = 0;
    this.currentToken = null;
    this.active = new Map();
  }

  beginSession(sessionId) {
    this.invalidate();
    this.currentSessionId = String(sessionId);
  }

  invalidate() {
    this.generation += 1;
    this.currentSessionId = null;
    this.currentToken = null;
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
  }

  beginRequest(sessionId) {
    const normalizedSessionId = String(sessionId ?? "");
    const generation = this.generation;
    const token = `${generation}:${this.sequence += 1}`;
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted
      && this.generation === generation
      && this.currentSessionId === normalizedSessionId
      && this.currentToken === token;
    const finish = () => this.active.delete(token);
    if (this.currentSessionId !== normalizedSessionId) controller.abort();
    else {
      for (const activeController of this.active.values()) activeController.abort();
      this.active.clear();
      this.currentToken = token;
      this.active.set(token, controller);
    }
    return { token, sessionId: normalizedSessionId, signal: controller.signal, isCurrent, finish };
  }

  get activeRequestCount() {
    return this.active.size;
  }
}

