<script lang="ts">
  import { onMount } from 'svelte';
  import { ui } from './lib/store.svelte';
  import { MERGE_SUITE } from './lib/db';
  import { buildTree, nodeAt } from './lib/layout';
  import type { RenderNode } from './lib/render';
  import type { CoverageRow } from './lib/types';
  import { ratioFor } from './lib/types';
  import Controls from './components/Controls.svelte';
  import Breadcrumb from './components/Breadcrumb.svelte';
  import CircleCanvas from './components/CircleCanvas.svelte';
  import Timeline from './components/Timeline.svelte';
  import Details from './components/Details.svelte';
  import Legend from './components/Legend.svelte';

  const TEST_RE = /(^|\/)(__tests__|tests?|specs?)(\/|$)|\.(test|spec)\.[a-z]+$/i;

  let rows = $state<CoverageRow[]>([]);
  let prevRows = $state<CoverageRow[]>([]);
  let hovered = $state<RenderNode | null>(null);
  let loadToken = 0;

  onMount(() => {
    void ui.init();
  });

  // Load coverage for the current commit (and the previous one for deltas).
  $effect(() => {
    const commit = ui.commit;
    const suite = ui.suite;
    if (!commit || ui.status !== 'ready') return;
    const token = ++loadToken;
    const prev = ui.commits[ui.current - 1];

    void (async () => {
      try {
        const current = await ui.db.coverage(commit.commit_id, suite);
        const previous = prev ? await ui.db.coverage(prev.commit_id, suite) : [];
        if (token !== loadToken) return;
        rows = current;
        prevRows = previous;
        hovered = null;
        // Prefetch neighbours so playback stays smooth.
        for (let offset = 1; offset <= 3; offset += 1) {
          for (const index of [ui.current + offset, ui.current - offset]) {
            const neighbour = ui.commits[index];
            if (neighbour) void ui.db.coverage(neighbour.commit_id, suite);
          }
        }
      } catch (error) {
        if (token === loadToken) ui.error = error instanceof Error ? error.message : String(error);
      }
    })();
  });

  // Playback timer.
  $effect(() => {
    if (!ui.playing) return;
    if (ui.current >= ui.commits.length - 1) {
      ui.playing = false;
      return;
    }
    const id = setInterval(() => {
      if (ui.current >= ui.commits.length - 1) {
        ui.playing = false;
        return;
      }
      ui.step(1);
    }, Math.max(40, 1000 / ui.speed));
    return () => clearInterval(id);
  });

  const filteredRows = $derived.by(() => {
    let result = rows;
    if (ui.hideTests) result = result.filter((r) => !TEST_RE.test(r.path));
    if (ui.minLines > 0) result = result.filter((r) => r.lf >= ui.minLines);
    return result;
  });

  const tree = $derived(buildTree(filteredRows));

  const projectRatio = $derived.by(() => {
    let lf = 0;
    let lh = 0;
    for (const row of rows) {
      lf += row.lf;
      lh += row.lh;
    }
    return lf ? lh / lf : null;
  });

  const prevRatios = $derived.by(() => {
    const map = new Map<string, number>();
    for (const row of prevRows) {
      if (row.lf) map.set(row.path, row.lh / row.lf);
    }
    return map;
  });

  const hoveredDelta = $derived.by(() => {
    if (!hovered || hovered.ratio < 0 || hovered.isFile === false) return null;
    const before = prevRatios.get(hovered.path);
    if (before === undefined) return null;
    return hovered.ratio - before;
  });

  const hasCoverage = $derived(
    ui.commit?.status === 'ok' || ui.commit?.status === 'tests_failed',
  );

  const timelinePoints = $derived.by(() => {
    const per = new Map<number, { lf: number; lh: number; brf: number; brh: number; fnf: number; fnh: number }>();
    for (const point of ui.timeline) {
      if (!point.suite) continue;
      if (ui.suite !== MERGE_SUITE && point.suite !== ui.suite) continue;
      const acc = per.get(point.commit_id) ?? { lf: 0, lh: 0, brf: 0, brh: 0, fnf: 0, fnh: 0 };
      acc.lf += point.lf;
      acc.lh += point.lh;
      acc.brf += point.brf;
      acc.brh += point.brh;
      acc.fnf += point.fnf;
      acc.fnh += point.fnh;
      per.set(point.commit_id, acc);
    }
    return ui.commits.map((commit) => {
      const acc = per.get(commit.commit_id);
      return { ts: commit.ts, ratio: acc ? ratioFor(acc, ui.metric) : null, status: commit.status };
    });
  });

  // Drop the zoom if the focused node disappears from the current tree.
  $effect(() => {
    if (ui.focusPath && !nodeAt(tree, ui.focusPath)) {
      ui.focusPath = '';
    }
  });

  function handleFocus(path: string) {
    ui.focusPath = path;
  }
</script>

  <svelte:head><title>Coverage Backcast</title></svelte:head>

<div class="app">
  <header>
    <div class="brand">Coverage Backcast</div>
    <Legend />
    <div class="spacer"></div>
    {#if ui.meta}
      <div class="meta">
        {ui.meta.commit_count} commits · {ui.meta.suites.join(', ')} · stripped
        {ui.meta.prefix_stripped ?? 'none'}
      </div>
    {/if}
  </header>

  <Controls />
  <Breadcrumb focusPath={ui.focusPath} onfocus={handleFocus} />

  <main>
    {#if ui.status === 'loading' && !ui.commits.length}
      <div class="overlay">loading dataset…</div>
    {:else if ui.status === 'error'}
      <div class="overlay error">
        {ui.error}
        <p>Run the importer and make sure <code>data/</code> is served at <code>/data</code>.</p>
      </div>
    {:else}
      <CircleCanvas
        {tree}
        focusPath={ui.focusPath}
        metric={ui.metric}
        onfocus={handleFocus}
        onhover={(node) => (hovered = node)}
      />
      {#if !hasCoverage}
        <div class="overlay gap">
          <strong>no coverage for this commit</strong>
          <span>status: {ui.commit?.status ?? 'unknown'} · step to a coverage run or scrub the timeline</span>
        </div>
      {/if}
    {/if}
    <Details
      commit={ui.commit}
      {hovered}
      delta={hoveredDelta}
      {projectRatio}
    />
  </main>

  <footer>
    <Timeline points={timelinePoints} current={ui.current} onseek={(index) => ui.goTo(index)} />
  </footer>
</div>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
    background: #060b16;
    color: #e2e8f0;
    font-family: system-ui, -apple-system, sans-serif;
  }
  :global(#app) {
    height: 100%;
  }
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 10px 14px;
    background: #0b1220;
    border-bottom: 1px solid #1e293b;
  }
  .brand {
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #38bdf8;
  }
  .spacer {
    flex: 1;
  }
  .meta {
    font-size: 11px;
    color: #64748b;
  }
  main {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }
  main :global(.canvas-wrap) {
    flex: 1;
  }
  footer {
    padding: 6px 10px 10px;
    background: #0b1220;
    border-top: 1px solid #1e293b;
  }
  .overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    color: #64748b;
    font-size: 14px;
  }
  .overlay.error {
    color: #f87171;
  }
  .overlay.gap {
    position: absolute;
    inset: 0 250px 0 0;
    background: rgba(6, 11, 22, 0.78);
    pointer-events: none;
    gap: 4px;
  }
  .overlay.gap strong {
    color: #f8fafc;
  }
  .overlay.gap span {
    font-size: 12px;
  }
  .overlay code {
    color: #7dd3fc;
  }
</style>
