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

// ---- Layout: posiciona nós via data-x/data-y
function placeNodes(){
  const els = canvas.querySelectorAll("[data-x][data-y]");
  els.forEach(el=>{
    const x = Number(el.dataset.x || 0);
    const y = Number(el.dataset.y || 0);
    el.style.left = x + "px";
    el.style.top  = y + "px";
  });
}

// ---- Conectores (linhas automáticas)
const edges = [
  // sequência principal
  { from:"n_inicio", to:"n_saida",  a:"b", b:"t", cls:"" },
  { from:"n_saida",  to:"n_triagem",a:"b", b:"t", cls:"" },
  { from:"n_triagem",to:"n_rec",    a:"b", b:"t", cls:"" },

  // recuperável SIM
  { from:"n_rec", to:"n_recuperar", a:"l", b:"t", cls:"ok", label:"SIM" },
  { from:"n_recuperar", to:"n_devolver", a:"b", b:"t", cls:"ok" },
  { from:"n_devolver",  to:"n_fim1",     a:"b", b:"t", cls:"ok" },

  // recuperável NÃO
  { from:"n_rec", to:"n_lanc", a:"r", b:"t", cls:"", label:"NÃO" },
  { from:"n_lanc", to:"n_troca", a:"b", b:"t", cls:"" },

  // tem troca NÃO
  { from:"n_troca", to:"n_cc_lixo", a:"b", b:"t", cls:"bad", label:"NÃO" },
  { from:"n_cc_lixo", to:"n_descartar", a:"b", b:"t", cls:"bad" },
  { from:"n_descartar", to:"n_fim2", a:"b", b:"t", cls:"bad" },

  // tem troca SIM
  { from:"n_troca", to:"n_tipo", a:"r", b:"l", cls:"warn", label:"SIM" },

  // tipo vencido/avariado
  { from:"n_tipo", to:"n_cc_venc", a:"b", b:"t", cls:"warn", label:"VENCIDO" },
  { from:"n_tipo", to:"n_cc_ava",  a:"r", b:"t", cls:"warn", label:"AVARIADO" },

  { from:"n_cc_venc", to:"n_dir", a:"b", b:"t", cls:"warn" },
  { from:"n_cc_ava",  to:"n_dir", a:"b", b:"t", cls:"warn" },
  { from:"n_dir", to:"n_fim3", a:"b", b:"t", cls:"warn" },
];

function rectOf(el){
  const r = el.getBoundingClientRect();
  const base = canvas.getBoundingClientRect(); // relativo ao canvas
  return {
    x: r.left - base.left,
    y: r.top  - base.top,
    w: r.width,
    h: r.height
  };
}

// anchors: t,b,l,r
function anchor(rect, side){
  const cx = rect.x + rect.w/2;
  const cy = rect.y + rect.h/2;
  if(side === "t") return {x: cx, y: rect.y};
  if(side === "b") return {x: cx, y: rect.y + rect.h};
  if(side === "l") return {x: rect.x, y: cy};
  if(side === "r") return {x: rect.x + rect.w, y: cy};
  return {x: cx, y: cy};
}

// curva suave (cubic bezier)
function bezierPath(p1, p2){
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  const pull = Math.max(60, Math.min(220, (dx + dy) * 0.25));

  const c1 = { x: p1.x, y: p1.y };
  const c2 = { x: p2.x, y: p2.y };

  // empurra controle na direção mais provável
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

  // marker arrow
  const defs = svgEl("defs");
  const marker = svgEl("marker", {
    id:"arrow",
    viewBox:"0 0 10 10",
    refX:"9",
    refY:"5",
    markerWidth:"7",
    markerHeight:"7",
    orient:"auto-start-reverse"
  });
  marker.appendChild(svgEl("path", { d:"M 0 0 L 10 5 L 0 10 z", fill:"#6aa8ff" }));
  defs.appendChild(marker);

  // markers coloridos (ok/warn/bad)
  const mk2 = (id, color)=>{
    const m = svgEl("marker", { id, viewBox:"0 0 10 10", refX:"9", refY:"5", markerWidth:"7", markerHeight:"7", orient:"auto-start-reverse" });
    m.appendChild(svgEl("path", { d:"M 0 0 L 10 5 L 0 10 z", fill:color }));
    return m;
  };
  defs.appendChild(mk2("arrowOk",   "#2dd4bf"));
  defs.appendChild(mk2("arrowWarn", "#ffb703"));
  defs.appendChild(mk2("arrowBad",  "#ff5d8f"));
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

    // seta por tipo
    if(e.cls === "ok")   path.setAttribute("marker-end","url(#arrowOk)");
    else if(e.cls==="warn") path.setAttribute("marker-end","url(#arrowWarn)");
    else if(e.cls==="bad")  path.setAttribute("marker-end","url(#arrowBad)");
    else path.setAttribute("marker-end","url(#arrow)");

    wires.appendChild(path);

    // label no meio do caminho
    if(e.label){
      const mid = { x: (p1.x+p2.x)/2, y:(p1.y+p2.y)/2 };
      const t = svgEl("text", { x: mid.x + 6, y: mid.y - 6 });
      t.textContent = e.label;
      wires.appendChild(t);
    }
  });
}

