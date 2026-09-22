import { easeCubicInOut } from 'd3-ease';
import { coverageColor } from './color';
import type { PackedNode } from './layout';

export interface RenderNode {
  key: string;
  name: string;
  path: string;
  depth: number;
  isFile: boolean;
  parentKey: string | null;
  x: number;
  y: number;
  r: number;
  ratio: number;
  alpha: number;
  lf: number;
  lh: number;
  brf: number;
  brh: number;
  fnf: number;
  fnh: number;
  value: number;
}

function toRender(node: PackedNode): RenderNode {
  return {
    key: node.key,
    name: node.name,
    path: node.key,
    depth: node.depth,
    isFile: node.isFile,
    parentKey: node.parentKey,
    x: node.x,
    y: node.y,
    r: node.r,
    ratio: node.ratio === null ? -1 : node.ratio,
    alpha: 1,
    lf: node.lf,
    lh: node.lh,
    brf: node.brf,
    brh: node.brh,
    fnf: node.fnf,
    fnh: node.fnh,
    value: node.value,
  };
}

interface Tween {
  from: RenderNode;
  to: RenderNode;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class CircleRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private tweens = new Map<string, Tween>();
  private resolved = new Map<string, RenderNode>();
  private animStart = 0;
  private animDuration = 0;
  private raf = 0;
  private labelThreshold = 15;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.draw();
  }

  private parentCentre(node: RenderNode, map: Map<string, RenderNode>): { x: number; y: number } {
    if (node.parentKey) {
      const parent = map.get(node.parentKey);
      if (parent) return { x: parent.x, y: parent.y };
    }
    return { x: this.width / 2, y: this.height / 2 };
  }

  setNodes(nodes: PackedNode[], duration = 450): void {
    const previous = new Map(this.resolved);
    const target = new Map<string, RenderNode>();
    for (const node of nodes) target.set(node.key, toRender(node));

    const tweens = new Map<string, Tween>();
    for (const [key, to] of target) {
      const from = previous.get(key);
      if (from) {
        tweens.set(key, { from, to });
      } else {
        const centre = this.parentCentre(to, target);
        tweens.set(key, {
          from: { ...to, x: centre.x, y: centre.y, r: 0, alpha: 0 },
          to,
        });
      }
    }
    for (const [key, from] of previous) {
      if (target.has(key)) continue;
      const centre = this.parentCentre(from, previous);
      tweens.set(key, { from, to: { ...from, x: centre.x, y: centre.y, r: 0, alpha: 0 } });
    }

    this.tweens = tweens;
    this.animStart = performance.now();
    this.animDuration = duration;
    if (duration <= 0) {
      this.resolve(1);
      this.draw();
      return;
    }
    this.startLoop();
  }

  private resolve(t: number): void {
    const eased = easeCubicInOut(t);
    const next = new Map<string, RenderNode>();
    for (const [key, { from, to }] of this.tweens) {
      if (to.alpha === 0 && t >= 1) continue;
      next.set(key, {
        ...to,
        x: lerp(from.x, to.x, eased),
        y: lerp(from.y, to.y, eased),
        r: lerp(from.r, to.r, eased),
        alpha: lerp(from.alpha, to.alpha, eased),
        ratio: lerp(from.ratio, to.ratio, eased),
      });
    }
    this.resolved = next;
  }

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      const t = Math.min(1, (performance.now() - this.animStart) / this.animDuration);
      this.resolve(t);
      this.draw();
      if (t < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const nodes = [...this.resolved.values()].sort((a, b) => b.r - a.r);
    for (const node of nodes) {
      if (node.r < 1.5) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, node.alpha));
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fillStyle = coverageColor(node.ratio);
      ctx.fill();
      ctx.lineWidth = node.isFile ? 0.75 : 1.25;
      ctx.strokeStyle = node.isFile ? 'rgba(15,23,42,0.25)' : 'rgba(248,250,252,0.7)';
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const node of nodes) {
      if (node.r < this.labelThreshold || node.alpha < 0.5) continue;
      if (!node.isFile && node.r < 26) continue;
      const fontSize = Math.max(8, Math.min(13, node.r / 3.2));
      ctx.font = `${node.isFile ? '' : '600 '}${fontSize}px system-ui, sans-serif`;
      const label = this.truncate(node.name, node.r * 1.7);
      if (!label) continue;
      const halfWidth = ctx.measureText(label).width / 2 + 2;
      const halfHeight = fontSize * 0.65;
      const box = {
        x0: node.x - halfWidth,
        y0: node.y - halfHeight,
        x1: node.x + halfWidth,
        y1: node.y + halfHeight,
      };
      if (placed.some((p) => p.x0 < box.x1 && box.x0 < p.x1 && p.y0 < box.y1 && box.y0 < p.y1)) {
        continue;
      }
      placed.push(box);
      ctx.fillStyle =
        node.ratio > 0.62 || node.ratio < 0 ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.95)';
      ctx.fillText(label, node.x, node.y);
    }
  }

  private truncate(text: string, maxWidth: number): string {
    const ctx = this.ctx;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return lo > 1 ? `${text.slice(0, lo)}…` : '';
  }

  hitTest(x: number, y: number): RenderNode | null {
    const nodes = [...this.resolved.values()].sort((a, b) => a.r - b.r);
    for (const node of nodes) {
      if (node.alpha < 0.4) continue;
      const dx = x - node.x;
      const dy = y - node.y;
      if (dx * dx + dy * dy <= node.r * node.r) return node;
    }
    return null;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.tweens.clear();
    this.resolved.clear();
  }
}
