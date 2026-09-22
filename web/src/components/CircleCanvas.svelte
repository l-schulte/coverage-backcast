<script lang="ts">
  import { onMount } from 'svelte';
  import { CircleRenderer, type RenderNode } from '../lib/render';
  import { layout, type TreeNode } from '../lib/layout';
  import { coverageColor, formatPercent } from '../lib/color';
  import type { ColorMetric } from '../lib/types';

  interface Props {
    tree: TreeNode | null;
    focusPath: string;
    metric: ColorMetric;
    onfocus: (path: string) => void;
    onhover: (node: RenderNode | null) => void;
  }

  let { tree, focusPath, metric, onfocus, onhover }: Props = $props();

  let wrapper: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let renderer: CircleRenderer | null = null;
  let width = $state(800);
  let height = $state(600);
  let hovered = $state<RenderNode | null>(null);
  let pointer = $state({ x: 0, y: 0 });

  onMount(() => {
    renderer = new CircleRenderer(canvas);
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) {
        width = rect.width;
        height = rect.height;
        renderer?.resize(width, height);
      }
    });
    observer.observe(wrapper);
    return () => {
      observer.disconnect();
      renderer?.dispose();
    };
  });

  $effect(() => {
    if (!renderer || !tree || width === 0 || height === 0) return;
    renderer.setNodes(layout(tree, width, height, focusPath, metric), 420);
  });

  function parentOf(path: string): string {
    const index = path.lastIndexOf('/');
    return index > 0 ? path.slice(0, index) : '';
  }

  function hit(event: MouseEvent): RenderNode | null {
    const rect = canvas.getBoundingClientRect();
    return renderer?.hitTest(event.clientX - rect.left, event.clientY - rect.top) ?? null;
  }

  function handleMove(event: MouseEvent) {
    const node = hit(event);
    hovered = node;
    const rect = wrapper.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    onhover(node);
  }

  function handleLeave() {
    hovered = null;
    onhover(null);
  }

  function handleClick(event: MouseEvent) {
    const node = hit(event);
    if (node && !node.isFile) {
      onfocus(node.key);
    } else if (!node) {
      onfocus(parentOf(focusPath));
    }
  }
</script>

<div class="canvas-wrap" bind:this={wrapper}>
  <canvas
    bind:this={canvas}
    class:hovering={hovered !== null}
    onmousemove={handleMove}
    onmouseleave={handleLeave}
    onclick={handleClick}
  ></canvas>

  {#if hovered && hovered.alpha > 0.7}
    <div
      class="tooltip"
      style:left="{Math.min(pointer.x + 14, width - 250)}px"
      style:top="{pointer.y + 14}px"
    >
      <div class="tt-path">{hovered.path || '/'}</div>
      <div class="tt-rows">
        {#if hovered.isFile}
          <span>lines <b>{hovered.lh}</b>/{hovered.lf}</span>
          <span>branch <b>{hovered.brh}</b>/{hovered.brf}</span>
          <span>fn <b>{hovered.fnh}</b>/{hovered.fnf}</span>
        {:else}
          <span>lines <b>{hovered.lh}</b>/{hovered.lf}</span>
          <span>size <b>{hovered.lf}</b></span>
        {/if}
      </div>
      <div class="tt-cov" style:color={coverageColor(hovered.ratio)}>
        {formatPercent(hovered.ratio < 0 ? null : hovered.ratio)} covered
      </div>
    </div>
  {/if}
</div>

<style>
  .canvas-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  canvas {
    display: block;
    touch-action: none;
  }
  canvas.hovering {
    cursor: pointer;
  }
  .tooltip {
    position: absolute;
    z-index: 20;
    max-width: 240px;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.94);
    color: #e2e8f0;
    font-size: 12px;
    line-height: 1.45;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  .tt-path {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    color: #94a3b8;
    word-break: break-all;
    margin-bottom: 4px;
  }
  .tt-rows {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .tt-rows b {
    color: #fff;
  }
  .tt-cov {
    margin-top: 4px;
    font-weight: 600;
  }
</style>
