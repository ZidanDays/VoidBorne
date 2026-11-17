/* ---------------- per frame: doors, picking, prompt, goal line, room label ---------------- */
function pickInteract(){INT.target=null;if(!player.inside||!started||paused||uiBlocking()||PHOTO.on)return;const lp=localPlayer(),ld=qrot(qconj(W0.q),basis().f);let best=null,bt=1e9;
  for(const it of INT.items){const rel=sub(it.pos(),lp);const tt=dot(rel,ld);if(tt<0||tt>CFG.INTERACT_RANGE+it.r)continue;const perp=len(sub(rel,scl(ld,tt)));if(perp<it.r&&tt<bt){bt=tt;best=it;}}
  if(!best){let bd=3.2;for(const it of INT.items){const d=len(sub(it.pos(),lp));if(d<bd){bd=d;best=it;}}}   // proximity fallback (touch, imprecise aim)
  INT.target=best;}
function interact(){if(INT.target&&!paused&&!PHOTO.on)INT.target.act();}
let promptShown='';
function interiorTick(dt){
  for(const d of INT.doors){const prev=d.open;if(d.open!==d.target){d.open=d.target>d.open?Math.min(d.target,d.open+dt/1.1):Math.max(d.target,d.open-dt/1.1);if(d.open===d.target&&d.moving){d.moving=false;sfxThunk(doorWorld(d),d.sealed);}}
    const off=qrot(W0.q,[0,0,d.slide*d.open]);for(const it of[d.panel,d.strip]){const a=it.mesh.inst;a[0]=off[0];a[1]=off[1];a[2]=off[2];gl.bindBuffer(gl.ARRAY_BUFFER,it.mesh.ivbo);gl.bufferSubData(gl.ARRAY_BUFFER,0,a);}}
  for(const it of[padItem,panelInd]){gl.bindBuffer(gl.ARRAY_BUFFER,it.mesh.ivbo);gl.bufferSubData(gl.ARRAY_BUFFER,0,it.mesh.inst);}
  pickInteract();const p=INT.target?t('prompt',{key:keyName(),action:INT.target.label()}):'';
  if(p!==promptShown){promptShown=p;const el=$('#prompt');if(p)el.textContent=p;el.style.opacity=p?1:0;if(isTouch)$('#tuse').style.display=p?'flex':'none';}
  if(player.inside){if(!INT.entered){INT.entered=true;}const lp=localPlayer();const r=ROOMS.find(r=>lp[0]>=r.x0&&lp[0]<r.x1);if(r&&r!==INT.room){INT.room=r;INT.roomT=4;$('#room').textContent=t('room.'+r.id).toUpperCase();}
    if(!player.lamp&&!INT.lampHinted){INT.lampHinted=true;toast(t('toast.lamp'));}}else INT.room=null;
  if(INT.roomT>0){INT.roomT-=dt;$('#room').style.opacity=INT.roomT>0&&player.inside?0.85:0;}
  const near=len(sub(W0.pos,player.pos))<W0.rad+300;const done=secrets[3].found&&foundSet.has(DISCOVERABLE.find(d=>d.ref===secrets[3]).id);
  const g=(!INT.entered||done||!near)?'':(!INT.power?t('goal.power'):(!INT.sealedOpen?t('goal.sealed'):t('goal.artifact')));const ge=$('#goal');if(ge.dataset.t!==g){ge.dataset.t=g;if(g)ge.textContent='› '+g;ge.style.opacity=g?0.8:0;}}
