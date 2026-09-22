import { hierarchy, pack } from 'd3-hierarchy';
import { ratioFor, type ColorMetric, type CoverageRow, type MetricTotals } from './types';

export interface TreeNode extends MetricTotals {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
}

export interface PackedNode extends MetricTotals {
  key: string;
  name: string;
  depth: number;
  x: number;
  y: number;
  r: number;
  value: number;
  ratio: number | null;
  isFile: boolean;
  parentKey: string | null;
}

function emptyTotals(): MetricTotals {
  return { lf: 0, lh: 0, brf: 0, brh: 0, fnf: 0, fnh: 0 };
}

export function buildTree(rows: CoverageRow[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: [], isFile: false, ...emptyTotals() };
  const index = new Map<string, TreeNode>([['', root]]);

  for (const row of [...rows].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = row.path.split('/').filter(Boolean);
    if (!parts.length) continue;
    let parent = root;
    let acc = '';
    for (let i = 0; i < parts.length; i += 1) {
      acc += `/${parts[i]}`;
      let node = index.get(acc);
      if (!node) {
        node = { name: parts[i], path: acc, children: [], isFile: false, ...emptyTotals() };
        index.set(acc, node);
        parent.children.push(node);
      }
      parent = node;
    }
    parent.isFile = true;
    parent.lf = row.lf;
    parent.lh = row.lh;
    parent.brf = row.brf;
    parent.brh = row.brh;
    parent.fnf = row.fnf;
    parent.fnh = row.fnh;
  }

  aggregate(root);
  return root;
}

function aggregate(node: TreeNode): MetricTotals {
  if (node.isFile && !node.children.length) return { ...node };
  const totals = emptyTotals();
  for (const child of node.children) {
    const t = aggregate(child);
    totals.lf += t.lf;
    totals.lh += t.lh;
    totals.brf += t.brf;
    totals.brh += t.brh;
    totals.fnf += t.fnf;
    totals.fnh += t.fnh;
  }
  Object.assign(node, totals);
  return totals;
}

function findNode(node: TreeNode, path: string): TreeNode | null {
  if (node.path === path) return node;
  for (const child of node.children) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return null;
}

export function nodeAt(root: TreeNode, path: string): TreeNode | null {
  if (!path) return root;
  return findNode(root, path);
}

export function layout(
  root: TreeNode,
  width: number,
  height: number,
  focusPath: string,
  metric: ColorMetric,
  padding = 2.5,
): PackedNode[] {
  const focus = focusPath ? findNode(root, focusPath) : root;
  if (!focus) return [];

  const d3root = hierarchy<TreeNode>(focus, (d) =>
    d.children && d.children.length ? d.children : undefined,
  )
    .sum((d) => (d.isFile && !d.children.length ? d.lf : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const packLayout = pack<TreeNode>().size([width, height]).padding(padding);
  const packed = packLayout(d3root);

  const nodes: PackedNode[] = [];

  packed.each((node) => {
    if (node.depth === 0) return;
    const data = node.data;
    const parent = node.parent;
    const parentKey = parent?.data.path && parent.depth > 0 ? parent.data.path : null;
    nodes.push({
      key: data.path,
      name: data.name,
      depth: node.depth,
      x: node.x,
      y: node.y,
      r: node.r,
      value: node.value ?? 0,
      ratio: ratioFor(data, metric),
      isFile: data.isFile && !data.children.length,
      parentKey,
      lf: data.lf,
      lh: data.lh,
      brf: data.brf,
      brh: data.brh,
      fnf: data.fnf,
      fnh: data.fnh,
    });
  });

  // Depth-1 nodes are children of the focus root; anchor them to the canvas centre.
  for (const node of nodes) {
    if (node.depth === 1) {
      node.parentKey = focus.path || null;
    }
  }
  return nodes;
}
