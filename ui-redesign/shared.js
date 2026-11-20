/* ============================================================================
   Zimmu UI Redesign — Shared assets
   - Icon set (inline SVG paths)
   - Isometric cabinet renderer (the "3D viewport" content)
   - View cube + compass
   ========================================================================== */

/* ---------------------------- ICONS --------------------------------------- */
const P = {
  chevron:'<path d="M9 6l6 6-6 6"/>', chevronD:'<path d="M6 9l6 6 6-6"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  layers:'<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  box:'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/>',
  cube:'<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12L3 7M12 12v10"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
  close:'<path d="M18 6L6 18M6 6l12 12"/>',
  undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo:'<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  eye:'<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:'<path d="M17.9 17.9A11 11 0 0 1 12 19c-7 0-11-7-11-7a18 18 0 0 1 5-5.9M9.9 4.2A10 10 0 0 1 12 4c7 0 11 7 11 7a18 18 0 0 1-2.2 3.2M1 1l22 22"/>',
  copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  trash:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  snap:'<path d="M3 8h7V3M21 16h-7v5"/><path d="M10 8h4v8h-4z"/>',
  cut:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8 8l12 12M20 8L8 20"/>',
  joint:'<path d="M4 4h7v16H4zM13 4h7v7h-7zM13 13h7v7h-7z"/><path d="M4 8h7M13 7.5h7"/>',
  drill:'<path d="M12 2v6M8 2h8"/><path d="M9 8h6v6l-3 8-3-8z"/>',
  dowel:'<path d="M4 10h16v4H4z"/><path d="M7 10v4M17 10v4"/>',
  measure:'<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 8v4M10 8v6M14 8v4M18 8v6"/>',
  plan:'<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 3v18"/>',
  grid:'<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/>',
  move:'<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3.1V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21v4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check:'<path d="M20 6L9 17l-5-5"/>',
  warn:'<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  bolt:'<path d="M13 2L3 14h8l-1 8 10-12h-8z"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  command:'<path d="M18 8a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V5a3 3 0 1 0-3 3z"/>',
  home:'<path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z"/>',
  arrowR:'<path d="M5 12h14M13 6l6 6-6 6"/>', arrowL:'<path d="M19 12H5M11 18l-6-6 6-6"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  panelL:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  panelR:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  maximize:'<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  roster:'<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 3v18"/>',
  ruler:'<path d="M3 8h18v8H3z"/><path d="M7 8v3M11 8v5M15 8v3M19 8v5"/>',
  layers3:'<path d="M12 2L2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5"/>',
};
function ic(name, cls=''){ return `<svg class="ic ${cls}" viewBox="0 0 24 24">${P[name]||''}</svg>`; }

