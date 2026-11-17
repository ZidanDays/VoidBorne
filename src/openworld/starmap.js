/* ---- star map ---- */
const MAP={open:false,sel:null,wp:null,hits:[],rows:[]};
const mapCv=$('#map'),mctx=mapCv.getContext('2d');
function relock(){if(!isTouch&&started&&!paused&&!MAP.open&&!CODEX.open){try{const r=canvas.requestPointerLock();if(r&&r.catch)r.catch(()=>{});}catch(e){}}}
function toggleMap(v){MAP.open=v===undefined?!MAP.open:v;mapCv.style.display=MAP.open?'block':'none';$('#mapinfo').style.display=MAP.open?'block':'none';if(MAP.open){try{document.exitPointerLock();}catch(e){}mapInfo();}else relock();}
function uiBlocking(){return MAP.open||CODEX.open||WARP.on||SURV.fading;}
function mapInfo(){const el=$('#mapinfo');let h='';
  if(MAP.sel){const m=MAP.sel;const d=len(sub(m.star,player.pos));h+=esc(m.name.toUpperCase())+' · '+(d/1000).toFixed(1)+' km · '+esc(tl('map.sector'))+' '+m.sx+','+m.sy+','+m.sz+' &nbsp;<button class="btn" id="mwarp">'+esc(tl('map.warp'))+'</button><br>';}
  if(MAP.wp){const d=len(sub(MAP.wp.pos,player.pos));h+=esc(MAP.wp.name.toUpperCase())+' · '+(d<1000?d.toFixed(0)+' m':(d/1000).toFixed(1)+' km')+' &nbsp;<button class="btn" id="mauto">'+esc(tl('map.auto',{key:keyOf('autopilot')}))+'</button><br>';}
  h+='<span style="opacity:.6">'+esc(tl('map.help',{key:keyOf('map')}))+'</span> <button class="btn" id="mclose">'+esc(tl('btn.close'))+'</button>';el.innerHTML=h;
  const b1=$('#mwarp'),b2=$('#mauto');if(b1)b1.onclick=()=>startWarp(MAP.sel);if(b2)b2.onclick=()=>{toggleMap(false);toggleAutopilot();};$('#mclose').onclick=()=>toggleMap(false);}
