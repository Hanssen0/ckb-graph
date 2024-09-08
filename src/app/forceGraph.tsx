import { ccc } from "@ckb-ccc/core";
import * as d3 from "d3";
import { useCallback, useEffect, useState } from "react";

export interface Node {
  id: string;
  balance: ccc.Num;
  type: string;
  loaded: number;
  hasMore?: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

export interface Edge {
  sourceId: string;
  targetId: string;
  source: string;
  target: string;
  value: ccc.Num;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drag(simulation: d3.Simulation<any, any>): any {
  function dragstarted(event) {
    if (!event.active) simulation.restart();
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragended(event) {
    // if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  return d3
    .drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
}

function format(val: ccc.Num) {
  return (val / ccc.fixedPointFrom("1"))
    .toString()
    .split("")
    .reverse()
    .map((c, i) => (i % 3 === 2 ? `,${c}` : c))
    .reverse()
    .join("")
    .replace(/^,/, "");
}

function logSize(val: ccc.Num, min: number = -1) {
  return Math.max(min, Math.log10(Number(val / ccc.One)));
}

export function ForceGraph({
  nodes,
  edges,
  distance,
  onAddInputs,
  onOpen,
}: {
  nodes: Node[];
  edges: Edge[];
  distance: number;
  onAddInputs: (node: Node) => void;
  onOpen: (node: Node) => void;
}) {
  const [svgRef, setSvgRef] = useState<SVGSVGElement | null>(null);
  const [ref, setRef] = useState<SVGGElement | null>(null);

  const [simulation, setSimulation] = useState(() => {
    return d3.forceSimulation(nodes).restart();
  });

  const resetView = useCallback(() => {
    if (!ref || !svgRef) {
      return;
    }

    const svg = d3.select(svgRef);

    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    });

    svg.attr(
      "viewBox",
      `${minX - 100} ${minY - 100} ${maxX - minX + 200} ${maxY - minY + 200}`
    );

    svg.call(
      d3
        .zoom()
        .extent([
          [minX - 100, minY - 100],
          [maxX - minX + 200, maxY - minY + 200],
        ])
        .on("zoom", (event) => {
          if (event.transform.k < 0.5) {
            event.transform.k = 0.5;
          }

          d3.select(ref).attr("transform", event.transform);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any
    );
  }, [nodes, svgRef, ref]);

  useEffect(() => {
    const interval = setInterval(resetView, 2000);
    return () => clearInterval(interval);
  }, [resetView]);

  useEffect(() => {
    setSimulation((simulation) =>
      simulation
        .nodes(nodes)
        .force(
          "link",
          d3
            .forceLink(edges)
            .id(({ index }, i, nodes) => (nodes[index ?? 0] as Node).id)
            .distance(distance)
            .strength(3)
        )
        .force("charge", d3.forceManyBody().strength(-6000))
        .force("center", d3.forceCenter())
        .alphaTarget(0.005)
        .restart()
    );
  }, [nodes, edges, distance]);

  useEffect(() => {
    if (!ref) {
      return;
    }

    const svg = d3.select(ref);

    const existedNodes = svg.selectAll("g.node").data(nodes);
    const existedEdges = svg.selectAll("g.edge").data(edges);

    const newNodes = existedNodes.join(
      (enter) => {
        const g = enter
          .append("g")
          .attr("class", "node")
          .call(drag(simulation));
        g.append("circle")
          .attr("r", (n) => n.size)
          .attr("fill", (n) => n.color)
          .on("click", (_, a) => onOpen(a));
        g.append("text")
          .attr("class", "addr")
          .on("click", (_, a) => onOpen(a))
          .text((n) => `${n.id.slice(0, 6)}..${n.id.slice(-4)}`);
        g.append("text")
          .attr("class", "balance")
          .on("click", (_, a) => onOpen(a))
          .text((n) => format(n.balance));
        g.append("text")
          .attr("class", "type")
          .on("click", (_, a) => onOpen(a))
          .text((n) => n.type);
        g.append("text")
          .attr("class", "more")
          .on("click", (_, a) => (a.hasMore ? onAddInputs(a) : undefined))
          .text((n) => `(${n.loaded}) ${n.hasMore ? "Load more" : "Loaded"}`);
        return g;
      },
      (update) => {
        update
          .selectChild("text.more")
          .on("click", (_, a) => (a.hasMore ? onAddInputs(a) : undefined))
          .text((n) => `(${n.loaded}) ${n.hasMore ? "Load more" : "Loaded"}`);
        return update;
      }
    );
    const newEdges = existedEdges.join(
      (enter) => {
        const g = enter.append("g").lower().attr("class", "edge");
        g.append("line");
        g.append("text").text((e) => format(e.value));
        return g;
      },
      (update) => {
        update
          .selectChild("line")
          .attr("stroke-width", (e) =>
            Math.pow(logSize(e.value, 0) * 0.3 + 1, 2)
          );
        update.selectChild("text").text((e) => format(e.value));
        return update;
      }
    );

    const allNodes = existedNodes.merge(newNodes);
    const allEdges = existedEdges.merge(newEdges);

    simulation.on("tick", () => {
      allEdges
        .selectChild("line")
        .attr("x1", (e) => (e.source as unknown as Node).x)
        .attr("y1", (e) => (e.source as unknown as Node).y)
        .attr("x2", (e) => (e.target as unknown as Node).x)
        .attr("y2", (e) => (e.target as unknown as Node).y);
      allEdges
        .selectChild("text")
        .attr(
          "x",
          (e) =>
            (e.source as unknown as Node).x * 0.3 +
            (e.target as unknown as Node).x * 0.7
        )
        .attr(
          "y",
          (e) =>
            (e.source as unknown as Node).y * 0.3 +
            (e.target as unknown as Node).y * 0.7
        );
      allNodes
        .selectChild("circle")
        .attr("cx", (n) => n.x)
        .attr("cy", (n) => n.y);
      allNodes
        .selectChild("text.addr")
        .attr("x", (n) => n.x)
        .attr("y", (n) => n.y + 18);
      allNodes
        .selectChild("text.balance")
        .attr("x", (n) => n.x)
        .attr("y", (n) => n.y);
      allNodes
        .selectChild("text.type")
        .attr("x", (n) => n.x)
        .attr("y", (n) => n.y - 18);
      allNodes
        .selectChild("text.more")
        .attr("x", (n) => n.x)
        .attr("y", (n) => n.y + n.size + 16);

      resetView();
    });
  }, [ref, nodes, edges, simulation, onAddInputs, resetView]);

  return (
    <svg className="w-full h-full" ref={setSvgRef}>
      <g ref={setRef}></g>
    </svg>
  );
}
