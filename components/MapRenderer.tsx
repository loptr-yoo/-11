import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';
import { ElementType, LayoutElement } from '../types';
import { useStore } from '../store';

export interface MapRendererHandle {
  downloadJpg: () => void;
}

const MapRenderer = forwardRef<MapRendererHandle>((props, ref) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const { layout, violations, activeScene } = useStore();

  useImperativeHandle(ref, () => ({
    downloadJpg: () => {
      if (!svgRef.current || !layout) return;
      const svgNode = svgRef.current;
      const zoomGroup = d3.select(svgNode).select("g.main-group");
      const prevTransform = zoomGroup.attr("transform");
      zoomGroup.attr("transform", null); 
      svgNode.setAttribute("width", layout.width.toString());
      svgNode.setAttribute("height", layout.height.toString());
      svgNode.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);

      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(svgNode);
      if (!svgString.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      
      if (prevTransform) zoomGroup.attr("transform", prevTransform);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = layout.width;
        canvas.height = layout.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = false; 
          ctx.fillStyle = "#0f172a"; 
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const jpgUrl = canvas.toDataURL("image/jpeg", 0.98);
          const link = document.createElement("a");
          link.download = `map_${activeScene.id}_${Date.now()}.jpg`;
          link.href = jpgUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      };
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgString)));
    }
  }));

  useEffect(() => {
    if (!layout || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); 

    const { width, height, elements } = layout;
    svg.attr("viewBox", `0 0 ${width} ${height}`)
       .attr("width", "100%")
       .attr("height", "100%")
       .style("shape-rendering", "crispEdges"); 
    
    const mainGroup = svg.append("g").attr("class", "main-group");
    
    // Get Z-Order from scene or fallback to simple default
    const zOrder = activeScene.zOrder || [];
    const sortedElements = [...elements].sort((a, b) => {
      const idxA = zOrder.indexOf(a.type);
      const idxB = zOrder.indexOf(b.type);
      // Elements not in zOrder come last
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });

    mainGroup.selectAll("g.element")
      .data(sortedElements)
      .enter()
      .append("g")
      .attr("class", "element")
      .attr("transform", d => `translate(${d.x}, ${d.y})`)
      .each(function(this: any, d) {
        const g = d3.select(this);
        // Fallback to neutral gray instead of magenta if style is missing
        const style = activeScene.styles[d.type] || { fill: '#64748b', opacity: 0.5 };
        
        // Check for Custom Drawer
        const customDrawer = activeScene.customDrawers?.[d.type];
        
        if (customDrawer) {
            customDrawer(g, d, style, { layout, violations });
        } else {
            // Default Rect Render
            const w = d.width, h = d.height;
            const cx = w / 2, cy = h / 2;
            const rect = g.append("rect")
              .attr("width", w).attr("height", h)
              .attr("fill", style.fill)
              .attr("opacity", style.opacity)
              .attr("rx", style.rx || 0)
              .attr("transform", d.rotation ? `rotate(${d.rotation}, ${cx}, ${cy})` : null);
            
            if (style.stroke) {
               rect.attr("stroke", style.stroke).attr("stroke-width", style.strokeWidth || 1);
            }
        }

        if (violations.some(v => v.elementId === d.id)) {
            g.append("rect").attr("width", d.width).attr("height", d.height).attr("fill", "none").attr("stroke", "#ef4444").attr("stroke-width", 2).style("stroke-dasharray", "4,2");
        }
      });

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 15])
      .on("zoom", (event) => mainGroup.attr("transform", event.transform));
    svg.call(zoom);

    if (svgRef.current?.parentElement) {
        const { clientWidth: pw, clientHeight: ph } = svgRef.current.parentElement;
        const scale = Math.min(pw / width, ph / height) * 0.9;
        svg.call(zoom.transform, d3.zoomIdentity.translate((pw - width * scale) / 2, (ph - height * scale) / 2).scale(scale));
    }
  }, [layout, violations, activeScene]);

  return (
    <div className="w-full h-full bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shadow-inner relative">
       <svg ref={svgRef} className="block cursor-grab active:cursor-grabbing w-full h-full" />
    </div>
  );
});

export default MapRenderer;