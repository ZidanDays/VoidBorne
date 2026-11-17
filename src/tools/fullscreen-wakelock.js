/* ---- fullscreen ---- */
function toggleFullscreen(){try{if(document.fullscreenElement){document.exitFullscreen();return;}const r=document.documentElement.requestFullscreen({navigationUI:'hide'});if(r&&r.catch)r.catch(()=>toast(tl('toast.fsNo')));}catch(e){toast(tl('toast.fsNA'));}}
$('#fsbtn').onclick=toggleFullscreen;
document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement&&!paused)relock();});
/* ---- screen wake lock while playing ---- */
const WL={s:null,pending:false,t:0};
function wakeTick(dt){if(!CFG.WAKE_LOCK||!navigator.wakeLock)return;WL.t-=dt;if(WL.t>0)return;WL.t=1;const want=started&&!paused&&document.visibilityState==='visible';
  if(want&&!WL.s&&!WL.pending){WL.pending=true;navigator.wakeLock.request('screen').then(s=>{WL.s=s;WL.pending=false;s.addEventListener('release',()=>{WL.s=null;});}).catch(()=>{WL.pending=false;WL.t=10;});}
  else if(!want&&WL.s){const s=WL.s;WL.s=null;s.release().catch(()=>{});}}
document.addEventListener('visibilitychange',()=>{WL.t=0;});
/* ---- capability summary in the pause menu ---- */
function capsText(){return[tl('caps.audio')+': '+(AUD.ctx?(AUD.wl===true?'AudioWorklet ('+AUD.wlSrc+' URL)':String(AUD.wl||'node graph')):tl('caps.notStarted'))+' · '+tl('caps.panning')+' '+(AUD.ctx?panModel():'—'),
  tl('caps.gamepad')+': '+(GP.id?esc(GP.id.slice(0,40)):(navigator.getGamepads?tl('caps.none'):tl('caps.unsup'))),tl('caps.rec')+': '+(recSupported()?tl('caps.avail'):tl('caps.unsup'))+' · '+tl('caps.wake')+': '+(navigator.wakeLock?(WL.s?tl('caps.held'):tl('caps.avail')):tl('caps.unsup')),
  tl('caps.sectors',{mode:GEN.mode})].join('<br>');}
$('#qual').addEventListener('change',()=>{if(AUD.ctx)applyPanning();});
/* ---- keys added in Phase 4 (runs before the Phase 3 handler; returns true when consumed) ---- */
function handleKey4(e){if(!started)return false;
  if(isAct(e,'fullscreen')){toggleFullscreen();return true;}
  if(paused)return false;
  if(PHOTO.on){if(isAct(e,'photo')||e.code==='Escape'){togglePhoto(false);return true;}if(e.code==='Enter'){PHOTO.capture=true;return true;}if(isAct(e,'record')){toggleRecord();return true;}
    if(['map','autopilot','codex','hideui','lamp','interact','scan'].some(a=>isAct(e,a))){e.preventDefault();return true;}return false;}
  if(isAct(e,'interact')&&!MAP.open&&!CODEX.open&&!WARP.on){interact();return true;}
  if(isAct(e,'photo')&&!MAP.open&&!CODEX.open&&!WARP.on){togglePhoto(true);return true;}
  if(isAct(e,'record')&&!MAP.open&&!CODEX.open){toggleRecord();return true;}
  return false;}
