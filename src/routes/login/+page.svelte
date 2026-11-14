<script lang="ts">
  import { enhance } from '$app/forms'
  import Brand from '#lib/components/Brand.svelte'
  let { form } = $props()
  let pending = $state(false)
</script>

<main class="login-page">
  <section class="card login-card" aria-labelledby="login-heading">
    <Brand href="/login" />
    <h1 id="login-heading">登录</h1>
    <form method="POST" use:enhance={() => {
      pending = true
      return async ({ result, update }) => {
        try { await update({ reset: result.type === 'redirect' }) }
        finally { pending = false }
      }
    }}>
      <label class="field">账号<input name="username" defaultValue={form?.username ?? ''} autocomplete="username" required maxlength="64"></label>
      <label class="field">密码<input type="password" name="password" autocomplete="current-password" required></label>
      {#if form?.message}<p class="form-error" role="alert">{form.message}</p>{/if}
      <button class="button primary" type="submit" disabled={pending}>{pending ? '登录中…' : '登录'}</button>
    </form>
  </section>
</main>
