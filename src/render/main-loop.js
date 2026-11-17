/* =====================================================================
   MAIN LOOP
   ===================================================================== */
/* ---- context loss recovery: recreate every GL object in place (programs, meshes, VAOs, FBOs, sky bake) ---- */
function rebuildGL(){for(const pr of GLR.progs)linkProgram(pr);for(const m of GLR.meshes)uploadMesh(m);for(const sm of GLR.simples)uploadSimple(sm);for(const pt of GLR.points)uploadPoints(pt);
  emptyVAO=gl.createVertexArray();buildGlowVAO();createFB();cubeTex=null;bakeSky();fxGL();dbgReset();}
/* ---- dynamic resolution: hysteresis (slow over 0.6 s before stepping down, 2 s before stepping up), floor, HUD warning ---- */
let slowT=0,fastT=0,floorT=0,warnShown=false;
function scaleTick(dt){const floor=Math.min(CFG.MIN_RENDER_SCALE,quality.scale);
  if(frameEMA>CFG.TARGET_FRAME_MS+4){slowT+=dt;fastT=0;}else if(frameEMA<CFG.TARGET_FRAME_MS-5){fastT+=dt;slowT=0;}else{slowT=0;fastT=0;}
  if(slowT>0.6&&renderScale>floor){renderScale=Math.max(floor,renderScale-0.05);slowT=0;}
  if(fastT>2.0&&renderScale<quality.scale){renderScale=Math.min(quality.scale,renderScale+0.05);fastT=0;}
  if(renderScale<=floor+1e-3&&frameEMA>CFG.TARGET_FRAME_MS+4)floorT+=dt;else floorT=0;
  const warn=floorT>5;if(warn!==warnShown){warnShown=warn;const el=$('#warn');if(warn)el.textContent=t('hud.warn');el.style.opacity=warn?1:0;}}
let last=performance.now(),fpsAcc=0,fpsN=0,fpsShown=0;
function frame(now){const raw=now-last;last=now;const dt=Math.min(0.05,raw/1000);fpsAcc+=raw;fpsN++;if(fpsAcc>500){fpsShown=Math.round(fpsN*1000/fpsAcc);fpsAcc=0;fpsN=0;}
  if(glLost){requestAnimationFrame(frame);return;}
  const cpu0=performance.now();frameEMA=lerp(frameEMA,raw,0.05);scaleTick(dt);gamepadTick(dt);
  try{
    if(PHOTO.on){photoStep(dt);processUploads();}  // photo mode: time frozen, free camera
    else if(started&&!paused){time+=dt;if(INTRO.on)introStep(dt);else updatePlayer(dt);optionsTick(dt);streamTick(dt);processUploads();updateStructures();interiorTick(dt);engHumTick();sectorUpdate();updateMinnows(dt);updateWhales(dt);updateMedusae(dt);eventsTick(dt);gatherLights();updateDiscovery();logCheck(dt);signalHUD(dt);updateTrail();audioTick(dt);saveTick(dt);}
    else if(!started){time+=dt;processUploads();updateStructures();updateWhales(dt);updateMedusae(dt);updateMinnows(dt);gatherLights();}
    fxTick(dt);captionTick(dt);updateGrade(dt);dbgGpuBegin();render();dbgGpuEnd();if(PHOTO.capture){PHOTO.capture=false;capturePNG();}  // read back in the same task, before the buffer is presented
    updateHUD(dt,fpsShown);if(MAP.open)drawMap();recTick();wakeTick(dt);
    dbgTick(dt,performance.now()-cpu0,raw);
    if(paused){$('#pstats').textContent=t('pause.stats',{s:Math.round(renderScale*100),f:fpsShown,seed:CFG.SEED});if((frameIdx&15)===0)$('#pcaps').innerHTML=capsText();}
  }catch(e){showErr(e.stack||String(e));return;}
  requestAnimationFrame(frame);}
$('#begin').onclick=()=>{started=true;$('#start').style.display='none';initAudio();if(AUD.ctx&&AUD.ctx.state==='suspended')AUD.ctx.resume();introStart();if(!isTouch){try{const r=canvas.requestPointerLock();if(r&&r.catch)r.catch(()=>{});}catch(_){}}};
// window resize: render() re-reads the canvas client size every frame and resizeFB() reallocates targets on change, so no handler is needed.
applyLang();updateCount();rebuildStarPoints();
// save on tab close as well (best effort)
addEventListener('pagehide',()=>{dirty=true;saveT=0;saveTick(0);});
requestAnimationFrame(frame);
