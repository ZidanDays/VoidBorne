
/* =====================================================================
   OPEN WORLD (Phase 3)
   sectors · worker generation · streaming · warp · star map · autopilot
   signals · ship logs · monolith · random events · codex · persistence
   ===================================================================== */
const SS=CFG.SECTOR_SIZE;
let ORIGIN=[0,0,0],lookPOI=null;          // floating origin: the camera position used by the current frame's render (float64)
function hash32(a,b,c,d){let h=(a|0)^0x9E3779B9;for(const v of[b,c,d]){h=Math.imul(h^(v|0),0x85EBCA6B);h^=h>>>13;h=Math.imul(h,0xC2B2AE35);h^=h>>>16;}return h>>>0;}
function mkRng(seed){let s=(seed>>>0)||1;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// run fn with the world RNG temporarily reseeded, then restore it (keeps #seed reproducible)
function withSeed(seed,fn){const saved=_s;_s=(seed>>>0)||1;try{return fn();}finally{_s=saved;}}
const sectorOf=p=>[Math.round(p[0]/SS),Math.round(p[1]/SS),Math.round(p[2]/SS)];
const META=new Map();
/* ---- cheap, deterministic sector summary (no meshes): used by the map, the sky points and the generator ---- */
function sectorMeta(sx,sy,sz){const key=sx+','+sy+','+sz;let m=META.get(key);if(m)return m;
  if(sx===0&&sy===0&&sz===0)m={key,sx,sy,sz,home:true,exists:true,star:[0,0,0],r:STAR.r,col:SUNCOL.slice(),tint:[1,1,1],name:STAR.name,seed:CFG.SEED>>>0};
  else{const g=mkRng(hash32(CFG.SEED,sx,sy,sz));const exists=g()<CFG.SECTOR_DENSITY;const star=[sx*SS+(g()-0.5)*SS*0.5,sy*SS+(g()-0.5)*SS*0.3,sz*SS+(g()-0.5)*SS*0.5];
    const t=g();const tint=t<0.35?[1.0,0.62,0.42]:t<0.8?[1.0,0.92,0.78]:[0.72,0.84,1.0];const col=[0.55+0.45*tint[0],0.55+0.45*tint[1],0.55+0.45*tint[2]];
    let nm='';const ns=2+(g()*2|0);for(let i=0;i<ns;i++)nm+=SYL[(g()*SYL.length)|0];
    m={key,sx,sy,sz,home:false,exists,star,r:110+g()*230,col,tint,name:cap(nm),seed:hash32(CFG.SEED^0x5bd1e995,sx,sy,sz)};}
  META.set(key,m);return m;}
