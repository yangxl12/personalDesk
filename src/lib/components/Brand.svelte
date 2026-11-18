<script lang="ts">
  import { resolve } from '$app/paths'
  let { label = '步序', href = resolve('') }: { label?: string; href?: string } = $props()
</script>

<a class="brand" {href}><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>{label}</span></a>
