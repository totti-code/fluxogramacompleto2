/* Fluxograma Martree — HTML nodes + SVG wires + Pan/Zoom */

const stage = document.getElementById("stage");
const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvas");
const wires = document.getElementById("wires");

const btnFit = document.getElementById("btnFit");
const btnReset = document.getElementById("btnReset");
const btnZoomIn = document.getElementById("btnZoomIn");
const btnZoomOut = document.getElementById("btnZoomOut");
const btnExport = document.getElementById("btnExport");
const btnPrint = document.getElementById("btnPrint");

function qs(id){ return document.getElementById(id); }

function placeNodes(){
  const els = canvas.querySelectorAll("[data-x][data-y]");
  els.forEach(el=>{
    const x = Number(el.dataset.x || 0);
    const y = Number(el.dataset.y || 0);
    el.style.left = x + "px";
    el.style.top  = y + "px";
  });
}

const edges = [
  { from:"n_inicio", to:"n_saida",   a:"b", b:"t" },
  { from:"n_saida",  to:"n_triagem", a:"b", b:"t" },
  { from:"n_triagem",to:"n_rec",     a:"b", b:"t" },

  { from:"n_rec", to:"n_recuperar",  a:"l", b:"t", cls:"ok",   label:"SIM" },
  { from:"n_recuperar", to:"n_devolver", a:"b", b:"t", cls:"ok" },
  { from:"n_devolver",  to:"n_fim1",     a:"b", b:"t", cls:"ok" },

  { from:"n_rec", to:"n_lanc", a:"r", b:"t", label:"NÃO" },
  { from:"n_lanc", to:"n_troca", a:"b", b:"t" },

  { from:"n_troca", to:"n_cc_lixo", a:"b", b:"t", cls:"bad", label:"NÃO" },
  { from:"n_cc_lixo", to:"n_descartar", a:"b", b:"t", cls:"bad" },
  { from:"n_descartar", to:"n_fim2", a:"b", b:"t", cls:"bad" },

  { from:"n_troca", to:"n_tipo", a:"r", b:"l", cls:"warn", label:"SIM" },

  { from:"n_tipo", to:"n_cc_venc", a:"b", b:"t", cls:"warn", label:"VENCIDO" },
  { from:"n_tipo", to:"n_cc_ava",  a:"r", b:"t", cls:"warn", label:"AVARIADO" },

  { from:"n_cc_venc", to:"n_dir", a:"b", b:"t", cls:"warn" },
  { from:"n_cc_ava",  to:"n_dir", a:"b", b:"t", cls:"warn" },
  { from:"n_dir", to:"n_fim3", a:"b", b:"t", cls:"warn" },
];

function rectOf(el){
  const r = el.getBoundingClientRect();
  const base = canvas.getBoundingClientRect();
  return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
}

function anchor(rect, side){
  const cx = rect.x + rect.w/2;
  const cy = rect.y + rect.h/2;
  if(side === "t") return {x: cx, y: rect.y};
  if(side === "b") return {x: cx, y: rect.y + rect.h};
  if(side === "l") return {x: rect.x, y: cy};
  if(side === "r") return {x: rect.x + rect.w, y: cy};
  return {x: cx, y: cy};
}

function bezierPath(p1, p2){
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  const pull = Math.max(60, Math.min(220, (dx + dy) * 0.25));

  const c1 = { x: p1.x, y: p1.y };
  const c2 = { x: p2.x, y: p2.y };

  if(dx >= dy){
    c1.x += (p2.x > p1.x ? pull : -pull);
    c2.x += (p2.x > p1.x ? -pull : pull);
  }else{
    c1.y += (p2.y > p1.y ? pull : -pull);
    c2.y += (p2.y > p1.y ? -pull : pull);
  }
  return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
}

function clearSVG(){
  while(wires.firstChild) wires.removeChild(wires.firstChild);
}

function svgEl(name, attrs={}){
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k, String(v)));
  return el;
}