// ---- Pan / Zoom
let scale = 1;
let tx = 0;
let ty = 0;

function applyTransform(){
  viewport.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function fitToScreen(padding=40){
  const stageRect = stage.getBoundingClientRect();

  // bounds do conteúdo (canvas)
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;

  const sx = (stageRect.width  - padding*2) / W;
  const sy = (stageRect.height - padding*2) / H;
  scale = clamp(Math.min(sx, sy), 0.2, 2.5);

  // centraliza
  tx = (stageRect.width  - W*scale) / 2;
  ty = (stageRect.height - H*scale) / 2;

  applyTransform();
}

let isDown = false;
let lastX = 0, lastY = 0;

stage.addEventListener("pointerdown", (ev)=>{
  isDown = true;
  lastX = ev.clientX;
  lastY = ev.clientY;
  stage.setPointerCapture(ev.pointerId);
});

stage.addEventListener("pointermove", (ev)=>{
  if(!isDown) return;
  const dx = ev.clientX - lastX;
  const dy = ev.clientY - lastY;
  lastX = ev.clientX;
  lastY = ev.clientY;
  tx += dx;
  ty += dy;
  applyTransform();
});

stage.addEventListener("pointerup", ()=>{
  isDown = false;
});

stage.addEventListener("wheel", (ev)=>{
  ev.preventDefault();

  const stageRect = stage.getBoundingClientRect();
  const mx = ev.clientX - stageRect.left;
  const my = ev.clientY - stageRect.top;

  const delta = ev.deltaY > 0 ? 0.92 : 1.08;
  const newScale = clamp(scale * delta, 0.2, 3);

  // zoom no ponto do mouse
  tx = mx - (mx - tx) * (newScale / scale);
  ty = my - (my - ty) * (newScale / scale);
  scale = newScale;

  applyTransform();
}, { passive:false });

stage.addEventListener("dblclick", ()=> fitToScreen());

// ---- Botões
btnFit.addEventListener("click", ()=> fitToScreen());
btnReset.addEventListener("click", ()=>{
  scale = 1; tx = 0; ty = 0;
  applyTransform();
});
btnZoomIn.addEventListener("click", ()=>{
  scale = clamp(scale*1.12, 0.2, 3);
  applyTransform();
});
btnZoomOut.addEventListener("click", ()=>{
  scale = clamp(scale/1.12, 0.2, 3);
  applyTransform();
});

btnPrint.addEventListener("click", ()=> window.print());

// Export PNG (usa foreignObject via SVG snapshot simples)
btnExport.addEventListener("click", async ()=>{
  // Faz um screenshot do stage via canvas (sem libs)
  // Estratégia: clonar stage -> usar SVG+foreignObject
  try{
    const exportW = 1600;
    const exportH = 1100;

    const clone = stage.cloneNode(true);
    clone.style.width = exportW + "px";
    clone.style.height = exportH + "px";
    clone.style.overflow = "hidden";
    clone.querySelector("#viewport").style.transform = `translate(0px,0px) scale(1)`;

    // desenhar fios novamente na escala 1
    // (usa o DOM real: então vamos só "fit" no real e depois exportar usando canvas do próprio stage)
    // Solução prática: usa o navegador via print-to-pdf/print.
    // Aqui exporta a área visível atual do stage como PNG (o que você está vendo).
    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    const stageRect = stage.getBoundingClientRect();

    svg.setAttribute("xmlns","http://www.w3.org/2000/svg");
    svg.setAttribute("width", stageRect.width);
    svg.setAttribute("height", stageRect.height);

    const fo = document.createElementNS("http://www.w3.org/2000/svg","foreignObject");
    fo.setAttribute("x","0");
    fo.setAttribute("y","0");
    fo.setAttribute("width","100%");
    fo.setAttribute("height","100%");

    // wrapper HTML
    const wrap = document.createElement("div");
    wrap.setAttribute("xmlns","http://www.w3.org/1999/xhtml");
    wrap.style.width = stageRect.width + "px";
    wrap.style.height = stageRect.height + "px";
    wrap.appendChild(stage.cloneNode(true));

    fo.appendChild(wrap);
    svg.appendChild(fo);

    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], {type:"image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = ()=>{
      const c = document.createElement("canvas");
      c.width = Math.round(stageRect.width);
      c.height = Math.round(stageRect.height);
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);

      URL.revokeObjectURL(url);

      const a = document.createElement("a");
      a.download = "fluxograma-triagem-martree.png";
      a.href = c.toDataURL("image/png");
      a.click();
    };
    img.src = url;
  }catch(err){
    alert("Não consegui exportar PNG nesse navegador. Use o botão Imprimir e 'Salvar como PDF'.");
    console.error(err);
  }
});

// ---- Inicialização
function init(){
  placeNodes();
  // aguarda layout
  requestAnimationFrame(()=>{
    drawWires();
    fitToScreen(36);
  });
}

// redesenha linhas em resize
let tResize = null;
window.addEventListener("resize", ()=>{
  clearTimeout(tResize);
  tResize = setTimeout(()=>{
    drawWires();
    fitToScreen(36);
  }, 120);
});

init();
