/* ---------------- composite uniforms for all of the above ---------------- */
function fxUniforms(pr,VPu,b,tanY){const q=fxQ();const vis=started&&!PHOTO.on&&CFG.VISOR&&VISOR.on;const breath=0.55+0.45*Math.pow(0.5+0.5*Math.sin(VISOR.bt*TAU/4.6),3);
  gl.uniform4f(pr.u.uVisor,vis&&CFG.VISOR_REFLECT&&q>0?1:0,vis&&CFG.VISOR_FOG?VISOR.fog*breath:0,vis&&CFG.VISOR_CRACKS&&!RM?Math.pow(VISOR.crack,0.6):0,vis?CFG.VISOR_CURVE:0);gl.uniform1f(pr.u.uFxQ,q);
  const so=(started&&!PHOTO.on)?scanOverlay(VPu,b,tanY):null;if(so){gl.uniform4fv(pr.u.uScan,so[0]);gl.uniform4fv(pr.u.uScanD,so[1]);}else gl.uniform4f(pr.u.uScanD,0,0,0,0);
  const iu=introUniform();const sv=SURV.vis;gl.uniform4f(pr.u.uIntro,iu[0],Math.max(iu[1],(1-sv)*0.8),iu[2]*sv,0);   /* survival respawn fade */
  gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,VISOR.cTex);gl.uniform1i(pr.u.uCrack,6);gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,VISOR.rTex);gl.uniform1i(pr.u.uRefl,7);}
function fxTick(dt){rmT-=dt;if(rmT<=0){rmT=2;RM=A11Y.reduceMotion;}scanTick(dt);if(started&&!paused&&!PHOTO.on)visorTick(dt);
  const h=HUDEL.ih;const ho=INTRO.on&&INTRO.t>0.8&&INTRO.speed===1;if(h.dataset.on!==String(ho)){h.dataset.on=String(ho);h.style.opacity=ho?0.5:0;}}

/* ---------------- debug overlay (backtick) ---------------- */
const DBG={on:false,ext:undefined,free:[],pend:[],active:null,gpu:-1,calls:0,callsLast:0,cpu:0,frame:16,t:0,orig:null};
function dbgPatch(on){const names=['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'];   // count draw calls only while the overlay is open
  if(on&&!DBG.orig){DBG.orig={};for(const n of names){const f=gl[n];DBG.orig[n]=f;gl[n]=function(a,b,c,d,e){DBG.calls++;return f.call(gl,a,b,c,d,e);};}}
  else if(!on&&DBG.orig){for(const n of names)delete gl[n];DBG.orig=null;}}
function dbgToggle(v){DBG.on=v===undefined?!DBG.on:v;$('#dbg').style.display=DBG.on?'block':'none';dbgPatch(DBG.on);DBG.t=0;DBG.gpu=-1;}
function dbgExt(){if(DBG.ext===undefined){try{DBG.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2')||null;}catch(e){DBG.ext=null;}}return DBG.ext;}
function dbgGpuBegin(){if(!DBG.on||DBG.active)return;const x=dbgExt();if(!x)return;const q=DBG.free.pop()||gl.createQuery();try{gl.beginQuery(x.TIME_ELAPSED_EXT,q);DBG.active=q;}catch(e){DBG.ext=null;}}
function dbgGpuEnd(){const x=DBG.ext;if(!DBG.active||!x)return;gl.endQuery(x.TIME_ELAPSED_EXT);DBG.pend.push(DBG.active);DBG.active=null;
  while(DBG.pend.length){const q=DBG.pend[0];if(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))break;DBG.pend.shift();const dis=gl.getParameter(x.GPU_DISJOINT_EXT);
    if(!dis){const ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;DBG.gpu=DBG.gpu<0?ms:lerp(DBG.gpu,ms,0.1);}DBG.free.push(q);}
  while(DBG.pend.length>6)gl.deleteQuery(DBG.pend.shift());}
function dbgReset(){DBG.ext=undefined;DBG.free=[];DBG.pend=[];DBG.active=null;DBG.gpu=-1;}   // after a context loss every query object is gone
function dbgTick(dt,cpu,raw){if(!DBG.on){DBG.calls=0;return;}DBG.cpu=lerp(DBG.cpu,cpu,0.1);DBG.frame=lerp(DBG.frame,raw,0.1);DBG.callsLast=DBG.calls;DBG.calls=0;DBG.t-=dt;if(DBG.t>0)return;DBG.t=0.25;
  const qn=Object.keys(QUAL).find(k=>QUAL[k]===quality)||'?';const secs=readySectors();const medS=secs.reduce((a,s)=>a+(s.med&&s.med.mesh?s.med.mesh.count:0),0);
  $('#dbg').textContent=['VOIDBORNE DEBUG          ( ` closes )',
    'cpu frame   '+DBG.cpu.toFixed(2)+' ms   (JS update + render submit)',
    'frame       '+DBG.frame.toFixed(1)+' ms · '+fpsShown+' fps',
    'gpu         '+(DBG.ext?(DBG.gpu>=0?DBG.gpu.toFixed(2)+' ms':'measuring…'):'n/a (EXT_disjoint_timer_query_webgl2 unavailable)'),
    'draw calls  '+DBG.callsLast,
    'visible     '+RST.items+' meshes · '+RST.inst.toLocaleString('en-US')+' instances · '+RST.planets+' planets',
    'creatures   '+MINN.n+' minnows in '+MINN.schools.length+' schools · '+whales.length+' whales · '+medusae.list.length+' medusae'+(medS?' (+'+medS+' in sectors)':''),
    'sectors     '+(1+secs.length)+' loaded (home + '+secs.length+') · '+GEN.pending.size+' generating · '+GEN.mode+' thread',
    'render      '+Math.round(renderScale*100)+'% · '+fb.w+'×'+fb.h+' of '+canvas.width+'×'+canvas.height+' · MSAA '+SAMPLES+'× · TAA '+(CFG.TAA&&quality.taa?'on':'off')+' · quality '+qn,
    'player      '+player.pos.map(v=>v.toFixed(0)).join(', ')+' · '+len(player.vel).toFixed(1)+' m/s'+(player.inside?' · inside':'')].join('\n');}

/* ---------------- input hooks ---------------- */
// runs before the Phase 4 / Phase 3 key handlers; returns true when the key was consumed
function handleKey5(e){if(isAct(e,'debug')){dbgToggle();e.preventDefault();return true;}
  if(INTRO.on){introSkip();if(e.code==='Space'||e.code==='Tab')e.preventDefault();return true;}return false;}
addEventListener('blur',()=>{SCAN.touch=false;for(const k in keys)keys[k]=false;});   // no stuck keys after alt-tab
{const b=$('#tscan');if(b){b.textContent=t('touch.scan');if(!CFG.SCANNER)b.style.display='none';b.addEventListener('touchstart',e=>{SCAN.touch=true;e.preventDefault();},{passive:false});
  b.addEventListener('touchend',()=>{SCAN.touch=false;});b.addEventListener('touchcancel',()=>{SCAN.touch=false;});}}
if(CFG.DEBUG_OVERLAY)dbgToggle(true);
window.__fx={SCAN,VISOR,INTRO,DBG,scanCandidates,scanPick,scanInfo,impactCheck,genCrack};
