
/* =====================================================================
   PLAYER, INPUT
   ===================================================================== */
const W0=wrecks[0];
const player={pos:add(W0.pos,scl(norm(cross(norm(W0.pos),[0,1,0])),420)),q:qid(),vel:[0,0,0],boost:false,lamp:false,inside:false,accel:0,fov:1.15,hideUI:false};
player.q=qlook(sub(W0.pos,player.pos),[0,1,0]);
const basis=()=>({r:qrot(player.q,[1,0,0]),u:qrot(player.q,[0,1,0]),f:qrot(player.q,[0,0,-1])});
const keys={};let locked=false,started=false,paused=false,muted=false;
addEventListener('keydown',e=>{if(e.repeat)return;if(REBIND.on){rebindKey(e);return;}if(handleKey5(e)||handleKey4(e)||handleKey3(e))return;keys[e.code]=true;if(isAct(e,'lamp'))toggleLamp();
  if(isAct(e,'mute'))toggleMute();if(isAct(e,'hideui')){player.hideUI=!player.hideUI;for(const el of document.querySelectorAll('.ui,#radar'))el.style.visibility=player.hideUI?'hidden':'visible';}
  if(e.code==='Escape'&&started)setPaused(!paused);if(e.code==='Space')e.preventDefault();});
addEventListener('keyup',e=>{keys[e.code]=false;});
let dragging=false,lmx=0,lmy=0;
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===canvas;$('#hint').style.opacity=(!locked&&started&&!paused&&!isTouch)?1:0;});
canvas.addEventListener('mousedown',e=>{if(!started||paused)return;if(!locked){try{const r=canvas.requestPointerLock();if(r&&r.catch)r.catch(()=>{});}catch(_){}}dragging=true;lmx=e.clientX;lmy=e.clientY;});
addEventListener('mouseup',()=>dragging=false);
addEventListener('mousemove',e=>{if(!started||paused||INTRO.on)return;let dx=0,dy=0;if(locked){dx=e.movementX;dy=e.movementY;}else if(dragging){dx=e.clientX-lmx;dy=e.clientY-lmy;lmx=e.clientX;lmy=e.clientY;}
  if(dx||dy){const k=CFG.LOOK_SENS*INPUT.sMouse;player.q=qnorm(qmul(player.q,qmul(qaxis([0,1,0],-dx*k),qaxis([1,0,0],-dy*k*INPUT.inv))));}});
// touch
const tIn={x:0,y:0,up:0,boost:false,look:null};
if(isTouch){$('#touch').style.display='block';const stick=$('#stick'),knob=$('#knob');let sid=null,sx=0,sy=0;
  const setKnob=(dx,dy)=>{knob.style.left=(40+dx*40)+'px';knob.style.top=(40+dy*40)+'px';};
  canvas.addEventListener('touchstart',e=>{for(const t of e.changedTouches){if(t.clientX<innerWidth*0.4&&sid===null){sid=t.identifier;sx=t.clientX;sy=t.clientY;}else if(!tIn.look)tIn.look={id:t.identifier,x:t.clientX,y:t.clientY};}e.preventDefault();},{passive:false});
  canvas.addEventListener('touchmove',e=>{for(const t of e.changedTouches){if(t.identifier===sid){const dx=clamp((t.clientX-sx)/60,-1,1),dy=clamp((t.clientY-sy)/60,-1,1);tIn.x=dx;tIn.y=-dy;setKnob(dx,dy);}
    if(tIn.look&&t.identifier===tIn.look.id){const dx=t.clientX-tIn.look.x,dy=t.clientY-tIn.look.y;tIn.look.x=t.clientX;tIn.look.y=t.clientY;const k=0.004*INPUT.sTouch;player.q=qnorm(qmul(player.q,qmul(qaxis([0,1,0],-dx*k),qaxis([1,0,0],-dy*k*INPUT.inv))));}}e.preventDefault();},{passive:false});
  const end=e=>{for(const t of e.changedTouches){if(t.identifier===sid){sid=null;tIn.x=tIn.y=0;setKnob(0,0);}if(tIn.look&&t.identifier===tIn.look.id)tIn.look=null;}};
  canvas.addEventListener('touchend',end);canvas.addEventListener('touchcancel',end);
  const hold=(id,on,off)=>{const b=$(id);b.addEventListener('touchstart',e=>{on();e.preventDefault();},{passive:false});b.addEventListener('touchend',off);};
  hold('#tup',()=>tIn.up=1,()=>tIn.up=0);hold('#tdn',()=>tIn.up=-1,()=>tIn.up=0);hold('#tboost',()=>tIn.boost=true,()=>tIn.boost=false);
  $('#tlamp').addEventListener('touchstart',e=>{toggleLamp();e.preventDefault();},{passive:false});}
function toggleLamp(){player.lamp=!player.lamp;$('#lamp').textContent=t(player.lamp?'hud.lampOn':'hud.lampOff');}
function setPaused(p){paused=p;$('#pause').style.display=p?'flex':'none';if(p){try{document.exitPointerLock();}catch(_){}}else if(!isTouch){try{const r=canvas.requestPointerLock();if(r&&r.catch)r.catch(()=>{});}catch(_){}}}
$('#resume').onclick=()=>setPaused(false);
$('#qual').onchange=e=>{quality=QUAL[e.target.value];bakeSky();};
$('#mutebox').onchange=e=>{if(e.target.checked!==muted)toggleMute();};
function toast(msg){const t=$('#toast');t.textContent=msg;t.style.opacity=1;clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.opacity=0,3500);}

