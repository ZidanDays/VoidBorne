
/* =====================================================================
   AUDIO ENGINE (Web Audio, fully synthesized)
   ===================================================================== */
const AUD={ctx:null,vol:0.8,muted:false};
function setParam(p,v,t,tc=0.05){if(p&&p.setTargetAtTime)p.setTargetAtTime(v,t,tc);else if(p)p.value=v;}
function setPos(node,p){const t=AUD.ctx.currentTime;if(node.positionX){setParam(node.positionX,p[0],t);setParam(node.positionY,p[1],t);setParam(node.positionZ,p[2],t);}else node.setPosition(p[0],p[1],p[2]);}
function noiseBuf(sec,pink){const AC=AUD.ctx,sr=AC.sampleRate,b=AC.createBuffer(1,Math.floor(sr*sec),sr),d=b.getChannelData(0);let b0=0,b1=0,b2=0;
  for(let i=0;i<d.length;i++){const w=Math.random()*2-1;if(pink){b0=0.99765*b0+w*0.0990460;b1=0.96300*b1+w*0.2965164;b2=0.57000*b2+w*1.0526913;d[i]=(b0+b1+b2+w*0.1848)*0.12;}else d[i]=w;}return b;}
function env(g,t0,a,peak,r,hold=0){g.gain.setValueAtTime(0.0001,t0);g.gain.linearRampToValueAtTime(peak,t0+a);g.gain.setValueAtTime(peak,t0+a+hold);g.gain.exponentialRampToValueAtTime(0.0001,t0+a+hold+r);}
// HRTF on medium/high (CFG.HRTF), equalpower on low; switchable at runtime via applyPanning()
function panModel(){return(CFG.HRTF&&quality.hrtf)?'HRTF':'equalpower';}
function applyPanning(){if(!AUD.panners)return;const m=panModel();for(const p of AUD.panners)try{p.panningModel=m;}catch(e){}}
function makePanner(pos,ref=40,temp){const AC=AUD.ctx;const p=AC.createPanner();p.panningModel=panModel();if(!temp)(AUD.panners=AUD.panners||[]).push(p);p.distanceModel='inverse';p.refDistance=ref;p.maxDistance=6000;p.rolloffFactor=1.1;setPos(p,pos);
  const of=AC.createBiquadFilter();of.type='lowpass';of.frequency.value=20000;of.Q.value=0.5;const og=AC.createGain();og.gain.value=1;p.connect(of);of.connect(og);og.connect(AUD.muffle);p._occ={f:of,g:og};   /* per-source occlusion stage (Phase 5D) */
  if(temp)tempOcc(p,pos);return p;}
