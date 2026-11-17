/* ---- full sector generation: pure function of the meta (runs in the worker or, as a fallback, on the main thread) ---- */
function finMB(mb){return{vf:new Float32Array(mb.v),if:new Uint32Array(mb.i),r:mb.r};}
function genSector(meta,bakeAo){_s=(meta.seed>>>0)||1;
  const C=meta.star;const out={key:meta.key,planets:[],wrecks:[],beacon:null,med:null,radius:0};
  const np=2+(rnd()*4|0);let orbit=650+rr(0,300);const tilt=qaxis(rdir(),rr(0,0.25));
  for(let i=0;i<np;i++){const t=pick([0,0,1,2,3,4,1,2]);orbit+=rr(500,900)+(t===1?300:0);const a=rnd()*TAU;const r=t===1?rr(170,290):rr(55,135);
    const pos=add(C,qrot(tilt,[Math.cos(a)*orbit,rr(-80,80),Math.sin(a)*orbit]));
    const p={type:t,pos,r,orbit,name:planetName(i),pal:PAL[t](),seed:rr(0,100),axis:norm([rr(-0.4,0.4),1,rr(-0.4,0.4)]),spin:rr(0.01,0.05)*(rnd()<0.5?1:-1),moons:[],ring:null,q:qid()};
    const nm=rnd()<0.5?1+(rnd()*2|0):0;for(let k=0;k<nm;k++){const mr=Math.max(10,r*rr(0.08,0.2));p.moons.push({r:mr,dist:r*rr(2.6,4.5)+mr,ang:rnd()*TAU,w:rr(0.02,0.08)*(rnd()<0.3?-1:1),q:qaxis(rdir(),rr(0,0.6)),seed:rr(0,100),pal:PAL[5](),pos:pos.slice(),name:p.name+' '+'abc'[k]});}
    if(t===1&&rnd()<0.6)p.ring={in:r*rr(1.4,1.6),out:r*rr(2.2,2.8),q:qaxis(rdir(),rr(0.1,0.5)),seed:rr(0,100)};
    out.planets.push(p);}
  out.radius=orbit+1500;
  const free=(minR,maxR,m)=>{for(let k=0;k<120;k++){const p=add(C,scl(rdir(),rr(minR,maxR)));if(out.planets.every(pl=>len(sub(p,pl.pos))>pl.r*3+m))return p;}return add(C,scl(rdir(),maxR+400));};
  const nw=rnd()<0.8?1+(rnd()*2|0):0;
  for(let i=0;i<nw;i++){const ship=genShip(false);if(bakeAo)bakeAO(ship.hull,32,0.7);const pos=free(900,orbit,250);const name=shipName();
    const deb=[[],[],[]];for(let k=0;k<24;k++){const d=scl(rdir(),rr(ship.rad*0.5,ship.rad*2.0));const ax=rdir();deb[k%3].push([d,[ax[0],ax[1],ax[2],rr(0.1,0.8)],rr(0.6,1.7),[1,1,1],rnd()]);}
    const debris=deb.map(list=>{const a=new Float32Array(list.length*INST);list.forEach((e,j)=>instQ(a,j,e[0],e[1],e[2],e[3],e[4]));return a;});
    out.wrecks.push({name,pos,axis:rdir(),rate:rr(0.01,0.04),ph:rnd()*TAU,L:ship.L,R:ship.R,prof:ship.prof,rad:ship.rad,hull:finMB(ship.hull),panels:finMB(ship.panels),lights:finMB(ship.lights),debris,log:genLog(name)});}
  if(rnd()<0.55)out.beacon={pos:free(1500,orbit+800,150),adj:pick([0,1,2,3,4])};   // name = tl('sig.name') with adjective #adj (same RNG use as before)
  if(rnd()<0.6){const c=free(800,orbit,300);const cols=[[0.8,0.5,1.0],[0.5,0.7,1.0],[1.0,0.6,0.8],[0.5,1.0,0.8]];const col=pick(cols);const n=14;const a=new Float32Array(n*INST);
    for(let i=0;i<n;i++)instQ(a,i,scl(rdir(),rr(10,140)),qaxis(rdir(),rr(0,0.6)),rr(5,12),col.map(v=>v*rr(0.85,1.15)),rr(0,10));out.med={c,col,inst:a};}
  return out;}
