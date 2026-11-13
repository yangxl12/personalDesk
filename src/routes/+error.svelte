<script lang="ts">
  import { page } from '$app/state'
  import Brand from '#lib/components/Brand.svelte'
</script>

<main class="login-page">
  <section class="card login-card">
    <Brand />
    <h1>{page.status === 404 ? '找不到页面' : '页面加载失败'}</h1>
    <p class="muted">{page.error?.message}</p>
    <a href="/" class="button primary">返回工作台</a>
  </section>
</main>
