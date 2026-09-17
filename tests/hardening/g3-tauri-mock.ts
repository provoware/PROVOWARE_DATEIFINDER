type Listener = (event: { payload: unknown }) => void;

const listeners = new Map<string, Set<Listener>>();
const started: string[] = [];
const cancelled: string[] = [];

const control = {
  started,
  cancelled,
  emit(event: string, payload: unknown) {
    for (const listener of listeners.get(event) ?? []) listener({ payload });
  },
};

Object.assign(globalThis, { __G3: control });

export async function invoke<T>(command: string, args?: Record<string, any>): Promise<T> {
  switch (command) {
    case "platform_capabilities":
      return {
        platform: "linux",
        canPickFolder: true,
        canOpenFile: true,
        canRevealFile: true,
        canSearchRecursively: true,
        supportsPickedFiles: false,
      } as T;
    case "pick_search_root":
      return "/tmp/g3-root" as T;
    case "start_search":
      started.push(args?.request?.sessionId);
      return undefined as T;
    case "cancel_search":
      cancelled.push(args?.sessionId);
      return undefined as T;
    default:
      return undefined as T;
  }
}

export async function listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void> {
  const set = listeners.get(event) ?? new Set<Listener>();
  const listener = handler as Listener;
  set.add(listener);
  listeners.set(event, set);
  return () => set.delete(listener);
}

export function getCurrentWindow() {
  return {
    minimize: async () => undefined,
    toggleMaximize: async () => undefined,
    close: async () => undefined,
  };
}

export async function open(): Promise<null> {
  return null;
}

export class LazyStore {
  constructor(_path: string) {}
  async get<T>(_key: string): Promise<T | null> { return null; }
  async set(_key: string, _value: unknown): Promise<void> {}
  async save(): Promise<void> {}
}

declare global {
  var __G3: typeof control;
}
