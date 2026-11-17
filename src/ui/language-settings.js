/* ---------------- language ---------------- */
function startKeysHTML(){const k=a=>'<span>'+esc(keyOf(a))+'</span>',s=' &nbsp; ';
  return k('fwd')+k('left')+k('back')+k('right')+' '+esc(t('k.thrust'))+s+k('up')+'/'+k('down')+' '+esc(t('k.updown'))+s+k('rollL')+'/'+k('rollR')+' '+esc(t('k.roll'))+'<br>'+
    k('boost')+' '+esc(t('k.boost'))+s+k('lamp')+' '+esc(t('k.lamp'))+s+k('mute')+' '+esc(t('k.mute'))+s+k('hideui')+' '+esc(t('k.hide'))+s+'<span>ESC</span> '+esc(t('k.pause'))+'<br>'+
    k('map')+' '+esc(t('k.map'))+s+k('autopilot')+' '+esc(t('k.auto'))+s+k('codex')+' '+esc(t('k.codex'))+'<br>'+
    k('interact')+' '+esc(t('k.interact'))+s+k('scan')+' '+esc(t('k.scan'))+s+k('photo')+' '+esc(t('k.photo'))+s+k('record')+' '+esc(t('k.record'))+s+k('fullscreen')+' '+esc(t('k.fs'))+s+esc(t('k.pad'))+
    '<br><small>'+esc(t('k.touch'))+'</small>';}
// re-renders every static text and resets the caches of the dynamic ones; called at start-up and on every language or binding change
function applyLang(){document.documentElement.lang=LANG;
  for(const el of document.querySelectorAll('[data-i18n]'))el.textContent=t(el.dataset.i18n);
  for(const el of document.querySelectorAll('[data-i18n-html]'))el.innerHTML=t(el.dataset.i18nHtml);   // only our own strings, never user input
  for(const s of document.querySelectorAll('.langpick'))s.value=LANG;
  $('#startkeys').innerHTML=startKeysHTML();$('#seedline').textContent=t('start.seed',{seed:CFG.SEED});$('#hint').textContent=t('hud.hint');
  $('#fsbtn').textContent=t('btn.fs',{key:keyOf('fullscreen')});$('#codexclose').textContent=t('codex.close',{key:keyOf('codex')});
  $('#lamp').textContent=t(player.lamp?'hud.lampOn':'hud.lampOff');$('#tuse').textContent=t('touch.use');$('#tscan').textContent=t('touch.scan');if($('#tmap'))$('#tmap').textContent=t('touch.map');
  $('#psave').textContent=CAN_SAVE?'':t('set.nosave');renderBinds();updateCount();
  labelName='';entryShown=null;promptShown=null;hudT=0;if(INT.room)$('#room').textContent=t('room.'+INT.room.id).toUpperCase();
  if(SCAN.target&&SCAN.done)showScan(SCAN.target);if(CODEX.open)renderCodex();if(MAP.open)mapInfo();if(warnShown)$('#warn').textContent=t('hud.warn');}
function setLang(l){if(!TXT[l]||l===LANG)return;LANG=l;SETTINGS.lang=l;saveSettings();applyLang();}
for(const s of document.querySelectorAll('.langpick'))s.addEventListener('change',e=>setLang(e.target.value));

/* ---------------- settings in the pause menu ---------------- */
function bindCheck(id,get,set){const el=$(id);el.checked=get();el.addEventListener('change',()=>{set(el.checked);saveSettings();});}
bindCheck('#rmbox',()=>A11Y.reduceMotion,v=>{SETTINGS.reduceMotion=v;RM=v;rmT=2;taaValid=false;});
bindCheck('#capbox',capsOn,v=>{SETTINGS.captions=v;if(!v)for(const[k,ln]of CAPS.lines)ln.t=0;});
bindCheck('#invbox',()=>INPUT.inv<0,v=>{SETTINGS.invertY=v;});
for(const[id,k]of[['#smouse','sensMouse'],['#stouch','sensTouch'],['#spad','sensPad']]){const el=$(id);el.value=Math.round(INPUT[{sensMouse:'sMouse',sensTouch:'sTouch',sensPad:'sPad'}[k]]*100);
  el.addEventListener('input',()=>{SETTINGS[k]=clamp(el.value/100,0.25,3);});el.addEventListener('change',saveSettings);}
