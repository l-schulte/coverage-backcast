<script lang="ts">
  import { interpolateRdYlGn } from 'd3-scale-chromatic';
  const stops = Array.from({ length: 11 }, (_, i) => interpolateRdYlGn(i / 10));
</script>

<div class="legend">
  <span class="end">0%</span>
  <div class="bar">
    {#each stops as color, i (i)}
      <span style:background={color}></span>
    {/each}
  </div>
  <span class="end">100%</span>
  <span class="note">no data</span>
  <span class="nodata"></span>
</div>

<style>
  .legend {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #94a3b8;
  }
  .bar {
    display: flex;
    width: 120px;
    height: 10px;
    border-radius: 3px;
    overflow: hidden;
  }
  .bar span {
    flex: 1;
  }
  .nodata {
    width: 12px;
    height: 10px;
    border-radius: 3px;
    background: #4b5563;
  }
  .note {
    margin-left: 6px;
  }
</style>
