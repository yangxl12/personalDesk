import type { LayoutLoad } from './$types'
import { openDb } from '#lib/local/db'
import { modelStatus } from '#lib/local/ai/model'
import { preferences, revisions } from '#lib/local/store/workspace'

export const load: LayoutLoad = async ({ depends }) => {
  depends('buxu:preferences')
  depends('buxu:model')
  // 首屏先打开库，之后所有页面与组件都可以直接读仓储。
  await openDb()
  const [settings, counters, model] = await Promise.all([preferences(), revisions(), modelStatus()])
  return {
    // 单用户本地库，用户信息只为保持既有类型形状。
    user: { id: 'local', username: 'local' },
    preferences: settings,
    revisions: { ...counters, model: model.version },
    model
  }
}
