<script lang="ts">
  import { scaleLinear, scaleTime } from 'd3-scale';
  import { area, line } from 'd3-shape';
  import { coverageColor } from '../lib/color';

  export interface TimelinePoint {
    ts: number;
    ratio: number | null;
    status: string;
  }

  interface Props {
    points: TimelinePoint[];
    current: number;
    onseek: (index: number) => void;
  }

  let { points, current, onseek }: Props = $props();

  let width = $state(900);
  let height = 78;
  const padX = 8;
  const padTop = 8;
  const padBottom = 14;

  let wrapper: HTMLDivElement;
  let dragging = $state(false);

  $effect(() => {
    const observer = new ResizeObserver((entries) => {
      width = Math.max(120, entries[0].contentRect.width);
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  });

  const x = $derived(
    scaleTime()
      .domain(
        points.length
          ? [new Date(points[0].ts * 1000), new Date(points[points.length - 1].ts * 1000)]
          : [new Date(), new Date()],
      )
      .range([padX, Math.max(padX + 1, width - padX)]),
  );

  const y = $derived(
    scaleLinear()
      .domain([0, 1])
      .range([height - padBottom, padTop])
      .clamp(true),
  );

  const valid = $derived(points.filter((p) => p.ratio !== null));
  const linePath = $derived(
    line<TimelinePoint>()
      .defined((p) => p.ratio !== null)
      .x((p) => x(new Date(p.ts * 1000)))
      .y((p) => y(p.ratio ?? 0))(valid),
  );
  const areaPath = $derived(
    area<TimelinePoint>()
      .defined((p) => p.ratio !== null)
      .x((p) => x(new Date(p.ts * 1000)))
      .y0(y(0))
      .y1((p) => y(p.ratio ?? 0))(valid),
  );

  const currentPoint = $derived(points[current]);

  function seekFromEvent(event: MouseEvent) {
    if (!points.length) return;
    const rect = wrapper.getBoundingClientRect();
    const ts = x.invert(event.clientX - rect.left).getTime() / 1000;
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].ts < ts) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(points[lo - 1].ts - ts) < Math.abs(points[lo].ts - ts)) lo -= 1;
    onseek(lo);
  }

  function handleDown(event: MouseEvent) {
    dragging = true;
    seekFromEvent(event);
  }
  function handleMove(event: MouseEvent) {
    if (dragging) seekFromEvent(event);
  }
  function handleUp() {
    dragging = false;
  }
</script>

<svelte:window onmouseup={handleUp} onmousemove={handleMove} />

<div class="timeline" bind:this={wrapper}>
  <svg width={width} height={height} role="presentation">
    <!-- gaps -->
    {#each points as point, index (index)}
      {#if point.ratio === null}
        <rect
          x={x(new Date(point.ts * 1000)) - 0.5}
          y={padTop}
          width={1}
          height={height - padBottom - padTop}
          fill="#ef4444"
          opacity="0.35"
        />
      {/if}
    {/each}

    <path d={areaPath ?? ''} fill="url(#cov-grad)" opacity="0.35" />
    <path d={linePath ?? ''} fill="none" stroke="#38bdf8" stroke-width="1.4" />

    {#if currentPoint}
      <line
        x1={x(new Date(currentPoint.ts * 1000))}
        x2={x(new Date(currentPoint.ts * 1000))}
        y1={padTop - 4}
        y2={height - padBottom + 2}
        stroke="#f8fafc"
        stroke-width="1.2"
        opacity="0.85"
      />
      <circle
        cx={x(new Date(currentPoint.ts * 1000))}
        cy={y(currentPoint.ratio ?? 0)}
        r="3.2"
        fill={coverageColor(currentPoint.ratio)}
        stroke="#0f172a"
        stroke-width="1"
      />
    {/if}

    <defs>
      <linearGradient id="cov-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.8" />
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
      </linearGradient>
    </defs>
  </svg>
  <div
    class="hit"
    onmousedown={handleDown}
    role="slider"
    tabindex="0"
    aria-valuenow={current}
    aria-valuemin="0"
    aria-valuemax={points.length - 1}
    onkeydown={(e) => {
      if (e.key === 'ArrowLeft') onseek(Math.max(0, current - 1));
      if (e.key === 'ArrowRight') onseek(Math.min(points.length - 1, current + 1));
    }}
  ></div>
</div>

<style>
  .timeline {
    position: relative;
    width: 100%;
    user-select: none;
  }
  svg {
    display: block;
  }
  .hit {
    position: absolute;
    inset: 0;
    cursor: crosshair;
  }
</style>