/* ------------------------- ISOMETRIC CABINET SCENE ------------------------ */
/* Axonometric projection helpers. Units: 1u = 20mm-ish, scene drawn in px.   */
const ISO = { ox: 470, oy: 400, sx: 1, sy: 1 };
function proj(x,y,z){ return [ ISO.ox + (x - y)*18*ISO.sx, ISO.oy + (x + y)*9*ISO.sy - z*15 ]; }
function poly(pts, fill, stroke, extra=''){
  const p = pts.map(q=>q.join(',')).join(' ');
  return `<polygon points="${p}" fill="${fill}" stroke="${stroke||'none'}" stroke-width="1" ${extra}/>`;
}
/* A box from (x,y,z) with size (w,d,h). Returns top/front/right faces. */
function box(x,y,z,w,d,h,opt={}){
  const {top='#3a4049', front='#2a2f37', side='#22262d', edge='#4c535e', sel=false, selc}=opt;
  const A=proj(x,y,z+h), B=proj(x+w,y,z+h), C=proj(x+w,y+d,z+h), D=proj(x,y+d,z+h);
  const E=proj(x,y,z), F=proj(x+w,y,z), G=proj(x+w,y+d,z), H=proj(x,y+d,z);
  const se = sel ? ` stroke="${selc}" stroke-width="2"` : '';
  return poly([A,B,C,D],top,edge) +
         poly([D,C,G,H],front,edge) +
         poly([B,C,G,F],side,edge) +
         (sel ? poly([A,B,C,D],'none',selc,`stroke-width="2"`) : '');
}
/* drawer front detailing */
function drawerLines(x,y,z,w,d,h,rows){
  let s='';
  for(let i=1;i<rows;i++){
    const zz=z+h*i/rows;
    const a=proj(x,y+d+0.02,zz), b=proj(x+w,y+d+0.02,zz);
    s+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#565e69" stroke-width="1"/>`;
  }
  for(let i=0;i<rows;i++){
    const zz=z+h*(i+0.5)/rows;
    const p=proj(x+w/2-1.2,y+d+0.05,zz), q=proj(x+w/2+1.2,y+d+0.05,zz);
    s+=`<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="#7b8490" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return s;
}
/* The full kitchen scene used as the "loaded model" in every concept. */
function cabinetScene(opts={}){
  const sel = opts.selected!==false;
  const selc = opts.selColor || '#e08b3c';
  const wood = opts.wood || {top:'#4a4238',front:'#37312a',side:'#2b2620',edge:'#6a5d4b'};
  let s='';
  // floor grid
  s+=`<g opacity="0.5">`;
  for(let i=-4;i<=10;i++){ const a=proj(i,-4,0), b=proj(i,10,0); s+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#2b313a" stroke-width="0.8"/>`; }
  for(let j=-4;j<=10;j++){ const a=proj(-4,j,0), b=proj(10,j,0); s+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#2b313a" stroke-width="0.8"/>`; }
  s+=`</g>`;
  // Base run along X (back wall at y=0)
  s+=box(0,0,0, 4,3,5, {top:'#464d56',front:'#31363e',side:'#282d34',edge:'#59616c'});        // base cab 1
  s+=box(4,0,0, 3,3,5, {top:'#464d56',front:'#31363e',side:'#282d34',edge:'#59616c', sel, selc}); // base cab 2 (selected)
  s+=drawerLines(4,0,0,3,3,5,3);
  s+=box(7,0,0, 3,3,5, {top:'#464d56',front:'#31363e',side:'#282d34',edge:'#59616c'});         // base cab 3
  // countertop over base run
  s+=box(-0.2,-0.2,5, 10.4,3.4,0.45, {top:'#6b727b',front:'#4b5159',side:'#3d434a',edge:'#8a929b'});
  // sink cut + basin hint
  s+=box(1.1,0.6,5.45, 2,1.8,0.02,{top:'#20252b',front:'#20252b',side:'#20252b',edge:'#5a626c'});
  // wall cabinets
  s+=box(0,0,12, 3,2.4,5, {top:'#3b414a',front:'#2d323a',side:'#252a31',edge:'#545c66'});
  s+=box(3.2,0,12, 3.6,2.4,5,{top:'#3b414a',front:'#2d323a',side:'#252a31',edge:'#545c66'});
  // tall unit on the right
  s+=box(10,0,0, 3,3,17, {top:'#40464f',front:'#2e343c',side:'#272d34',edge:'#58606b'});
  s+=drawerLines(10,0,0,3,3,17,2);
  // a loose board part (the one being machined) floating, exploded view style
  if(opts.exploded) s+=box(13,4,7, 5,2.5,0.8, {...wood, edge:'#7d6b52'});
  // selection dimension callout
  if(sel){
    const a=proj(4,3.05,5.2), b=proj(7,3.05,5.2);
    s+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${selc}" stroke-width="1" stroke-dasharray="3 2"/>`;
    s+=`<rect x="${(a[0]+b[0])/2-24}" y="${a[1]-20}" width="48" height="16" rx="3" fill="${selc}"/>`;
    s+=`<text x="${(a[0]+b[0])/2}" y="${a[1]-9}" fill="#1a1206" font-size="10" font-family="JetBrains Mono, monospace" text-anchor="middle" font-weight="600">600 mm</text>`;
  }
  return `<svg viewBox="150 40 640 520" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block">${s}</svg>`;
}

/* Isometric view cube */
function viewCube(selc='#e08b3c'){
  return `<svg viewBox="0 0 74 74" width="74" height="74">
    <g transform="translate(37,37)">
      ${poly([[-22,-8],[0,-19],[22,-8],[0,3]],'#3a414b','#5c6570')}
      ${poly([[-22,-8],[0,3],[0,26],[-22,15]],'#2b3139','#5c6570')}
      ${poly([[0,3],[22,-8],[22,15],[0,26]],'#22272e','#5c6570')}
      <text x="0" y="-11" fill="#c6ccd4" font-size="8" text-anchor="middle" font-family="Inter">TOP</text>
      <text x="-11" y="14" fill="#8d96a2" font-size="8" text-anchor="middle" font-family="Inter">L</text>
      <text x="11" y="14" fill="#8d96a2" font-size="8" text-anchor="middle" font-family="Inter">F</text>
      <circle cx="${selc==='#e08b3c'? 0:0}" cy="8" r="0" fill="${selc}"/>
    </g>
    <text x="37" y="70" fill="#5f6775" font-size="8" text-anchor="middle" font-family="JetBrains Mono">ISO</text>
  </svg>`;
}

/* Small compass gizmo */
function compass(){
  return `<svg viewBox="0 0 70 70" width="70" height="70">
    <circle cx="35" cy="35" r="30" fill="#12161b" stroke="#333a44"/>
    <line x1="35" y1="35" x2="35" y2="9" stroke="#e0645a" stroke-width="2"/>
    <line x1="35" y1="35" x2="59" y2="35" stroke="#6f9de0" stroke-width="2"/>
    <line x1="35" y1="35" x2="35" y2="61" stroke="#4a525d" stroke-width="2"/>
    <line x1="35" y1="35" x2="11" y2="35" stroke="#4a525d" stroke-width="2"/>
    <text x="35" y="7" fill="#e0645a" font-size="9" font-weight="700" text-anchor="middle" font-family="JetBrains Mono">Z</text>
    <text x="63" y="38" fill="#6f9de0" font-size="9" font-weight="700" text-anchor="middle" font-family="JetBrains Mono">X</text>
    <text x="35" y="68" fill="#7d8693" font-size="8" text-anchor="middle" font-family="JetBrains Mono">Y</text>
  </svg>`;
}
