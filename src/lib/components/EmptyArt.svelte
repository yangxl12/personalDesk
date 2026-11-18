<script lang="ts">
  let { size = 96, label = '' }: { size?: number; label?: string } = $props()
</script>

<!-- Purely decorative empty state: a floating pane of light, slowly breathing. No copy, no icon. -->
<div class="empty-art" style="--art-size: {size}px">
  <svg viewBox="10 10 100 100" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="art-glow">
        <stop offset="0%" stop-color="var(--primary)" stop-opacity=".30" />
        <stop offset="100%" stop-color="var(--primary)" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="art-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="var(--glass-edge)" stop-opacity=".9" />
        <stop offset="55%" stop-color="var(--primary-soft)" stop-opacity=".25" />
        <stop offset="100%" stop-color="var(--glass-edge)" stop-opacity=".5" />
      </linearGradient>
    </defs>

    <circle class="art-halo" cx="60" cy="60" r="42" fill="url(#art-glow)" />
    <circle class="art-orbit" cx="60" cy="60" r="46" />
    <circle class="art-orbit art-orbit-inner" cx="60" cy="60" r="38" />

    <g class="art-panel">
      <rect class="art-panel-body" x="30" y="28" width="62" height="58" rx="19" fill="url(#art-glass)" />
      <rect class="art-panel-sheen" x="34" y="32" width="54" height="22" rx="11" />
      <rect class="art-bar art-bar-one" x="44" y="55" width="7" height="14" rx="3.5" />
      <rect class="art-bar art-bar-two" x="57" y="48" width="7" height="21" rx="3.5" />
      <rect class="art-bar art-bar-three" x="70" y="41" width="7" height="28" rx="3.5" />
    </g>

    <g class="art-spark">
      <path d="M100 22c0 4.6 1.9 6.5 6.5 6.5-4.6 0-6.5 1.9-6.5 6.5 0-4.6-1.9-6.5-6.5-6.5 4.6 0 6.5-1.9 6.5-6.5Z" />
    </g>
    <g class="art-sat art-sat-a"><circle cx="60" cy="14" r="2.8" /></g>
    <g class="art-sat art-sat-b"><circle cx="60" cy="106" r="2.1" /></g>
  </svg>
  {#if label}<span class="sr-only">{label}</span>{/if}
</div>

<style>
  .empty-art { display: grid; place-items: center; padding: 8px 0 12px; }
  .empty-art svg { width: var(--art-size); height: var(--art-size); overflow: visible; }

  .art-halo {
    transform-box: view-box; transform-origin: 60px 60px;
    animation: art-breathe 8s ease-in-out infinite;
  }
  .art-orbit {
    fill: none; stroke: var(--primary); stroke-opacity: .22; stroke-width: 1;
    stroke-dasharray: 2 9; stroke-linecap: round;
    transform-box: view-box; transform-origin: 60px 60px;
    animation: art-spin 48s linear infinite;
  }
  .art-orbit-inner { stroke-opacity: .1; stroke-dasharray: 1 7; animation-duration: 36s; animation-direction: reverse; }

  .art-panel {
    transform-box: view-box; transform-origin: 61px 57px;
    animation: art-float 7s ease-in-out infinite;
  }
  .art-panel-body { stroke: var(--glass-border); stroke-width: 1; filter: drop-shadow(0 8px 14px rgba(70, 52, 140, .14)); }
  .art-panel-sheen { fill: var(--sheen); opacity: .6; }
  .art-bar { fill: var(--primary); }
  .art-bar-one { opacity: .42; }
  .art-bar-two { opacity: .7; }
  .art-bar-three { opacity: 1; }

  .art-spark {
    fill: var(--primary);
    transform-box: view-box; transform-origin: 100px 28px;
    animation: art-twinkle 5.5s ease-in-out infinite;
  }
  .art-sat { fill: var(--primary); transform-box: view-box; transform-origin: 60px 60px; }
  .art-sat-a { opacity: .55; animation: art-spin 26s linear infinite; }
  .art-sat-b { opacity: .38; animation: art-spin 38s linear infinite reverse; }

  @keyframes art-float {
    0%, 100% { transform: rotate(-6deg) translateY(0); }
    50% { transform: rotate(-6deg) translateY(-4px); }
  }
  @keyframes art-breathe {
    0%, 100% { transform: scale(1); opacity: .7; }
    50% { transform: scale(1.1); opacity: 1; }
  }
  @keyframes art-spin { to { transform: rotate(360deg); } }
  @keyframes art-twinkle {
    0%, 100% { transform: scale(.8); opacity: .35; }
    50% { transform: scale(1); opacity: .95; }
  }

  @media (prefers-reduced-motion: reduce) {
    .art-halo, .art-orbit, .art-panel, .art-spark, .art-sat { animation: none; }
    .art-spark { opacity: .75; }
  }
</style>
