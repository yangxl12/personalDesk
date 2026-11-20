// 本地版没有服务端会话与请求上下文，App.Locals 不再需要扩展。

declare global {
  // 构建时由 vite.config.ts 注入的版本号（提交短 SHA），设置页的「检查更新」用它比对线上版本。
  const __BUILD_ID__: string
  // 站点 base 路径（与 vite.config.ts 的 paths.base 同源），拿来讲绝对地址。
  const __BUILD_BASE__: string
}

export {}
