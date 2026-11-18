// 生成 PWA 图标：与界面里的 .brand-mark 同一套设计语言（紫色渐变 + 三根递增白柱）。
// 纯 Node 实现，不引第三方依赖：超采样 + SDF 抗锯齿 + 手写 PNG 编码。
//
// 用法：node scripts/generate-icons.mjs

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = 'static/icons'
const SS = 5 // 每轴超采样倍数

const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v)
const mix = (a, b, t) => a + (b - a) * t

// 圆角矩形有符号距离：cx/cy 中心，hw/hh 半宽高，r 圆角
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

// 椭圆归一化距离：0 在中心，1 在边界
function ellipse(px, py, cx, cy, rx, ry) {
  return Math.hypot((px - cx) / rx, (py - cy) / ry)
}

const RIM = 0.235 // 圆角半径（占边长比例）
const BASELINE = 0.755
const BAR_W = 0.118
const BAR_GAP = 0.074
const BAR_H = [0.225, 0.34, 0.45]

// 单点采样，返回非预乘 [r,g,b,a]
function shade(x, y, size, { square }) {
  const px = 1 / size

  // 背景：左上偏紫、右下偏深，145deg 近似
  let a = square ? 1 : clamp(-sdRoundRect(x, y, 0.5, 0.5, 0.5, 0.5, RIM) * size + 0.5)
  if (a <= 0) return [0, 0, 0, 0]
  const t = clamp((x * 0.72 + y * 0.28 - 0.06) * 1.12)
  let r = mix(0.706, 0.322, Math.pow(t, 1.05)) // #b4a8f9 → #5240c8
  let g = mix(0.659, 0.251, Math.pow(t, 1.05))
  let b = mix(0.976, 0.784, Math.pow(t, 1.05))

  // 顶部柔光
  const glow = clamp(1 - ellipse(x, y, 0.26, -0.02, 0.86, 0.62))
  const ga = 0.42 * Math.pow(glow, 1.7)
  r = mix(r, 1, ga)
  g = mix(g, 1, ga)
  b = mix(b, 1, ga)

  // 内容整体缩放：maskable 与方形图标留出安全区
  const k = square ? 0.66 : 1
  const cx = 0.5
  const cy = 0.5
  const sx = (x - cx) / k + cx
  const sy = (y - cy) / k + cy

  const total = BAR_W * 3 + BAR_GAP * 2
  const start = cx - total / 2 + BAR_W / 2

  // 柱体光晕（先铺，范围收敛，避免白白胖胖一圈）
  for (let i = 0; i < 3; i++) {
    const bx = start + i * (BAR_W + BAR_GAP)
    const h = BAR_H[i]
    const by = BASELINE - h / 2
    const d = sdRoundRect(sx, sy, bx, by, BAR_W / 2, h / 2, BAR_W / 2)
    if (d < 0.05) {
      const haloA = 0.13 * Math.exp(-Math.pow(d / 0.03, 2))
      r = mix(r, 1, haloA)
      g = mix(g, 1, haloA)
      b = mix(b, 1, haloA)
    }
  }

  // 柱体本体
  for (let i = 0; i < 3; i++) {
    const bx = start + i * (BAR_W + BAR_GAP)
    const h = BAR_H[i]
    const by = BASELINE - h / 2
    const d = sdRoundRect(sx, sy, bx, by, BAR_W / 2, h / 2, BAR_W / 2)
    const cover = clamp(-d * size * k + 0.5)
    if (cover > 0) {
      const barA = 0.97 * cover
      r = mix(r, 0.99, barA)
      g = mix(g, 0.995, barA)
      b = mix(b, 1, barA)
    }
  }

  return [r, g, b, a]
}

function render(size, options) {
  const rgba = Buffer.alloc(size * size * 4)
  const inv = 1 / (SS * SS)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ra = 0, ga = 0, ba = 0, aa = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [r, g, b, a] = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, size, options)
          ra += r * a; ga += g * a; ba += b * a; aa += a
        }
      }
      ra *= inv; ga *= inv; ba *= inv; aa *= inv
      const at = (y * size + x) * 4
      if (aa <= 0) {
        rgba[at] = rgba[at + 1] = rgba[at + 2] = rgba[at + 3] = 0
      } else {
        rgba[at] = Math.round(clamp(ra / aa) * 255)
        rgba[at + 1] = Math.round(clamp(ga / aa) * 255)
        rgba[at + 2] = Math.round(clamp(ba / aa) * 255)
        rgba[at + 3] = Math.round(clamp(aa) * 255)
      }
    }
  }
  return rgba
}

/* ------------------------------- PNG 编码 ------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, rgba) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ICO 里内嵌 32×32 PNG，现代浏览器与 Windows 都认
function icoFromPng(png, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry[0] = size === 256 ? 0 : size
  entry[1] = size === 256 ? 0 : size
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)
  return Buffer.concat([header, entry, png])
}

/* -------------------------------- 输出 -------------------------------- */

mkdirSync(OUT, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, square: false },
  { file: 'icon-512.png', size: 512, square: false },
  { file: 'icon-maskable-512.png', size: 512, square: true },
  { file: 'apple-touch-icon.png', size: 180, square: true },
  { file: 'favicon-32.png', size: 32, square: false },
]

for (const { file, size, square } of targets) {
  writeFileSync(`${OUT}/${file}`, encodePng(size, render(size, { square })))
  console.log(`✓ ${OUT}/${file}`)
}

const fav32 = encodePng(32, render(32, { square: false }))
writeFileSync(`${OUT}/favicon.ico`, icoFromPng(fav32, 32))
console.log(`✓ ${OUT}/favicon.ico`)

// 矢量版图标，浏览器优先使用，任意 DPI 都清晰
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="步序">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b4a8f9"/>
      <stop offset="1" stop-color="#5240c8"/>
    </linearGradient>
    <radialGradient id="s" cx=".28" cy="-.04" r=".86">
      <stop offset="0" stop-color="#fff" stop-opacity=".45"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="15.04" fill="url(#g)"/>
  <rect width="64" height="64" rx="15.04" fill="url(#s)"/>
  <g fill="#fff">
    <rect x="15.94" y="33.92" width="7.55" height="14.4" rx="3.78"/>
    <rect x="28.23" y="26.56" width="7.55" height="21.76" rx="3.78"/>
    <rect x="40.52" y="19.52" width="7.55" height="28.8" rx="3.78"/>
  </g>
</svg>
`
writeFileSync(`${OUT}/favicon.svg`, svg)
console.log(`✓ ${OUT}/favicon.svg`)
