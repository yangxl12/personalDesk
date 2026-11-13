<script lang="ts">
  let { label = '步序', href = '/' }: { label?: string; href?: string } = $props()
</script>

<a class="brand" {href}><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>{label}</span></a>
