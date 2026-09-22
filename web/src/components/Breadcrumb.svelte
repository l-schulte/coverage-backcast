<script lang="ts">
  interface Props {
    focusPath: string;
    onfocus: (path: string) => void;
  }
  let { focusPath, onfocus }: Props = $props();

  const segments = $derived(
    focusPath
      .split('/')
      .filter(Boolean)
      .map((name, index, all) => ({
        name,
        path: `/${all.slice(0, index + 1).join('/')}`,
      })),
  );
</script>

<nav class="crumbs">
  <button class:active={!focusPath} onclick={() => onfocus('')}>all</button>
  {#each segments as segment (segment.path)}
    <span class="sep">/</span>
    <button class:active={segment.path === focusPath} onclick={() => onfocus(segment.path)}>
      {segment.name}
    </button>
  {/each}
</nav>

<style>
  .crumbs {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    padding: 4px 14px;
    background: #0b1220;
    border-bottom: 1px solid #1e293b;
    font-family: ui-monospace, monospace;
    font-size: 11px;
  }
  button {
    background: transparent;
    border: none;
    color: #7dd3fc;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
  }
  button:hover {
    background: #1e293b;
  }
  button.active {
    color: #f8fafc;
    font-weight: 600;
  }
  .sep {
    color: #475569;
  }
</style>
