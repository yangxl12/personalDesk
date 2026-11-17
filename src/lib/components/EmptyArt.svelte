<script lang="ts">
  let { size = 96, label = '' }: { size?: number; label?: string } = $props()
</script>

<!-- Purely decorative empty state: a soft, slowly breathing mark. No copy, no icon. -->
<div class="empty-art" style="--art-size: {size}px">
  <svg viewBox="10 10 100 100" aria-hidden="true" focusable="false">
    <circle class="art-halo" cx="60" cy="62" r="33" />
    <circle class="art-orbit" cx="60" cy="60" r="46" />
    <g class="art-panel">
      <rect class="art-panel-body" x="30" y="28" width="64" height="58" rx="20" />
      <rect class="art-bar art-bar-one" x="45" y="54" width="7.5" height="14" rx="3.75" />
      <rect class="art-bar art-bar-two" x="58" y="47" width="7.5" height="21" rx="3.75" />
      <rect class="art-bar art-bar-three" x="71" y="41" width="7.5" height="27" rx="3.75" />
    </g>
    <g class="art-spark">
      <path d="M99 24c0 4.4 1.8 6.2 6.2 6.2-4.4 0-6.2 1.8-6.2 6.2 0-4.4-1.8-6.2-6.2-6.2 4.4 0 6.2-1.8 6.2-6.2Z" />
    </g>
    <g class="art-sat art-sat-a"><circle cx="60" cy="14" r="2.6" /></g>
    <g class="art-sat art-sat-b"><circle cx="60" cy="106" r="2" /></g>
  </svg>
  {#if label}<span class="sr-only">{label}</span>{/if}
</div>

<style>
  .empty-art { display: grid; place-items: center; padding: 10px 0 14px; }
  .empty-art svg { width: var(--art-size); height: var(--art-size); overflow: visible; }

  .art-halo {
    fill: var(--primary); opacity: .1; filter: blur(7px);
    transform-box: view-box; transform-origin: 60px 62px;
    animation: art-breathe 8s ease-in-out infinite;
  }
  .art-orbit {
    fill: none; stroke: var(--primary); stroke-opacity: .24; stroke-width: 1.1;
    stroke-dasharray: 2.5 9; stroke-linecap: round;
    transform-box: view-box; transform-origin: 60px 60px;
    animation: art-spin 48s linear infinite;
  }
  .art-panel {
    transform-box: view-box; transform-origin: 62px 57px;
    animation: art-float 7s ease-in-out infinite;
  }
  .art-panel-body { fill: var(--primary-soft); stroke: var(--primary); stroke-opacity: .2; stroke-width: 1.2; }
  .art-bar { fill: var(--primary); }
  .art-bar-one { opacity: .4; }
  .art-bar-two { opacity: .68; }
  .art-bar-three { opacity: 1; }

  .art-spark {
    fill: var(--primary);
    transform-box: view-box; transform-origin: 99px 30px;
    animation: art-twinkle 5.5s ease-in-out infinite;
  }

  .art-sat { fill: var(--primary); transform-box: view-box; transform-origin: 60px 60px; }
  .art-sat-a { opacity: .5; animation: art-spin 26s linear infinite; }
  .art-sat-b { opacity: .35; animation: art-spin 38s linear infinite reverse; }

  @keyframes art-float {
    0%, 100% { transform: rotate(-6deg) translateY(0); }
    50% { transform: rotate(-6deg) translateY(-3.5px); }
  }
  @keyframes art-breathe {
    0%, 100% { transform: scale(1); opacity: .09; }
    50% { transform: scale(1.08); opacity: .14; }
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
