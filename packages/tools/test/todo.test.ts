import { describe, it, expect } from 'vitest'
import { todoTool } from '../src/todo.js'
import type { TodoItem, TodoStore } from '../src/types.js'

function memStore(): TodoStore & { items: TodoItem[] } {
  let items: TodoItem[] = []
  return { set: (v) => { items = v }, get: () => items, get items() { return items } }
}

describe('TodoWrite', () => {
  it('stores items and renders a checklist', async () => {
    const store = memStore()
    const out = await todoTool.run(
      { todos: [{ content: 'design', status: 'completed' }, { content: 'build', status: 'in_progress' }, { content: 'ship', status: 'pending' }] },
      { cwd: '/x', todos: store },
    )
    expect(store.get()).toHaveLength(3)
    expect(out).toContain('[x] design')
    expect(out).toContain('[~] build')
    expect(out).toContain('[ ] ship')
  })

  it('handles an empty list without a store', async () => {
    const out = await todoTool.run({ todos: [] }, { cwd: '/x' })
    expect(out).toBe('(no todos)')
  })
})