/* ---------------- sounds (synthesized, spatial) ---------------- */
function tmpPanner(pos,ms){const p=makePanner(pos,20,true);setTimeout(()=>{try{p.disconnect();}catch(e){}},ms||4000);return p;}
function sfxDoor(pos,heavy){caption('cap.door',pos);if(!AUD.ctx)return;const AC=AUD.ctx,t0=AC.currentTime,p=tmpPanner(pos);const D=1.1;
  const n=AC.createBufferSource();n.buffer=noiseBuf(D+0.2,false);const bp=AC.createBiquadFilter();bp.type='bandpass';bp.Q.value=3;bp.frequency.setValueAtTime(heavy?220:420,t0);bp.frequency.linearRampToValueAtTime(heavy?380:900,t0+D);
  const g=AC.createGain();env(g,t0,0.08,heavy?0.5:0.35,D-0.1,0.0);n.connect(bp);bp.connect(g);g.connect(p);g.connect(AUD.rev);n.start(t0);n.stop(t0+D+0.2);
  const o=AC.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(heavy?55:85,t0);o.frequency.linearRampToValueAtTime(heavy?70:120,t0+D);const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=500;const og=AC.createGain();env(og,t0,0.1,0.18,D);o.connect(lp);lp.connect(og);og.connect(p);o.start(t0);o.stop(t0+D+0.2);}
function sfxThunk(pos,heavy){if(!AUD.ctx)return;const AC=AUD.ctx,t0=AC.currentTime,p=tmpPanner(pos,2000);const o=AC.createOscillator();o.type='sine';o.frequency.setValueAtTime(heavy?70:110,t0);o.frequency.exponentialRampToValueAtTime(35,t0+0.3);
  const g=AC.createGain();env(g,t0,0.005,heavy?0.9:0.6,0.35);o.connect(g);g.connect(p);g.connect(AUD.rev);o.start(t0);o.stop(t0+0.5);}
function sfxDenied(pos){caption('cap.denied',pos);if(!AUD.ctx)return;const AC=AUD.ctx,t0=AC.currentTime,p=tmpPanner(pos,2000);for(let i=0;i<2;i++){const o=AC.createOscillator();o.type='square';o.frequency.value=110;const g=AC.createGain();env(g,t0+i*0.22,0.005,0.12,0.14);const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=900;o.connect(lp);lp.connect(g);g.connect(p);o.start(t0+i*0.22);o.stop(t0+i*0.22+0.2);}}
function sfxPowerOn(pos){caption('cap.power',pos);if(!AUD.ctx)return;const AC=AUD.ctx,t0=AC.currentTime,p=tmpPanner(pos,6000);const o=AC.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(30,t0);o.frequency.exponentialRampToValueAtTime(220,t0+2.2);
  const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(200,t0);lp.frequency.linearRampToValueAtTime(1600,t0+2.2);const g=AC.createGain();env(g,t0,1.8,0.25,1.6,0.4);o.connect(lp);lp.connect(g);g.connect(p);g.connect(AUD.rev);o.start(t0);o.stop(t0+4.2);
  for(let i=0;i<3;i++){const c=AC.createOscillator();c.type='square';c.frequency.value=1800-i*300;const cg=AC.createGain();env(cg,t0+2.3+i*0.12,0.002,0.05,0.05);c.connect(cg);cg.connect(p);c.start(t0+2.3+i*0.12);c.stop(t0+2.45+i*0.12);}}
function startEngHum(){if(!AUD.ctx||AUD.engHum)return;const AC=AUD.ctx;const p=makePanner(add(W0.pos,qrot(W0.q,[11,0,6.6])),12);const g=AC.createGain();g.gain.value=0;g.connect(p);
  for(const f of[60,120.5,180.3]){const o=AC.createOscillator();o.type='sine';o.frequency.value=f;o.connect(g);o.start();}g.gain.setTargetAtTime(0.22,AC.currentTime,2);AUD.engHum={p,g};}
function engHumTick(){if(AUD.ctx&&INT.power){if(!AUD.engHum)startEngHum();else setPos(AUD.engHum.p,add(W0.pos,qrot(W0.q,[11,0,6.6])));}}
/* ---------------- input hooks ---------------- */
if($('#tuse')){$('#tuse').textContent=t('touch.use');$('#tuse').addEventListener('touchstart',e=>{interact();e.preventDefault();},{passive:false});}
window.__int=INT;
