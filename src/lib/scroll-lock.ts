// 弹窗打开时锁住底层页面。移动端只加 overflow:hidden 拦不住滚动，
// 这里把 body 固定住、用负 top 维持视觉位置，关闭时原样还原。
// 用引用计数处理嵌套弹窗（收支记录上再开记账表单）。
type Saved = {
  y: number
  position: string
  top: string
  left: string
  width: string
  overflow: string
  paddingRight: string
}

let depth = 0
let saved: Saved | null = null

export function lockScroll(): () => void {
  if (typeof window === 'undefined') return () => {}
  const body = document.body
  if (depth === 0) {
    const gap = window.innerWidth - document.documentElement.clientWidth
    saved = {
      y: window.scrollY,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight
    }
    body.style.position = 'fixed'
    body.style.top = `-${saved.y}px`
    body.style.left = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    // 滚动条消失会让页面横向抖一下，按差值补回右侧留白。
    if (gap > 0) body.style.paddingRight = `${gap}px`
  }
  depth += 1

  let released = false
  return () => {
    if (released) return
    released = true
    depth = Math.max(0, depth - 1)
    if (depth > 0 || !saved) return
    const state = saved
    saved = null
    body.style.position = state.position
    body.style.top = state.top
    body.style.left = state.left
    body.style.width = state.width
    body.style.overflow = state.overflow
    body.style.paddingRight = state.paddingRight
    // 强制一次布局再还原滚动位置，否则文档高度还没恢复，scrollTo 会被夹回顶部。
    void body.offsetHeight
    window.scrollTo(0, state.y)
  }
}
