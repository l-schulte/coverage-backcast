<script lang="ts">
  import { ui } from '../lib/store.svelte';
  import type { ColorMetric } from '../lib/types';

  const metrics: { value: ColorMetric; label: string }[] = [
    { value: 'lines', label: 'line coverage' },
    { value: 'branches', label: 'branch coverage' },
    { value: 'functions', label: 'function coverage' },
  ];
</script>

<div class="controls">
  <div class="group transport">
    <button title="First" onclick={() => ui.goTo(0)}>⏮</button>
    <button title="Previous commit" onclick={() => ui.step(-1)}>◀</button>
    <button
      class="play"
      title={ui.playing ? 'Pause' : 'Play'}
      onclick={() => (ui.playing = !ui.playing)}
    >
      {ui.playing ? '⏸' : '▶'}
    </button>
    <button title="Next commit" onclick={() => ui.step(1)}>▶</button>
    <button title="Last" onclick={() => ui.goTo(ui.commits.length - 1)}>⏭</button>
  </div>

  <label class="group">
    <span>suite</span>
    <select bind:value={ui.suite}>
      {#each ui.suiteOptions as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </label>

  <label class="group">
    <span>color</span>
    <select bind:value={ui.metric}>
      {#each metrics as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </label>

  <label class="group">
    <span>speed {ui.speed}/s</span>
    <input type="range" min="1" max="24" step="1" bind:value={ui.speed} />
  </label>

  <label class="group">
    <span>min lines</span>
    <input class="num" type="number" min="0" step="10" bind:value={ui.minLines} />
  </label>

  <label class="group check">
    <input type="checkbox" bind:checked={ui.hideTests} />
    <span>hide tests</span>
  </label>
</div>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
    padding: 10px 14px;
    background: #0f172a;
    border-bottom: 1px solid #1e293b;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #94a3b8;
  }
  .transport button {
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    border-radius: 6px;
    width: 30px;
    height: 28px;
    cursor: pointer;
    font-size: 12px;
  }
  .transport button:hover {
    background: #334155;
  }
  .play {
    background: #0ea5e9 !important;
    border-color: #0ea5e9 !important;
    color: #04121c !important;
  }
  select,
  input.num {
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    border-radius: 6px;
    padding: 4px 6px;
    font-size: 12px;
  }
  input.num {
    width: 70px;
  }
  input[type='range'] {
    width: 90px;
    accent-color: #0ea5e9;
  }
  .check input {
    accent-color: #0ea5e9;
  }
</style>
