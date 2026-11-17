/* ---- AudioWorklet (Phase 4): whale song (FM sweeps) and cosmic hiss synthesized per sample, loaded from a Blob URL ---- */
const WORKLET_SRC=`
class VBHiss extends AudioWorkletProcessor{
  static get parameterDescriptors(){return[{name:'level',defaultValue:0.05,minValue:0,maxValue:1},{name:'bright',defaultValue:2500,minValue:100,maxValue:12000}];}
  constructor(){super();this.s=[0x1234567,0x7654321];this.p=[[0,0,0],[0,0,0]];this.lp=[0,0];this.ph=0;this.gust=0;this.gt=0;}
  rnd(c){let x=this.s[c];x^=x<<13;x^=x>>>17;x^=x<<5;this.s[c]=x|0;return((x>>>0)/4294967296)*2-1;}
  process(_,outs,par){const out=outs[0];const n=out[0].length;const lv=par.level,br=par.bright;const a=Math.exp(-2*Math.PI*br[0]/sampleRate);
    for(let i=0;i<n;i++){this.ph+=0.08/sampleRate;this.gt-=1/sampleRate;if(this.gt<0){this.gt=2+Math.random()*6;this.gust=Math.random()*0.8;}
      const mod=0.6+0.4*Math.sin(this.ph*6.2832)+this.gust*Math.sin(this.ph*40.0);const L=lv.length>1?lv[i]:lv[0];
      for(let c=0;c<out.length&&c<2;c++){const w=this.rnd(c);const p=this.p[c];p[0]=0.99765*p[0]+w*0.099046;p[1]=0.963*p[1]+w*0.2965164;p[2]=0.57*p[2]+w*1.0526913;
        const pink=(p[0]+p[1]+p[2]+w*0.1848)*0.12;this.lp[c]=a*this.lp[c]+(1-a)*pink;out[c][i]=(pink-this.lp[c])*L*mod*2.2;}}
    return true;}}
registerProcessor('vb-hiss',VBHiss);
class VBWhale extends AudioWorkletProcessor{
  static get parameterDescriptors(){return[{name:'pitch',defaultValue:1,minValue:0.25,maxValue:4,automationRate:'k-rate'}];}   // Doppler ratio (Phase 5D)
  constructor(){super();this.v=[];this.port.onmessage=e=>{const d=e.data;if(d.type==='call'&&this.v.length<3)this.v.push({t:0,dur:d.dur,base:d.base,rise:d.rise,vib:d.vib,idx:d.idx,ph:[0,0,0,0],mph:0,vph:0,lp:0});};}
  process(_,outs,par){const out=outs[0][0];const n=out.length;out.fill(0);const P=[1,2,3,0.5],A=[1,0.4,0.15,0.3];const pm=par&&par.pitch?par.pitch[0]:1;const dt=1/sampleRate;const a=Math.exp(-2*Math.PI*600/sampleRate);
    for(const v of this.v){for(let i=0;i<n;i++){v.t+=dt;const T=v.t,D=v.dur;
      const sw=T<D*0.45?Math.pow(v.rise,T/(D*0.45)):v.rise*Math.pow(0.6/v.rise,(T-D*0.45)/(D*0.55));
      const env=T<1?T:(T<1+D*0.3?1:Math.max(0,Math.exp(-(T-1-D*0.3)/(D*0.18))));
      v.vph+=v.vib*dt;const vib=4*Math.sin(v.vph*6.2832);const f0=(v.base*sw+vib)*pm;v.mph+=f0*0.5*dt;const fm=Math.sin(v.mph*6.2832)*v.idx*(0.3+0.7*T/D);
      let s=0;for(let k=0;k<4;k++){v.ph[k]+=f0*P[k]*dt*(1+0.02*fm);s+=Math.sin(v.ph[k]*6.2832+fm)*A[k];}
      v.lp=a*v.lp+(1-a)*s;out[i]+=v.lp*env*0.55;}}
    this.v=this.v.filter(v=>v.t<v.dur+1.6+v.dur*0.6);for(let c=1;c<outs[0].length;c++)outs[0][c].set(out);return true;}}
registerProcessor('vb-whale',VBWhale);`;
async function loadWorklet(AC){if(!CFG.AUDIO_WORKLET||!AC.audioWorklet||typeof AudioWorkletNode==='undefined'){AUD.wl='fallback (AudioWorklet unavailable)';return;}
  // Blob URL first; pages opened from disk have a null origin and some browsers refuse blob:null modules, so retry with a data: URL
  try{let loaded=false,firstErr=null;
    try{await AC.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET_SRC],{type:'text/javascript'})));loaded=true;AUD.wlSrc='blob';}catch(e){firstErr=e;}
    if(!loaded){await AC.audioWorklet.addModule('data:text/javascript;charset=utf-8,'+encodeURIComponent(WORKLET_SRC));AUD.wlSrc='data';}
    const hiss=new AudioWorkletNode(AC,'vb-hiss',{outputChannelCount:[2]});const hp=hiss.parameters.get('level');hp.value=0.05;hiss.connect(AUD.muffle);AUD.hissNode=hiss;
    AUD.hissFB.mod.disconnect();AUD.hissFB.gain.gain.setTargetAtTime(0,AC.currentTime,0.5);
    AUD.whaleNodes=AUD.whaleP.map(p=>{const n=new AudioWorkletNode(AC,'vb-whale',{outputChannelCount:[1]});n.connect(p);n.connect(AUD.rev);return n;});AUD.wl=true;
    // if a processor ever throws, drop back to the node-graph synthesis (and restore the buffer hiss)
    const onErr=()=>{if(AUD.wl!==true)return;AUD.wl='fallback (processor error)';try{AUD.hissNode.disconnect();}catch(e){}AUD.hissFB.gain.gain.setTargetAtTime(0.05,AC.currentTime,0.5);};
    hiss.onprocessorerror=onErr;for(const n of AUD.whaleNodes)n.onprocessorerror=onErr;}
  catch(e){AUD.wl='fallback ('+(e&&e.message||e)+')';}}
