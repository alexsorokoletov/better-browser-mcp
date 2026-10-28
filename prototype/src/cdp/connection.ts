// Minimal CDP connection over a message transport, with flat sessions.
// Transport: { send(string), onMessage(cb), onClose(cb), close() }

// CDP params and results stay loosely typed: the protocol is large and the code reads only a few fields.
export type Json = any;
export type Listener = (params: Json, sessionId: string) => void | Promise<void>;
export interface Transport {
  send(s: string): void;
  onMessage(cb: (raw: Json) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}
class CDPError extends Error {
  code?: number;
}

export class CDPConnection {
  #nextId = 1;
  #pending = new Map<number, { resolve: (v: Json) => void; reject: (e: Error) => void; method: string }>();
  #listeners = new Map<string, Set<Listener>>(); // `${sessionId}|${method}` -> Set<fn>
  #closed = false;
  transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
    transport.onMessage((raw) => this.#onMessage(raw));
    transport.onClose(() => {
      this.#closed = true;
      for (const { reject } of this.#pending.values()) reject(new Error('CDP connection closed'));
      this.#pending.clear();
      this.#emit('', 'close', {});
    });
  }

  get closed() {
    return this.#closed;
  }

  send(method: string, params: Json = {}, sessionId?: string): Promise<Json> {
    if (this.#closed) return Promise.reject(new Error('CDP connection closed'));
    const id = this.#nextId++;
    const msg: Json = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method });
      this.transport.send(JSON.stringify(msg));
    });
  }

  on(method: string, fn: Listener, sessionId = '') {
    const key = `${sessionId}|${method}`;
    if (!this.#listeners.has(key)) this.#listeners.set(key, new Set());
    this.#listeners.get(key)!.add(fn);
    return () => this.#listeners.get(key)?.delete(fn);
  }

  session(sessionId: string) {
    return new CDPSession(this, sessionId);
  }

  close() {
    this.transport.close();
  }

  #emit(sessionId: string, method: string, params: Json) {
    for (const key of [`${sessionId}|${method}`, `*|${method}`]) {
      const set = this.#listeners.get(key);
      if (!set) continue;
      // Copy: a listener may remove itself (or add others) while we iterate.
      // oxlint-disable-next-line unicorn/no-useless-spread
      for (const fn of [...set]) {
        // An async listener's rejection is logged like a thrown error, never left unhandled (that would end the process).
        try {
          Promise.resolve(fn(params, sessionId)).catch((e) => console.error('[cdp listener]', method, e));
        } catch (e) {
          console.error('[cdp listener]', method, e);
        }
      }
    }
  }

  #onMessage(raw: Json) {
    const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (msg.id !== undefined) {
      const p = this.#pending.get(msg.id);
      if (!p) return;
      this.#pending.delete(msg.id);
      if (msg.error) {
        const err = new CDPError(`${p.method}: ${msg.error.message}`);
        err.code = msg.error.code;
        p.reject(err);
      } else p.resolve(msg.result ?? {});
    } else if (msg.method) {
      this.#emit(msg.sessionId || '', msg.method, msg.params ?? {});
    }
  }
}

export class CDPSession {
  conn: CDPConnection;
  id: string;
  constructor(conn: CDPConnection, id: string) {
    this.conn = conn;
    this.id = id;
  }
  send(method: string, params?: Json): Promise<Json> {
    return this.conn.send(method, params, this.id);
  }
  on(method: string, fn: Listener) {
    return this.conn.on(method, fn, this.id);
  }
}

export function webSocketTransport(url: string): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const msgCbs: ((raw: Json) => void)[] = [],
      closeCbs: (() => void)[] = [];
    ws.addEventListener('open', () =>
      resolve({
        send: (s) => ws.send(s),
        onMessage: (cb) => msgCbs.push(cb),
        onClose: (cb) => closeCbs.push(cb),
        close: () => ws.close(),
      }),
    );
    ws.addEventListener('error', (e) => reject(new Error(`WebSocket error: ${e.message || url}`)));
    ws.addEventListener('message', (e) => {
      for (const cb of msgCbs) cb(e.data);
    });
    ws.addEventListener('close', () => {
      for (const cb of closeCbs) cb();
    });
  });
}
