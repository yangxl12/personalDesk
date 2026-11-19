<script lang="ts">
  import { Marked } from 'marked'
  import DOMPurify from 'dompurify'
  import hljs from 'highlight.js/lib/core'
  import bash from 'highlight.js/lib/languages/bash'
  import c from 'highlight.js/lib/languages/c'
  import cpp from 'highlight.js/lib/languages/cpp'
  import css from 'highlight.js/lib/languages/css'
  import diff from 'highlight.js/lib/languages/diff'
  import dockerfile from 'highlight.js/lib/languages/dockerfile'
  import go from 'highlight.js/lib/languages/go'
  import java from 'highlight.js/lib/languages/java'
  import javascript from 'highlight.js/lib/languages/javascript'
  import json from 'highlight.js/lib/languages/json'
  import markdown from 'highlight.js/lib/languages/markdown'
  import php from 'highlight.js/lib/languages/php'
  import python from 'highlight.js/lib/languages/python'
  import rust from 'highlight.js/lib/languages/rust'
  import sql from 'highlight.js/lib/languages/sql'
  import typescript from 'highlight.js/lib/languages/typescript'
  import xml from 'highlight.js/lib/languages/xml'
  import yaml from 'highlight.js/lib/languages/yaml'

  // 只注册常见语言，保持包里体积可控；未注册的语言按纯文本输出。
  for (const [name, language] of Object.entries({
    bash, c, cpp, css, diff, dockerfile, go, java, javascript, json, markdown, php, python, rust, sql, typescript, xml, yaml
  })) hljs.registerLanguage(name, language)

  let { text }: { text: string } = $props()

  const isBrowser = typeof window !== 'undefined'

  const parser = new Marked({ gfm: true, breaks: true })
  // 流式输出时同一段代码会被反复渲染，缓存高亮结果避免重复计算。
  const highlighted = new Map<string, string>()
  let hooks = false
  let container: HTMLDivElement
  // 服务端没有 DOM，也构造不出同样的 HTML；等挂载后再渲染，避免水合不一致。
  let mounted = $state(false)
  $effect(() => { mounted = true })

  function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
  }

  function prepare() {
    if (hooks) return
    hooks = true
    DOMPurify.addHook('afterSanitizeAttributes', node => {
      const href = node.getAttribute('href')
      if (node.tagName === 'A' && href && !href.startsWith('#')) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
      if (node.tagName === 'IMG') node.setAttribute('loading', 'lazy')
    })
  }

  let html = $derived.by(() => {
    if (!isBrowser || !text) return ''
    prepare()
    return DOMPurify.sanitize(parser.parse(text, { async: false }) as string, {
      ADD_ATTR: ['target', 'rel']
    })
  })

  function highlight(code: string, lang: string) {
    if (code.length > 16000) return escapeHtml(code)
    try {
      return lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value
    } catch {
      return escapeHtml(code)
    }
  }

  function decorate(root: HTMLDivElement) {
    for (const code of root.querySelectorAll<HTMLElement>('pre > code')) {
      const pre = code.parentElement as HTMLElement
      const source = code.textContent ?? ''
      const lang = (code.className.match(/language-([\w+#.-]+)/)?.[1] ?? '').toLowerCase()
      const key = lang + '\u0000' + source
      let value = highlighted.get(key)
      if (value === undefined) {
        value = highlight(source, lang)
        if (highlighted.size > 120) highlighted.clear()
        highlighted.set(key, value)
      }
      code.innerHTML = value
      code.classList.add('hljs')
      const head = document.createElement('div')
      head.className = 'code-head'
      const label = document.createElement('span')
      label.textContent = lang || 'code'
      const copy = document.createElement('button')
      copy.type = 'button'
      copy.className = 'code-copy'
      copy.setAttribute('data-copy', '')
      copy.textContent = '复制'
      head.append(label, copy)
      const block = document.createElement('div')
      block.className = 'code-block'
      pre.before(block)
      block.append(head, pre)
    }
    for (const table of root.querySelectorAll('table')) {
      if (table.parentElement?.classList.contains('md-table')) continue
      const wrap = document.createElement('div')
      wrap.className = 'md-table'
      table.before(wrap)
      wrap.append(table)
    }
  }

  $effect(() => {
    if (!mounted) return
    void html
    const root = container
    if (!root) return
    decorate(root)
  })

  $effect(() => {
    const root = container
    if (!root) return
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  })

  function onClick(event: MouseEvent) {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-copy]')
    if (!button) return
    const code = button.closest('.code-block')?.querySelector('pre code')
    if (!code) return
    void navigator.clipboard.writeText(code.textContent ?? '').then(() => {
      button.textContent = '已复制'
      button.dataset.copied = ''
      setTimeout(() => { button.textContent = '复制'; delete button.dataset.copied }, 1500)
    }).catch(() => {})
  }
</script>

<div class="md" bind:this={container}>
  {#if mounted}{@html html}{/if}
</div>