function collectBuffers(o,list){if(!o||typeof o!=='object')return;if(ArrayBuffer.isView(o)){if(list.indexOf(o.buffer)<0)list.push(o.buffer);return;}for(const k in o)collectBuffers(o[k],list);}
/* ---- the worker is assembled from the same functions the main thread uses (single source of truth) ---- */
function workerSource(){
  const fns=[hash32,mkRng,add,sub,scl,dot,cross,len,norm,lerp,clamp,smooth,qid,qmul,qaxis,qnorm,qrot,qconj,qlookY,hash3,vn3,fbm3,cap,nameWord,planetName,shipName,rnd,rr,pick,rdir,xfq,instQ,bakeAO,genShip,genLog,finMB,genSector,collectBuffers];
  let src="'use strict';let _s=1;const PI=Math.PI,TAU=PI*2,INST="+INST+";\n";
  src+="const SYL="+JSON.stringify(SYL)+",ROMAN="+JSON.stringify(ROMAN)+",HULLCOLS="+JSON.stringify(HULLCOLS)+",LOG_N="+LOG_N+",LOG_EN="+LOG_EN+";\n";
  src+=MB.toString()+"\n";
  for(const f of fns){const t=f.toString();src+=(/^(function|class)\b/.test(t)?t:'const '+f.name+'='+t+';')+"\n";}
  src+="const Q0=qid();const PAL={"+Object.keys(PAL).map(k=>k+':'+PAL[k].toString()).join(',')+"};\n";
  src+="self.onmessage=e=>{const d=e.data;try{const out=genSector(d.meta,d.ao);const tr=[];collectBuffers(out,tr);self.postMessage({id:d.id,out},tr);}catch(err){self.postMessage({id:d.id,error:String(err&&err.stack||err)});}};\n";
  return src;}
const GEN={worker:null,mode:'main',pending:new Map(),times:[]};
function genMain(meta){return withSeed(meta.seed,()=>genSector(meta,CFG.BAKE_AO));}
function genFallback(reason){if(GEN.worker){try{GEN.worker.terminate();}catch(e){}}if(reason)console.warn('VOIDBORNE: sector worker unavailable ('+reason+'); generating on the main thread');
  GEN.worker=null;GEN.mode='main';const pend=[...GEN.pending.values()];GEN.pending.clear();for(const m of pend)requestSector(m);}
function initWorker(){if(!CFG.USE_WORKER||typeof Worker==='undefined'||typeof Blob==='undefined')return;
  try{const url=URL.createObjectURL(new Blob([workerSource()],{type:'text/javascript'}));const w=new Worker(url);
    w.onmessage=e=>{const d=e.data;if(d.error){genFallback(d.error.split('\n')[0]);return;}onGenerated(d.id,d.out);};
    w.onerror=e=>{if(e.preventDefault)e.preventDefault();genFallback(e.message||'error');};
    GEN.worker=w;GEN.mode='worker';}catch(e){GEN.worker=null;GEN.mode='main';}}
initWorker();
function requestSector(meta){if(meta.home||SECT.loaded.has(meta.key)||GEN.pending.has(meta.key))return;meta.t0=performance.now();GEN.pending.set(meta.key,meta);
  if(GEN.worker){GEN.worker.postMessage({id:meta.key,meta:{key:meta.key,star:meta.star,seed:meta.seed},ao:CFG.BAKE_AO});}
  else setTimeout(()=>{if(!GEN.pending.has(meta.key))return;let out;try{out=genMain(meta);}catch(e){showErr('Sector generation failed: '+(e.stack||e));GEN.pending.delete(meta.key);return;}onGenerated(meta.key,out);},0);}
