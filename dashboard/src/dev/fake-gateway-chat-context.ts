/** Development-only preview fixture for context settings and items. */
import type { FakeChatStore } from './fake-gateway'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }

export function createFakeChatContext(now: () => number, fail: (status: number) => never, store: FakeChatStore) {
  void now
  void fail
  void store
  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    void path
    void method
    void options
    return undefined
  }
}
