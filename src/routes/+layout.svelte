<script lang="ts">
  import '../app.css'
  let { children } = $props()
</script>

<svelte:head>
  <title>步序 · 个人工作台</title>
  <meta name="description" content="管理目标、记录思考、查看收支与存款。">
</svelte:head>
{@render children()}