function initAudio(){
  if(AUD.ctx)return;let AC;try{AC=new(window.AudioContext||window.webkitAudioContext)();}catch(e){return;}AUD.ctx=AC;const t=AC.currentTime;
  const comp=AC.createDynamicsCompressor();AUD.comp=comp;comp.threshold.value=-12;comp.ratio.value=4;comp.connect(AC.destination);
  AUD.master=AC.createGain();AUD.master.gain.value=AUD.muted?0:AUD.vol;AUD.master.connect(comp);
  AUD.muffle=AC.createBiquadFilter();AUD.muffle.type='lowpass';AUD.muffle.frequency.value=20000;AUD.muffle.connect(AUD.master);
  // reverb from a generated impulse response
  const rv=AC.createConvolver();const sr=AC.sampleRate,L=sr*4,ir=AC.createBuffer(2,L,sr);for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<L;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/L,3.0)*(i<300?i/300:1);}
  rv.buffer=ir;AUD.revGain=AC.createGain();AUD.revGain.gain.value=0.35;rv.connect(AUD.revGain);AUD.revGain.connect(AUD.muffle);AUD.rev=rv;
  // drone pad
  const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=240;lp.Q.value=1.2;const dg=AC.createGain();dg.gain.value=0.085;lp.connect(dg);dg.connect(AUD.muffle);dg.connect(rv);AUD.drone={lp,gain:dg,oscs:[]};
  for(const[f,ty,g]of[[55,'sawtooth',0.5],[55.35,'sawtooth',0.5],[82.4,'triangle',0.35],[27.5,'sine',0.8],[110.2,'sine',0.15]]){const o=AC.createOscillator();o.type=ty;o.frequency.value=f;const og=AC.createGain();og.gain.value=g;o.connect(og);og.connect(lp);o.start();AUD.drone.oscs.push({o,f});
    const v=AC.createOscillator();v.frequency.value=err(0.03,0.09);const vg=AC.createGain();vg.gain.value=f*0.004;v.connect(vg);vg.connect(o.frequency);v.start();}
  AUD.drone.lfoTarget=lp.frequency;const lfo=AC.createOscillator();lfo.frequency.value=0.045;const lg=AC.createGain();lg.gain.value=130;lfo.connect(lg);lg.connect(lp.frequency);lfo.start();
  // cosmic hiss
  const hs=AC.createBufferSource();hs.buffer=noiseBuf(5,true);hs.loop=true;const hp=AC.createBiquadFilter();hp.type='highpass';hp.frequency.value=2500;const hg=AC.createGain();hg.gain.value=0.05;hs.connect(hp);hp.connect(hg);hg.connect(AUD.muffle);hs.start();
  const hl=AC.createOscillator();hl.frequency.value=0.08;const hlg=AC.createGain();hlg.gain.value=0.02;hl.connect(hlg);hlg.connect(hg.gain);hl.start();AUD.hissFB={gain:hg,mod:hlg};
  initMoodLayers(AC);
  // suit hum (not muffled: it's the player's own suit)
  const sg=AC.createGain();sg.gain.value=0.018;sg.connect(AUD.master);for(const f of[110,220.5]){const o=AC.createOscillator();o.type='sine';o.frequency.value=f;o.connect(sg);o.start();}
  // thruster
  const tn=AC.createBufferSource();tn.buffer=noiseBuf(3,false);tn.loop=true;AUD.thrF=AC.createBiquadFilter();AUD.thrF.type='bandpass';AUD.thrF.frequency.value=900;AUD.thrF.Q.value=0.7;AUD.thr=AC.createGain();AUD.thr.gain.value=0;tn.connect(AUD.thrF);AUD.thrF.connect(AUD.thr);AUD.thr.connect(AUD.master);tn.start();
  // spatial sources
  AUD.whaleP=whales.map(w=>makePanner(w.pos,120));
  AUD.stationP=makePanner(station.pos,200);{const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=220;const g=AC.createGain();g.gain.value=0.4;f.connect(g);g.connect(AUD.stationP);AUD.stationOsc=[];for(const fr of[49,98.5,147]){const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=fr;o.connect(f);o.start();AUD.stationOsc.push(o);}}
  AUD.wreckP=wrecks.map(w=>makePanner(w.pos,60));
  AUD.beaconP=makePanner(secrets[0].pos,80);AUD.beaconDelay=AC.createDelay(1.0);AUD.beaconDelay.delayTime.value=0.45;const bfb=AC.createGain();bfb.gain.value=0.45;AUD.beaconDelay.connect(bfb);bfb.connect(AUD.beaconDelay);AUD.beaconDelay.connect(AUD.beaconP);
  AUD.monoP=makePanner(secrets[1].pos,30);{const g=AC.createGain();g.gain.value=0.5;g.connect(AUD.monoP);AUD.monoOsc=[];for(const fr of[40,40.6,60.3]){const o=AC.createOscillator();o.type='sine';o.frequency.value=fr;o.connect(g);o.start();AUD.monoOsc.push(o);}}
  AUD.wl='loading';loadWorklet(AC);
  AUD.timers={breath:2,whale:whales.map(()=>err(4,20)),crackle:3,creak:wrecks.map(()=>err(3,10)),chime:1,blip:0.5,ping:1,music:6};
}
function sfxWhale(p,i){const dur=err(3,6),base=err(45,110),rise=err(1.5,2.4);
  if(AUD.wl===true&&AUD.whaleNodes&&AUD.whaleNodes[i]){AUD.whaleNodes[i].port.postMessage({type:'call',base,dur,rise,vib:err(3,6),idx:err(0.4,1.4)});return;}
  const AC=AUD.ctx,t=AC.currentTime;const g=AC.createGain();env(g,t,1.0,0.9,dur*0.6,dur*0.3);const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=600;g.connect(lp);lp.connect(p);lp.connect(AUD.rev);
  const vib=AC.createOscillator();vib.frequency.value=err(3,6);const vg=AC.createGain();vg.gain.value=4;vib.connect(vg);vib.start(t);vib.stop(t+dur+2);
  const os=[];for(const[m,a]of[[1,1],[2,0.4],[3,0.15],[0.5,0.3]]){const o=AC.createOscillator();o.type='sine';o.frequency.setValueAtTime(base*m,t);o.frequency.exponentialRampToValueAtTime(base*m*rise,t+dur*0.45);o.frequency.exponentialRampToValueAtTime(base*m*0.6,t+dur);o.detune.value=dopCents(whales[i].pos,null);const og=AC.createGain();og.gain.value=a;vg.connect(o.frequency);o.connect(og);og.connect(g);o.start(t);o.stop(t+dur+2);os.push(o);}
  (AUD.wcall=AUD.wcall||[])[i]={os,end:t+dur+2};}   /* fallback whale call: oscillators kept for the Doppler update */
