<script lang="ts">
  import { coverageColor, formatPercent } from '../lib/color';
  import type { CommitMeta } from '../lib/types';
  import type { RenderNode } from '../lib/render';

  interface Props {
    commit: CommitMeta | undefined;
    hovered: RenderNode | null;
    delta: number | null;
    projectRatio: number | null;
  }
  let { commit, hovered, delta, projectRatio }: Props = $props();

  const date = $derived(commit ? new Date(commit.ts * 1000) : null);
</script>

<aside class="details">
  <section>
    <h3>Commit</h3>
    {#if commit}
      <dl>
        <dt>#</dt><dd>{commit.commit_id}</dd>
        <dt>date</dt><dd>{date?.toISOString().slice(0, 16).replace('T', ' ')}</dd>
        <dt>sha</dt><dd class="mono">{commit.sha.slice(0, 12)}</dd>
        <dt>status</dt><dd><span class="status {commit.status}">{commit.status}</span></dd>
      </dl>
    {:else}
      <p class="muted">no commit selected</p>
    {/if}
  </section>

  <section>
    <h3>Project coverage</h3>
    <div class="big" style:color={coverageColor(projectRatio)}>
      {formatPercent(projectRatio)}
    </div>
  </section>

  <section>
    <h3>Selection</h3>
    {#if hovered}
      <div class="path mono">{hovered.path || '/'}</div>
      <dl>
        <dt>lines</dt><dd>{hovered.lh} / {hovered.lf}</dd>
        <dt>line cov</dt><dd>{formatPercent(hovered.lf ? hovered.lh / hovered.lf : null)}</dd>
        <dt>branches</dt><dd>{hovered.brh} / {hovered.brf}</dd>
        <dt>functions</dt><dd>{hovered.fnh} / {hovered.fnf}</dd>
      </dl>
      {#if delta !== null}
        <div class="delta" class:up={delta > 0} class:down={delta < 0}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '■'}
          {(Math.abs(delta) * 100).toFixed(1)} pts vs prev commit
        </div>
      {/if}
    {:else}
      <p class="muted">hover a circle for details</p>
    {/if}
  </section>
</aside>

<style>
  .details {
    width: 250px;
    flex: 0 0 250px;
    background: #0b1220;
    border-left: 1px solid #1e293b;
    padding: 12px 14px;
    overflow-y: auto;
    font-size: 12px;
    color: #cbd5e1;
  }
  section {
    margin-bottom: 18px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748b;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 0;
  }
  dt {
    color: #64748b;
  }
  dd {
    margin: 0;
    text-align: right;
  }
  .mono {
    font-family: ui-monospace, monospace;
  }
  .path {
    word-break: break-all;
    color: #e2e8f0;
    margin-bottom: 6px;
  }
  .big {
    font-size: 26px;
    font-weight: 700;
  }
  .muted {
    color: #475569;
    margin: 0;
  }
  .delta {
    margin-top: 8px;
    font-weight: 600;
    color: #94a3b8;
  }
  .delta.up {
    color: #4ade80;
  }
  .delta.down {
    color: #f87171;
  }
  .status {
    padding: 1px 6px;
    border-radius: 999px;
    background: #1e293b;
  }
  .status.ok {
    color: #4ade80;
  }
  .status.tests_failed {
    color: #fbbf24;
  }
  .status.error,
  .status.not_applicable {
    color: #f87171;
  }
</style>
