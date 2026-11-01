/** Development-only preview fixture for answer versions (retry, compare, switch, branch). */
import type { FakeChatStore } from './fake-gateway'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }

export function createFakeChatAnswers(now: () => number, fail: (status: number) => never, store: FakeChatStore) {
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
