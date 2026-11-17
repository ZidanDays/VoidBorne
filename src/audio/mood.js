/* ---- zone mood: drone, pads and music crossfade between zones ---- */
const MOOD={
  open:{cut:240,gain:0.085,pitch:1.0,warm:0,cold:0,scale:[220,261.6,293.7,329.6,392,440,523.3,587.3,659.3,784],gap:[5,11],att:1.8,rel:4.5,amp:1,bright:1200},
  star:{cut:430,gain:0.09,pitch:1.0,warm:1,cold:0,scale:[220,277.2,311.1,329.6,415.3,440,554.4,622.3,659.3],gap:[3.5,7],att:1.2,rel:4,amp:1.1,bright:1800},
  belt:{cut:190,gain:0.065,pitch:1.0,warm:0,cold:0.3,scale:[587.3,659.3,784,880,1046.5,1174.7],gap:[10,18],att:0.4,rel:6,amp:0.7,bright:2600},
  deep:{cut:150,gain:0.1,pitch:0.944,warm:0,cold:1,scale:[110,116.5,130.8,146.8,164.8,174.6,196,220],gap:[8,15],att:3,rel:7,amp:1.2,bright:700},
  wreck:{cut:170,gain:0.08,pitch:0.891,warm:0,cold:0.5,scale:[146.8,155.6,174.6,207.7,220],gap:[9,16],att:2.5,rel:5,amp:0.8,bright:600}};
const ZW={open:1,star:0,belt:0,deep:0,wreck:0};
function initMoodLayers(AC){const mk=(freqs,type,cut)=>{const g=AC.createGain();g.gain.value=0;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=cut;lp.connect(g);g.connect(AUD.muffle);g.connect(AUD.rev);
    for(const f of freqs){const o=AC.createOscillator();o.type=type;o.frequency.value=f;o.detune.value=err(-7,7);const v=AC.createOscillator();v.frequency.value=err(0.05,0.15);const vg=AC.createGain();vg.gain.value=f*0.003;v.connect(vg);vg.connect(o.frequency);o.connect(lp);o.start();v.start();}return g;};
  AUD.warmPad=mk([110,138.6,164.8,220,277.2],'triangle',900);AUD.coldPad=mk([440.5,466.2,659.3,698.5],'sine',3000);}
function inBelt(p){const lp=qrot(qconj(BELT.q),p);const r=Math.hypot(lp[0],lp[2]);return r>BELT.R0-300&&r<BELT.R1+300&&Math.abs(lp[1])<BELT.ySpread+250;}
function moodZone(){let best='open',bv=-1;for(const k in ZW)if(ZW[k]>bv){bv=ZW[k];best=k;}return best;}
function moodTick(dt){if(!CFG.ZONE_MOOD||!AUD.drone)return;const t=AUD.ctx.currentTime;const st=activeStar();
  const tgt={star:smooth(3200,1000,len(sub(st.pos,player.pos))),belt:inBelt(player.pos)?1:0,deep:systemOf(player.pos)?0:1,wreck:player.inside?1:0};
  if(tgt.wreck)tgt.star=tgt.belt=tgt.deep=0;tgt.open=Math.max(0,1-tgt.star-tgt.belt-tgt.deep-tgt.wreck);
  const k=1-Math.exp(-dt/3);let sum=0;for(const z in ZW){ZW[z]=lerp(ZW[z],tgt[z]||0,k);sum+=ZW[z];}
  let cut=0,gain=0,pitch=0,warm=0,cold=0;for(const z in ZW){const w=ZW[z]/sum,m=MOOD[z];cut+=m.cut*w;gain+=m.gain*w;pitch+=m.pitch*w;warm+=m.warm*w;cold+=m.cold*w;}
  AUD.mood={cut:Math.round(cut),gain:+gain.toFixed(3),pitch:+pitch.toFixed(3),warm:+warm.toFixed(2),cold:+cold.toFixed(2)};
  setParam(AUD.drone.lp.frequency,cut,t,1.5);setParam(AUD.drone.gain.gain,gain,t,1.5);for(const d of AUD.drone.oscs)setParam(d.o.frequency,d.f*pitch,t,2.5);
  setParam(AUD.warmPad.gain,warm*0.045,t,2);setParam(AUD.coldPad.gain,cold*0.03,t,2);}
