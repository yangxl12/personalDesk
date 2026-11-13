<script lang="ts">
const paths: Record<string, string> = {
  home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  finance: '<path d="M20 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2M3 7h15a3 3 0 0 1 3 3v4a2 2 0 0 1-2 2h-4a4 4 0 0 1 0-8h4"/><path d="M15 12h.01"/>',
  notes: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>',
  chats: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/><path d="M8.5 11.5h7"/>',
  spark: '<path d="M10 3c0 5-2 7-7 7 5 0 7 2 7 7 0-5 2-7 7-7-5 0-7-2-7-7Z"/><path d="M18.5 13v7m-3.5-3.5h7M18 3v4m-2-2h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="M19 12H5m6 6-6-6 6-6"/>',
  upRight: '<path d="M6 18 18 6M8 6h10v10"/>',
  downRight: '<path d="m6 6 12 12M8 18h10V8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  edit: '<path d="M12 20H4v-4L16 4a2.8 2.8 0 0 1 4 4L8 20m6-14 4 4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3m4 0-1 15H6L5 6m5 4v7m4-7v7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  send: '<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
  run: '<path d="m13 4-8 9h6l-1 7 9-10h-6l1-6z"/>',
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h14v18H6a2 2 0 1 1 0-4h14M9 8h6"/>',
  settings: '<path d="M10 3h4l.6 2.7 2 .9 2.5-1.1 2 3.5-1.9 1.8v2.4l1.9 1.8-2 3.5-2.5-1.1-2 .9L14 21h-4l-.6-2.7-2-.9-2.5 1.1-2-3.5 1.9-1.8v-2.4L2.9 9l2-3.5 2.5 1.1 2-.9L10 3Z"/><circle cx="12" cy="12" r="3"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4m-4 0h8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20.9 13.4a9 9 0 0 1-10.3-10.3 9 9 0 1 0 10.3 10.3Z"/>',
  cloud: '<path d="M6 18a4 4 0 1 1 .8-7.9 6 6 0 0 1 11.6 1A3.5 3.5 0 0 1 18 18Z"/>',
  rain: '<path d="M6 15a3.5 3.5 0 1 1 .5-7 5.5 5.5 0 0 1 10.6 1 3 3 0 0 1 .9 6m-9 2-1 3m5-3-1 3m5-3-1 3"/>',
  snow: '<path d="M12 3v18m-8-4.5 16-9m-16 0 16 9M9 4.5l3 3 3-3m-6 15 3-3 3 3M4 10.5l4-1 .5-4m7 13 .5-4 4-1M4 13.5l4 1 .5 4m7-13 .5 4 4 1"/>',
  pin: '<path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
};

  let { name, size = 20 }: { name: string; size?: number } = $props()
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <!-- Paths are static icon definitions. -->
  {@html paths[name] ?? paths.home}
</svg>
