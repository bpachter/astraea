// Edge routing, ported closely from the handoff reference implementation:
// orientation by vertical-center delta, anchor bucketing so parallel edges
// never stack, cubic Béziers with the reference control-point math.

import type { GraphEdge, NodeRect } from "./types";

export interface RoutedEdge {
  index: number;
  from: string;
  to: string;
  verb: string;
  family: string;
  d: string;
  labelX: number;
  labelY: number;
}

interface WorkingEdge {
  index: number;
  edge: GraphEdge;
  orientation: "side" | "down" | "up";
  a: NodeRect;
  b: NodeRect;
  fx?: number;
  fy?: number;
  tx?: number;
  ty?: number;
}

export function routeEdges(
  edges: GraphEdge[],
  geometry: Record<string, NodeRect>,
): RoutedEdge[] {
  const info: WorkingEdge[] = [];
  edges.forEach((edge, index) => {
    const a = geometry[edge.from];
    const b = geometry[edge.to];
    if (!a || !b) return;
    const acy = a.y + a.h / 2;
    const bcy = b.y + b.h / 2;
    const orientation = Math.abs(acy - bcy) < 30 ? "side" : acy < bcy ? "down" : "up";
    info.push({ index, edge, orientation, a, b });
  });

  // Bucket anchor points by (node, side); spread each bucket across the node
  // edge, ordered by the other endpoint's center x, so parallel edges fan out.
  const slots: Record<string, Array<{ item: WorkingEdge; end: "f" | "t"; otherX: number }>> = {};
  const put = (key: string, record: { item: WorkingEdge; end: "f" | "t"; otherX: number }) => {
    (slots[key] = slots[key] ?? []).push(record);
  };
  info.forEach((item) => {
    const fromSide = item.orientation === "up" ? "t" : "b";
    const toSide = item.orientation === "down" ? "t" : "b";
    put(`${item.edge.from}:${fromSide}`, { item, end: "f", otherX: item.b.x + item.b.w / 2 });
    put(`${item.edge.to}:${toSide}`, { item, end: "t", otherX: item.a.x + item.a.w / 2 });
  });
  Object.entries(slots).forEach(([key, bucket]) => {
    bucket.sort((p, q) => p.otherX - q.otherX);
    const nodeId = key.slice(0, -2);
    const side = key.slice(-1);
    const rect = geometry[nodeId];
    bucket.forEach((record, j) => {
      const x = rect.x + (rect.w * (j + 1)) / (bucket.length + 1);
      const y = side === "t" ? rect.y : rect.y + rect.h;
      if (record.end === "f") {
        record.item.fx = x;
        record.item.fy = y;
      } else {
        record.item.tx = x;
        record.item.ty = y;
      }
    });
  });

  return info.map((item) => {
    const { fx = 0, fy = 0, tx = 0, ty = 0 } = item;
    let d: string;
    let labelX: number;
    let labelY: number;
    if (item.orientation === "side") {
      // Same-lane edges bow downward.
      const dep = 30 + Math.abs(tx - fx) / 9;
      d = `M ${fx} ${fy} C ${fx} ${fy + dep}, ${tx} ${ty + dep}, ${tx} ${ty}`;
      labelX = (fx + tx) / 2;
      labelY = fy + dep * 0.8;
    } else {
      const dy = ty - fy;
      const k = Math.max(24, Math.min(90, Math.abs(dy) * 0.42)) * (dy > 0 ? 1 : -1);
      d = `M ${fx} ${fy} C ${fx} ${fy + k}, ${tx} ${ty - k}, ${tx} ${ty}`;
      labelX = (fx + tx) / 2;
      labelY = (fy + ty) / 2;
    }
    return {
      index: item.index,
      from: item.edge.from,
      to: item.edge.to,
      verb: item.edge.verb,
      family: item.edge.family,
      d,
      labelX,
      labelY,
    };
  });
}