function drawMap(){const dpr=Math.min(devicePixelRatio||1,2);const W=mapCv.clientWidth,H=mapCv.clientHeight;if(mapCv.width!==Math.floor(W*dpr)||mapCv.height!==Math.floor(H*dpr)){mapCv.width=Math.floor(W*dpr);mapCv.height=Math.floor(H*dpr);}
  const c=mctx;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);c.font='11px ui-monospace,Menlo,Consolas,monospace';
  const listW=Math.min(330,W*0.34);const gw=W-listW-40,gh=H-110;const cx=20+gw/2,cy=40+gh/2;const R=CFG.MAP_RANGE;const sc=Math.min(gw,gh)/((2*R+1)*SS);const P=player.pos;const cs=sectorOf(P);
  const toS=p=>[cx+(p[0]-P[0])*sc,cy+(p[2]-P[2])*sc];
  c.strokeStyle='rgba(140,200,240,0.12)';c.lineWidth=1;for(let i=-R;i<=R+1;i++){const x=toS([(cs[0]+i-0.5)*SS,0,0])[0],z=toS([0,0,(cs[2]+i-0.5)*SS])[1];c.beginPath();c.moveTo(x,cy-gh/2);c.lineTo(x,cy+gh/2);c.stroke();c.beginPath();c.moveTo(cx-gh/2*gw/gh,z);c.lineTo(cx+gw/2,z);c.stroke();}
  MAP.hits=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){const m=sectorMeta(cs[0]+dx,cs[1]+dy,cs[2]+dz);if(!m.exists)continue;const[x,y]=toS(m.star);
    const t=m.tint;c.globalAlpha=dy===0?1:0.35;c.fillStyle='rgb('+(t[0]*255|0)+','+(t[1]*255|0)+','+(t[2]*255|0)+')';c.beginPath();c.arc(x,y,2+m.r/110,0,TAU);c.fill();
    if(SECT.loaded.has(m.key)||m.home){c.strokeStyle='rgba(150,255,190,0.8)';c.beginPath();c.arc(x,y,7+m.r/110,0,TAU);c.stroke();}
    else if(PROG.visited.indexOf(m.key)>=0){c.strokeStyle='rgba(150,200,255,0.5)';c.beginPath();c.arc(x,y,6+m.r/110,0,TAU);c.stroke();}
    if(m.home){c.fillStyle='#9dffb0';c.fillText(tl('map.home'),x+9,y-6);}
    if(dy!==0){c.fillStyle='rgba(200,220,255,0.6)';c.fillText(dy>0?'▲':'▼',x+5,y+10);}
    MAP.hits.push({x,y,m});}
  c.globalAlpha=1;
  if(MAP.sel){const[x,y]=toS(MAP.sel.star);c.strokeStyle='#ffe9b0';c.lineWidth=2;c.beginPath();c.arc(x,y,12,0,TAU);c.stroke();c.lineWidth=1;c.fillStyle='#ffe9b0';c.fillText(MAP.sel.name.toUpperCase(),x+14,y+4);
    const[px,py]=toS(P);c.setLineDash([4,4]);c.strokeStyle='rgba(255,233,176,0.5)';c.beginPath();c.moveTo(px,py);c.lineTo(x,y);c.stroke();c.setLineDash([]);}
  {const[px,py]=toS(P);const f=basis().f;const a=Math.atan2(f[2],f[0]);c.save();c.translate(px,py);c.rotate(a);c.fillStyle='#fff';c.beginPath();c.moveTo(9,0);c.lineTo(-6,5);c.lineTo(-6,-5);c.fill();c.restore();}
  c.fillStyle='#cfe3ef';c.fillText(tl('map.title',{s:cs.join(','),g:SS/1000}),20,24);
  c.fillText(tl('map.gen',{mode:GEN.mode,last:GEN.times.length?tl('map.last',{ms:GEN.times[GEN.times.length-1]}):'',n:1+SECT.loaded.size}),20,H-62);
  const lx=W-listW-10;c.fillStyle='rgba(8,20,40,0.6)';c.fillRect(lx,30,listW,H-100);c.fillStyle='#cfe3ef';c.fillText(tl('map.wp'),lx+12,50);
  const list=POI.filter(p=>!(p.hidden&&!(p.ref&&p.ref.found))).map(p=>({p,d:len(sub(p.pos,P))-p.r})).filter(e=>e.d<40000).sort((a,b)=>a.d-b.d).slice(0,Math.floor((H-150)/22));
  MAP.rows=[];list.forEach((e,i)=>{const y=74+i*22;const sel=MAP.wp===e.p;if(sel){c.fillStyle='rgba(120,180,255,0.25)';c.fillRect(lx+4,y-14,listW-8,20);}
    c.fillStyle=sel?'#ffe9b0':'#cfe3ef';c.fillText(e.p.name.toUpperCase().slice(0,26),lx+12,y);c.fillStyle='rgba(207,227,239,0.6)';const d=Math.max(0,e.d);c.fillText(d<1000?d.toFixed(0)+' m':(d/1000).toFixed(1)+' km',lx+listW-80,y);
    MAP.rows.push({x:lx,y:y-14,w:listW,h:20,p:e.p});});}
mapCv.addEventListener('click',e=>{const x=e.offsetX,y=e.offsetY;for(const r of MAP.rows)if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){MAP.wp=r.p;mapInfo();return;}
  let best=null,bd=14;for(const h of MAP.hits){const d=Math.hypot(h.x-x,h.y-y);if(d<bd){bd=d;best=h;}}if(best){MAP.sel=best.m;mapInfo();}});
/* ---- keys added in Phase 3 (returns true when the key was consumed) ---- */
function handleKey3(e){if(!started||paused)return false;
  if(isAct(e,'map')){e.preventDefault();if(!WARP.on)toggleMap();return true;}
  if(isAct(e,'codex')){toggleCodex();return true;}
  if(e.code==='Escape'&&(MAP.open||CODEX.open)){toggleMap(false);toggleCodex(false);return true;}
  if(e.code==='Enter'&&MAP.open){if(MAP.sel)startWarp(MAP.sel);return true;}
  if(isAct(e,'autopilot')){if(MAP.open)toggleMap(false);toggleAutopilot();return true;}
  return false;}
// settings: restore and persist
if(SETTINGS.vol!=null){AUD.vol=clamp(+SETTINGS.vol,0,1);$('#vol').value=Math.round(AUD.vol*100);}
if(SETTINGS.muted){AUD.muted=true;muted=true;$('#mutebox').checked=true;}
$('#qual').value=CFG.QUALITY;
for(const id of['#vol','#qual','#mutebox'])$(id).addEventListener('change',saveSettings);
addEventListener('keyup',e=>{if(isAct(e,'mute'))saveSettings();});
if(isTouch){const b=document.createElement('button');b.className='btn';b.id='tmap';b.textContent=tl('touch.map');b.addEventListener('touchstart',e=>{toggleMap();e.preventDefault();},{passive:false});$('#tbtns').prepend(b);}
updateCount();