function sfxChime(pos){const AC=AUD.ctx,t=AC.currentTime;const p=makePanner(pos,30,true);const f=epick([523,659,784,880,1046,1318]);const g=AC.createGain();env(g,t,0.02,0.5,2.5);g.connect(p);g.connect(AUD.rev);const dc=dopCents(pos,null);
  for(const[m,a]of[[1,1],[2.76,0.25],[5.4,0.08]]){const o=AC.createOscillator();o.type='sine';o.frequency.value=f*m;o.detune.value=dc;const og=AC.createGain();og.gain.value=a;o.connect(og);og.connect(g);o.start(t);o.stop(t+3);}setTimeout(()=>p.disconnect(),3500);}
function sfxBlip(){const AC=AUD.ctx,t=AC.currentTime;const o=AC.createOscillator();o.type='sine';const f=err(1800,4200);o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*1.6,t+0.04);const g=AC.createGain();env(g,t,0.005,0.08,0.05);const pan=AC.createStereoPanner();pan.pan.value=err(-0.8,0.8);o.connect(g);g.connect(pan);pan.connect(AUD.muffle);o.start(t);o.stop(t+0.1);}
function sfxCreak(p){const AC=AUD.ctx,t=AC.currentTime,d=err(0.4,1.2);const o=AC.createOscillator();o.type='sawtooth';const f=err(50,140);o.frequency.setValueAtTime(f,t);o.frequency.linearRampToValueAtTime(f*err(0.5,1.5),t+d);
  const j=AC.createOscillator();j.frequency.value=err(8,18);const jg=AC.createGain();jg.gain.value=f*0.3;j.connect(jg);jg.connect(o.frequency);j.start(t);j.stop(t+d+0.4);
  const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=420;lp.Q.value=6;const g=AC.createGain();env(g,t,0.1,0.6,d);o.connect(lp);lp.connect(g);g.connect(p);g.connect(AUD.rev);o.start(t);o.stop(t+d+0.4);}
function sfxCrackle(p){const AC=AUD.ctx,t=AC.currentTime;const n=AC.createBufferSource();n.buffer=noiseBuf(0.5,false);const hp=AC.createBiquadFilter();hp.type='highpass';hp.frequency.value=2500;const g=AC.createGain();g.gain.setValueAtTime(0,t);
  const k=4+(Math.random()*10|0);for(let i=0;i<k;i++){const tt=t+Math.random()*0.4;g.gain.setValueAtTime(0.6,tt);g.gain.setValueAtTime(0,tt+0.006+Math.random()*0.01);}n.connect(hp);hp.connect(g);g.connect(p);n.start(t);n.stop(t+0.5);}
function sfxPing(gain=1,k=0){const AC=AUD.ctx,t=AC.currentTime;const o=AC.createOscillator();o.type='sine';o.frequency.value=660+440*k;o.detune.value=dopCents(AUD.beaconPos||secrets[0].pos,null);const g=AC.createGain();env(g,t,0.01,0.7*gain,0.35);o.connect(g);g.connect(AUD.beaconDelay);g.connect(AUD.beaconP);o.start(t);o.stop(t+0.5);}
const SCALE=[220,261.6,293.7,329.6,392,440,523.3,587.3,659.3,784];
function sfxNote(){const AC=AUD.ctx,t=AC.currentTime;const mz=moodZone();const f=epick(MOOD[mz].scale);const g=AC.createGain();env(g,t,MOOD[mz].att,0.06*MOOD[mz].amp,MOOD[mz].rel);const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=MOOD[mz].bright;g.connect(lp);lp.connect(AUD.muffle);lp.connect(AUD.rev);
  for(const[m,a,ty]of[[1,1,'triangle'],[2,0.3,'sine'],[1.5,ernd()<0.4?0.35:0,'sine']]){if(!a)continue;const o=AC.createOscillator();o.type=ty;o.frequency.value=f*m;o.detune.value=err(-6,6);const og=AC.createGain();og.gain.value=a;o.connect(og);og.connect(g);o.start(t);o.stop(t+7);}}