function drawWires(){
  clearSVG();

  const defs = svgEl("defs");
  const mk = (id, color)=>{
    const m = svgEl("marker", { id, viewBox:"0 0 10 10", refX:"9", refY:"5", markerWidth:"7", markerHeight:"7", orient:"auto-start-reverse" });
    m.appendChild(svgEl("path", { d:"M 0 0 L 10 5 L 0 10 z", fill: color }));
    return m;
  };
  defs.appendChild(mk("arrow", "#6aa8ff"));
  defs.appendChild(mk("arrowOk", "#2dd4bf"));
  defs.appendChild(mk("arrowWarn", "#ffb703"));
  defs.appendChild(mk("arrowBad", "#ff5d8f"));
  wires.appendChild(defs);

  edges.forEach(e=>{
    const A = qs(e.from), B = qs(e.to);
    if(!A || !B) return;

    const ra = rectOf(A);
    const rb = rectOf(B);
    const p1 = anchor(ra, e.a || "b");
    const p2 = anchor(rb, e.b || "t");

    const path = svgEl("path", { d: bezierPath(p1, p2) });
    if(e.cls) path.classList.add(e.cls);

    if(e.cls === "ok") path.setAttribute("marker-end","url(#arrowOk)");
    else if(e.cls === "warn") path.setAttribute("marker-end","url(#arrowWarn)");
    else if(e.cls === "bad") path.setAttribute("marker-end","url(#arrowBad)");
    else path.setAttribute("marker-end","url(#arrow)");

    wires.appendChild(path);

    // ✅ rótulo APENAS aqui (uma vez)
    if(e.label){
      const mid = { x: (p1.x+p2.x)/2, y:(p1.y+p2.y)/2 };
      const t = svgEl("text", { x: mid.x + 8, y: mid.y - 8 });
      t.textContent = e.label;
      wires.appendChild(t);
    }
  });
}

/* Pan/Zoom */
let scale = 1, tx = 0, ty = 0;
function applyTransform(){ viewport.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; }
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function fitToScreen(padding=40){
  const stageRect = stage.getBoundingClientRect();
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  const sx = (stageRect.width  - padding*2) / W;
  const sy = (stageRect.height - padding*2) / H;
  scale = clamp(Math.min(sx, sy), 0.2, 2.5);
  tx = (stageRect.width  - W*scale) / 2;
  ty = (stageRect.height - H*scale) / 2;
  applyTransform();
}

let isDown=false, lastX=0, lastY=0;
stage.addEventListener("pointerdown",(ev)=>{
  isDown=true; lastX=ev.clientX; lastY=ev.clientY;
  stage.setPointerCapture(ev.pointerId);
});
stage.addEventListener("pointermove",(ev)=>{
  if(!isDown) return;
  const dx=ev.clientX-lastX, dy=ev.clientY-lastY;
  lastX=ev.clientX; lastY=ev.clientY;
  tx+=dx; ty+=dy; applyTransform();
});
stage.addEventListener("pointerup",()=>{ isDown=false; });

stage.addEventListener("wheel",(ev)=>{
  ev.preventDefault();
  const r = stage.getBoundingClientRect();
  const mx = ev.clientX - r.left;
  const my = ev.clientY - r.top;
  const delta = ev.deltaY > 0 ? 0.92 : 1.08;
  const newScale = clamp(scale * delta, 0.2, 3);
  tx = mx - (mx - tx) * (newScale / scale);
  ty = my - (my - ty) * (newScale / scale);
  scale = newScale;
  applyTransform();
},{passive:false});

stage.addEventListener("dblclick", ()=> fitToScreen(36));

btnFit.addEventListener("click", ()=> fitToScreen(36));
btnReset.addEventListener("click", ()=>{ scale=1; tx=0; ty=0; applyTransform(); });
btnZoomIn.addEventListener("click", ()=>{ scale=clamp(scale*1.12,0.2,3); applyTransform(); });
btnZoomOut.addEventListener("click", ()=>{ scale=clamp(scale/1.12,0.2,3); applyTransform(); });
btnPrint.addEventListener("click", ()=> window.print());

btnExport.addEventListener("click", ()=>{
  alert("Export PNG pode variar por navegador. Se falhar, use Imprimir → Salvar como PDF.");
});

/* init */
function init(){
  if(!stage || !canvas || !wires || !viewport){
    console.error("IDs não encontrados. Confira se index.html tem stage/viewport/canvas/wires.");
    return;
  }
  placeNodes();
  requestAnimationFrame(()=>{
    drawWires();
    fitToScreen(36);
  });
}

let tResize=null;
window.addEventListener("resize", ()=>{
  clearTimeout(tResize);
  tResize=setTimeout(()=>{
    drawWires();
    fitToScreen(36);
  },120);
});

init();
