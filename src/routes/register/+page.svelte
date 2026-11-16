<script lang="ts">
  import { enhance } from '$app/forms'
  import Brand from '#lib/components/Brand.svelte'
  let { form } = $props()
  let pending = $state(false)
</script>

<main class="login-page">
  <section class="card login-card" aria-labelledby="register-heading">
    <Brand href="/login" />
    <h1 id="register-heading">创建账号</h1>
    <p class="login-intro">这是个人工作台，只需要一个账号。注册后将自动登录。</p>
    <form method="POST" use:enhance={() => {
      pending = true
      return async ({ result, update }) => {
        try { await update({ reset: result.type === 'redirect' }) }
        finally { pending = false }
      }
    }}>
      <label class="field">账号<input name="username" defaultValue={form?.username ?? ''} autocomplete="username" required maxlength="64"></label>
      <p class="field-hint">英文字母、数字、下划线、点或短横线，最多 64 个字符。</p>
      <label class="field">密码<input type="password" name="password" autocomplete="new-password" required minlength="12"></label>
      <p class="field-hint">至少 12 个字符。</p>
      <label class="field">确认密码<input type="password" name="confirmation" autocomplete="new-password" required minlength="12"></label>
      {#if form?.message}<p class="form-error" role="alert">{form.message}</p>{/if}
      <button class="button primary" type="submit" disabled={pending}>{pending ? '创建中…' : '创建账号'}</button>
    </form>
    <p class="login-alt">已有账号？<a class="text-link" href="/login">返回登录</a></p>
  </section>
</main>
