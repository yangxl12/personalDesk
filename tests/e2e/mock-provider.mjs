const nativeFetch = globalThis.fetch
const fixed = { id: 'test-stream', object: 'chat.completion.chunk', created: 1, model: 'deepseek-flash' }
const chunk = (delta, finish_reason = null) => ({ ...fixed, choices: [{ index: 0, delta, finish_reason }] })
const call = (name, args) => [
  chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'tool-' + name, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }),
  chunk({}, 'tool_calls')
]

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input)
  const compatible = url.href === 'https://provider.example.com/v1/chat/completions'
  if (!compatible && url.href !== 'https://api.deepseek.com/chat/completions') return nativeFetch(input, init)
  const payload = JSON.parse(init.body)
  const authorization = new Headers(init.headers).get('authorization')
  const key = compatible ? 'local-compatible-fixture' : payload.model === 'saved-model' ? 'local-saved-fixture' : 'local-test-only'
  if (authorization !== 'Bearer ' + key) return new Response('{}', { status: 401 })
  if (compatible && (!init.dispatcher || init.redirect !== 'error')) return new Response('{}', { status: 400 })
  if (compatible && payload.model !== 'compatible-model') return new Response('{}', { status: 400 })
  const used = payload.messages.filter(message => message.role === 'tool').map(message => JSON.parse(message.content))
  const names = payload.tools?.map(tool => tool.function.name) ?? []
  if ((!compatible && payload.thinking?.type !== 'disabled') || !payload.stream) return new Response('{}', { status: 400 })
  let output
  if (compatible) {
    output = [chunk({ role: 'assistant', content: '兼容模型连接正常。' }), chunk({}, 'stop')]
  } else if (names.includes('find_goals') && used.length === 0) {
    output = call('find_goals', { keyword: '练习英语' })
  } else if (used.at(-1)?.items?.[0] && names.includes('get_goal')) {
    output = call('get_goal', { goalId: used.at(-1).items[0].id })
  } else if (used.at(-1)?.tasks?.[0] && names.includes('propose_changes')) {
    output = call('propose_changes', { commands: [{ type: 'task.setDone', taskId: used.at(-1).tasks[0].id, done: true }] })
  } else {
    output = [chunk({ role: 'assistant', content: '收到，' }), chunk({ content: '这是一条测试回复。' }), chunk({}, 'stop')]
  }
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      for (const item of output) {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(item) + '\n\n'))
        await new Promise(resolve => setTimeout(resolve, 70))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    }
  })
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}
