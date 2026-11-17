/* ---------------- opening sequence ---------------- */
const INTRO={on:false,t:0,dur:5,speed:1,from:null,to:null,rm:false};
function introStart(){if(!CFG.INTRO)return;INTRO.on=true;INTRO.t=0;INTRO.speed=1;INTRO.dur=Math.max(1.5,CFG.INTRO_TIME);INTRO.rm=RM;const b=basis();INTRO.to={pos:player.pos.slice(),q:player.q.slice()};
  INTRO.from=INTRO.rm?{pos:player.pos.slice(),q:player.q.slice()}:{pos:add(player.pos,add(scl(b.f,-30),add(scl(b.u,6),scl(b.r,-8)))),q:qnorm(qmul(player.q,qmul(qaxis([0,1,0],0.5),qmul(qaxis([1,0,0],0.28),qaxis([0,0,1],-0.35)))))};
  player.pos=INTRO.from.pos.slice();player.q=INTRO.from.q.slice();player.vel=[0,0,0];taaValid=false;document.body.classList.add('intro');$('#introhint').textContent=t(isTouch?'intro.skipTouch':'intro.skip');
  if(AUD.ctx&&AUD.master&&!AUD.muted){const g=AUD.master.gain,t0=AUD.ctx.currentTime;g.cancelScheduledValues(t0);g.setValueAtTime(0.0001,t0);g.linearRampToValueAtTime(AUD.vol,t0+INTRO.dur*0.9);}}   // audio fades in with the picture
function introStep(dt){INTRO.t+=dt*INTRO.speed;const k=clamp(INTRO.t/INTRO.dur,0,1);const kp=1-Math.pow(1-k,3);const kr=k<0.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;   // ease-out drift (speed reaches 0 at hand-over), ease-in-out turn
  player.pos=add(INTRO.from.pos,scl(sub(INTRO.to.pos,INTRO.from.pos),kp));player.q=qslerpToward(INTRO.from.q,INTRO.to.q,kr);player.vel=[0,0,0];player.fov=1.15;player.accel=0;
  if(INTRO.t>=INTRO.dur)introEnd();}
function introEnd(){INTRO.on=false;player.pos=INTRO.to.pos.slice();player.q=INTRO.to.q.slice();player.vel=[0,0,0];document.body.classList.remove('intro');}
function introSkip(){if(!INTRO.on)return;const rem=INTRO.dur-INTRO.t;if(rem>0.6)INTRO.speed=Math.max(INTRO.speed,rem/0.6);   // finish everything in 0.6 s (no hard cut)
  if(AUD.ctx&&AUD.master&&!AUD.muted){const g=AUD.master.gain,t0=AUD.ctx.currentTime;g.cancelScheduledValues(t0);g.setValueAtTime(Math.max(0.0001,g.value),t0);g.linearRampToValueAtTime(AUD.vol,t0+0.6);}}
// [eyelid opening, blur, brightness]; the timings scale with INTRO_TIME; reduced motion: no blink, no drift, a plain fade
function introUniform(){if(!INTRO.on)return[1,0,1];const T=INTRO.t,D=INTRO.dur,s=D/5;
  if(INTRO.rm)return[1,1-smooth(0,D*0.7,T),smooth(0,D*0.5,T)];
  let op;if(T<1.3*s)op=smooth(0.35*s,1.3*s,T)*0.45;else if(T<1.75*s)op=0.45-smooth(1.3*s,1.75*s,T)*0.22;else op=0.23+smooth(1.75*s,2.9*s,T)*0.77;
  return[op,1-smooth(1.0*s,4.0*s,T),smooth(0,2.4*s,T)];}
addEventListener('pointerdown',()=>{if(INTRO.on)introSkip();},true);