function sfxBreath(){const AC=AUD.ctx,t=AC.currentTime;const n=AC.createBufferSource();n.buffer=noiseBuf(2.5,false);const bp=AC.createBiquadFilter();bp.type='bandpass';bp.frequency.setValueAtTime(700,t);bp.frequency.linearRampToValueAtTime(1100,t+1.2);bp.frequency.linearRampToValueAtTime(500,t+2.4);bp.Q.value=0.8;
  const g=AC.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.035,t+1.0);g.gain.linearRampToValueAtTime(0.004,t+1.5);g.gain.linearRampToValueAtTime(0.03,t+2.0);g.gain.linearRampToValueAtTime(0.0001,t+2.6);n.connect(bp);bp.connect(g);g.connect(AUD.master);n.start(t);n.stop(t+2.7);}
function toggleMute(){AUD.muted=!AUD.muted;muted=AUD.muted;$('#mutebox').checked=AUD.muted;if(AUD.master)setParam(AUD.master.gain,AUD.muted?0:AUD.vol,AUD.ctx.currentTime,0.05);}
$('#vol').oninput=e=>{AUD.vol=e.target.value/100;if(AUD.master&&!AUD.muted)setParam(AUD.master.gain,AUD.vol,AUD.ctx.currentTime,0.05);};
function audioTick(dt){const AC=AUD.ctx;if(!AC)return;if(AC.state==='suspended')AC.resume();const t=AC.currentTime,T=AUD.timers;const b=basis();
  const L=AC.listener;if(L.positionX){setParam(L.positionX,player.pos[0],t);setParam(L.positionY,player.pos[1],t);setParam(L.positionZ,player.pos[2],t);setParam(L.forwardX,b.f[0],t);setParam(L.forwardY,b.f[1],t);setParam(L.forwardZ,b.f[2],t);setParam(L.upX,b.u[0],t);setParam(L.upY,b.u[1],t);setParam(L.upZ,b.u[2],t);}
  else{L.setPosition(player.pos[0],player.pos[1],player.pos[2]);L.setOrientation(b.f[0],b.f[1],b.f[2],b.u[0],b.u[1],b.u[2]);}
  setParam(AUD.muffle.frequency,player.inside?480:20000,t,0.25);setParam(AUD.revGain.gain,player.inside?0.75:0.35,t,0.3);
  setParam(AUD.thr.gain,Math.min(1,player.accel/180)*0.22,t,0.08);setParam(AUD.thrF.frequency,700+player.accel*4,t,0.1);
  T.breath-=dt;if(T.breath<0){sfxBreath();T.breath=err(3.8,4.8);}
  whales.forEach((w,i)=>{setPos(AUD.whaleP[i],w.pos);T.whale[i]-=dt;if(T.whale[i]<0){if(len(sub(w.pos,player.pos))<2500){sfxWhale(AUD.whaleP[i],i);caption('cap.whale',w.pos);}T.whale[i]=err(12,35);}});
  const dSt=len(sub(station.pos,player.pos));T.crackle-=dt;if(T.crackle<0){if(dSt<1600)sfxCrackle(AUD.stationP);T.crackle=err(1.5,6);}
  wrecks.forEach((w,i)=>{T.creak[i]-=dt;if(T.creak[i]<0){const d=len(sub(w.pos,player.pos));if(d<500)sfxCreak(AUD.wreckP[i]);if(d<300&&Math.random()<0.5)sfxCrackle(AUD.wreckP[i]);T.creak[i]=err(3,11);}});
  T.chime-=dt;if(T.chime<0){if(medusae.nearest&&len(sub(medusae.nearest,player.pos))<90)sfxChime(medusae.nearest);T.chime=err(1.5,4);}
  T.blip-=dt;if(T.blip<0){if(MINN.nearest&&len(sub(MINN.nearest,player.pos))<45)sfxBlip();T.blip=err(0.12,0.5);}
  // nearest signal source pings faster, louder and higher as you approach (Phase 3)
  T.ping-=dt;if(T.ping<0){const s=nearestSignal();if(s){setPos(AUD.beaconP,s.pos);AUD.beaconPos=s.pos;sfxPing(0.35+0.65*s.k,s.k);caption('cap.beacon',s.pos);T.ping=0.3+2.4*(1-s.k);}else T.ping=1;}
  moodTick(dt);
  if(CFG.MUSIC){T.music-=dt;if(T.music<0){sfxNote();const m=MOOD[moodZone()];T.music=err(m.gap[0],m.gap[1]);}}
}

