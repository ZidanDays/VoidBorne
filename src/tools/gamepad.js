
/* =====================================================================
   INPUT & TOOLS (Phase 4): gamepad · photo mode · clip recording · fullscreen · wake lock
   ===================================================================== */
/* ---- gamepad (standard mapping) ----
   left stick move · right stick look · RT/LT ascend/descend (analog) · LB/RB roll · A boost (hold) · B autopilot
   X headlamp · Y star map · View/Back codex · Start pause · L3 photo mode · R3 photo capture · D-pad up interact · D-pad down (hold) scan
   in the map: D-pad ←/→ choose a star, ↑/↓ choose a waypoint, A warp, B autopilot to waypoint */
const GP={f:0,s:0,u:0,roll:0,boost:false,prev:[],id:null,mapStar:-1,mapRow:-1};
addEventListener('gamepadconnected',e=>{if(CFG.GAMEPAD&&started)toast(tl('toast.pad'));});
function dz(v){const d=CFG.GP_DEADZONE;return Math.abs(v)<d?0:(v-Math.sign(v)*d)/(1-d);}
function gamepadTick(dt){GP.f=GP.s=GP.u=GP.roll=0;GP.boost=false;GP.scan=false;if(!CFG.GAMEPAD||!navigator.getGamepads)return;let pad=null;
  try{for(const p of navigator.getGamepads())if(p&&p.connected){pad=p;break;}}catch(e){return;}
  if(!pad){GP.id=null;return;}GP.id=pad.id;const B=i=>!!(pad.buttons[i]&&pad.buttons[i].pressed),V=i=>pad.buttons[i]?pad.buttons[i].value:0,A=i=>dz(pad.axes[i]||0);
  const edge=i=>{const now=B(i),was=!!GP.prev[i];GP.prev[i]=now;return now&&!was;};const ed=[];for(let i=0;i<17;i++)ed[i]=edge(i);
  if(!started){if(ed[0]||ed[9])$('#begin').click();return;}
  if(INTRO.on){if(ed.some(x=>x))introSkip();return;}   // Phase 5B: any button skips the opening sequence
  if(ed[9]){if(PHOTO.on)togglePhoto(false);else if(MAP.open)toggleMap(false);else setPaused(!paused);}
  if(paused)return;
  if(MAP.open){const stars=MAP.hits.slice().sort((a,b)=>len(sub(a.m.star,player.pos))-len(sub(b.m.star,player.pos)));
    if(ed[15]||ed[14]){GP.mapStar=(GP.mapStar+(ed[15]?1:-1)+stars.length)%Math.max(1,stars.length);if(stars[GP.mapStar]){MAP.sel=stars[GP.mapStar].m;mapInfo();}}
    if(ed[13]||ed[12]){const n=MAP.rows.length;GP.mapRow=(GP.mapRow+(ed[13]?1:-1)+n)%Math.max(1,n);if(MAP.rows[GP.mapRow]){MAP.wp=MAP.rows[GP.mapRow].p;mapInfo();}}
    if(ed[0]&&MAP.sel)startWarp(MAP.sel);if(ed[1]&&MAP.wp){toggleMap(false);toggleAutopilot();}if(ed[3])toggleMap(false);return;}
  if(ed[10])togglePhoto();if(PHOTO.on&&ed[11])PHOTO.capture=true;
  if(!PHOTO.on){if(ed[12])interact();if(ed[1])toggleAutopilot();if(ed[2])toggleLamp();if(ed[3]&&!WARP.on)toggleMap(true);if(ed[8])toggleCodex();}
  if(CODEX.open||WARP.on)return;
  GP.f=-A(1);GP.s=A(0);GP.u=V(7)-V(6);GP.roll=(B(4)?1:0)-(B(5)?1:0);GP.boost=B(0);GP.scan=B(13);   /* D-pad down (held): scanner */
  const lx=A(2),ly=A(3);if(lx||ly){const k=CFG.GP_LOOK_SPEED*dt*INPUT.sPad;player.q=qnorm(qmul(player.q,qmul(qaxis([0,1,0],-lx*k),qaxis([1,0,0],-ly*k*INPUT.inv))));}}
