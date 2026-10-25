'use client';
// d3-force network (zoom, pan, drag, hover and selection highlight). Used for the Stage A domain network and for graphify cluster previews.
import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export interface FGNode {
  id: string;
  label: string;
  r: number;
  color: string;
  group?: number | string;
}
export interface FGLink {
  source: string;
  target: string;
  w: number;
  dashed?: boolean;
}
interface SimNode extends d3.SimulationNodeDatum, FGNode {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  w: number;
  dashed?: boolean;
  key: string;
}

export const linkKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

export function ForceGraph({
  nodes,
  links,
  selectedId,
  selectedLink,
  onSelectNode,
  onSelectLink,
  labelAll,
  height = 520,
  charge = -140,
}: {
  nodes: FGNode[];
  links: FGLink[];
  selectedId?: string | null;
  selectedLink?: string | null;
  onSelectNode?: (id: string | null) => void;
  onSelectLink?: (a: string, b: string) => void;
  /** Label every node (default: only the bigger ones and the selection). */
  labelAll?: boolean;
  height?: number;
  charge?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const cb = useRef({ onSelectNode, onSelectLink });
  cb.current = { onSelectNode, onSelectLink };

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.round(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // build / rebuild the layout when the data or size changes
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width < 50 || !nodes.length) return;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
    const ids = new Set(simNodes.map((n) => n.id));
    const simLinks: SimLink[] = links
      .filter((l) => ids.has(l.source) && ids.has(l.target) && l.source !== l.target)
      .map((l) => ({ source: l.source, target: l.target, w: l.w, dashed: l.dashed, key: linkKey(l.source, l.target) }));
    const maxW = Math.max(1, ...simLinks.map((l) => l.w));

    const sim = d3
      .forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance((l) => 70 + 90 * (1 - l.w / maxW)).strength((l) => 0.15 + 0.5 * (l.w / maxW)))
      .force('charge', d3.forceManyBody<SimNode>().strength((d) => charge - d.r * 4))
      .force('collide', d3.forceCollide<SimNode>().radius((d) => d.r + 4))
      .force('x', d3.forceX(width / 2).strength(0.09))
      .force('y', d3.forceY(height / 2).strength(0.12))
      .stop();
    for (let i = 0; i < 320; i++) sim.tick();

    const root = svg.append('g');
    const linkLayer = root.append('g');
    const hitLayer = root.append('g');
    const nodeLayer = root.append('g');

    const linkSel = linkLayer
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', 'var(--text-muted)')
      .attr('stroke-opacity', 0.45)
      .attr('stroke-width', (d) => 0.8 + (d.w / maxW) * 4)
      .attr('stroke-dasharray', (d) => (d.dashed ? '4 3' : null));
    const hitSel = hitLayer
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 10)
      .style('cursor', 'pointer')
      .on('click', (ev, d) => {
        ev.stopPropagation();
        const s = d.source as SimNode;
        const t = d.target as SimNode;
        cb.current.onSelectLink?.(s.id, t.id);
      });
    hitSel.append('title').text((d) => `${(d.source as SimNode).label} + ${(d.target as SimNode).label}: ${d.w}`);

    const nodeSel = nodeLayer
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes, (d) => d.id)
      .join('g')
      .attr('data-id', (d) => d.id)
      .style('cursor', 'pointer')
      .on('click', (ev, d) => {
        ev.stopPropagation();
        cb.current.onSelectNode?.(d.id);
      });
    nodeSel.append('circle').attr('r', (d) => d.r).attr('fill', (d) => d.color).attr('fill-opacity', 0.82).attr('stroke', 'var(--bg-obsidian)').attr('stroke-width', 1.5);
    nodeSel
      .append('text')
      .attr('class', 'fg-label')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => d.r + 11)
      .attr('font-size', 10)
      .attr('font-family', 'var(--font-mono)')
      .attr('fill', 'var(--text-paper)')
      .attr('paint-order', 'stroke')
      .attr('stroke', 'var(--bg-obsidian)')
      .attr('stroke-width', 3)
      .attr('pointer-events', 'none')
      .text((d) => (d.label.length > 28 ? `${d.label.slice(0, 26)}..` : d.label));
    nodeSel.append('title').text((d) => d.label);

    const place = () => {
      linkSel.attr('x1', (d) => (d.source as SimNode).x!).attr('y1', (d) => (d.source as SimNode).y!).attr('x2', (d) => (d.target as SimNode).x!).attr('y2', (d) => (d.target as SimNode).y!);
      hitSel.attr('x1', (d) => (d.source as SimNode).x!).attr('y1', (d) => (d.source as SimNode).y!).attr('x2', (d) => (d.target as SimNode).x!).attr('y2', (d) => (d.target as SimNode).y!);
      nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);
    };
    place();

    sim.on('tick', place);
    nodeSel.call(
      d3
        .drag<SVGGElement, SimNode>()
        .on('start', (ev, d) => {
          if (!ev.active) sim.alphaTarget(0.25).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (ev, d) => {
          d.fx = ev.x;
          d.fy = ev.y;
        })
        .on('end', (ev, d) => {
          if (!ev.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

    // fit the settled layout into view
    const xs = simNodes.map((n) => n.x!);
    const ys = simNodes.map((n) => n.y!);
    const [x0, x1, y0, y1] = [Math.min(...xs) - 60, Math.max(...xs) + 60, Math.min(...ys) - 40, Math.max(...ys) + 50];
    const k = Math.min(1.4, Math.min(width / (x1 - x0), height / (y1 - y0)));
    const initial = d3.zoomIdentity.translate((width - (x1 + x0) * k) / 2, (height - (y1 + y0) * k) / 2).scale(k);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on('zoom', (ev) => root.attr('transform', ev.transform.toString()));
    svg.call(zoom).call(zoom.transform, initial).on('dblclick.zoom', null);
    svg.on('click', () => cb.current.onSelectNode?.(null));

    return () => {
      sim.stop();
      svg.on('.zoom', null).on('click', null);
      svg.selectAll('*').remove();
    };
  }, [nodes, links, width, height, charge]);

  // selection highlight (cheap: no relayout)
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    const adj = new Set<string>();
    if (selectedId) {
      adj.add(selectedId);
      for (const l of links) {
        if (l.source === selectedId) adj.add(l.target);
        if (l.target === selectedId) adj.add(l.source);
      }
    }
    const [la, lb] = selectedLink ? selectedLink.split('\u0000') : [null, null];
    const focus = !!selectedId || !!selectedLink;
    svg.selectAll<SVGGElement, SimNode>('g[data-id]').each(function (d) {
      const on = !focus || adj.has(d.id) || d.id === la || d.id === lb;
      const g = d3.select(this);
      g.select('circle').attr('fill-opacity', on ? 0.9 : 0.15).attr('stroke', d.id === selectedId ? 'var(--accent-orange)' : 'var(--bg-obsidian)').attr('stroke-width', d.id === selectedId ? 3 : 1.5);
      g.select('text').attr('opacity', on && (labelAll || focus || d.r >= 9) ? 1 : 0);
    });
    svg
      .selectAll<SVGLineElement, SimLink>('g > g:first-child > line')
      .attr('stroke', (d) => {
        const s = (d.source as SimNode).id;
        const t = (d.target as SimNode).id;
        return d.key === selectedLink || s === selectedId || t === selectedId ? 'var(--accent-orange)' : 'var(--text-muted)';
      })
      .attr('stroke-opacity', (d) => {
        const s = (d.source as SimNode).id;
        const t = (d.target as SimNode).id;
        if (!focus) return 0.45;
        return d.key === selectedLink || s === selectedId || t === selectedId ? 0.95 : 0.06;
      });
  }, [selectedId, selectedLink, links, nodes, width, labelAll]);

  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-lg border border-subtle bg-panel" style={{ height }}>
      <svg ref={svgRef} width={width} height={height} className="block select-none" role="img" aria-label="Network graph" />
      <span className="pointer-events-none absolute bottom-2 right-3 font-mono text-[9px] uppercase tracking-[0.08em] text-muted">scroll to zoom · drag to move · click a node or line</span>
    </div>
  );
}
