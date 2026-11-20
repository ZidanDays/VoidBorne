/* ---- camera-facing billboard (corona) ---- */
const BILL_VS = `#version 300 es
precision highp float;layout(location=0) in vec2 aUV;uniform mat4 uVP;uniform vec3 uCenter,uRight,uUp;uniform float uSize;out vec2 vUV;out float vFz;
void main(){vec3 p=uCenter+uRight*aUV.x*uSize+uUp*aUV.y*uSize;vUV=aUV;gl_Position=uVP*vec4(p,1.0);${LOGZ}}`;
const CORONA_FS = `#version 300 es
precision highp float;in vec2 vUV;in float vFz;uniform float uTime;uniform vec3 uTint;out vec4 o;
uniform vec3 uCorA,uCorB;uniform float uFlick;   // Phase 6C: star-class corona colours (outer, inner; 1 = the old ones) and neutron-star flicker
${GL_NOISE}
void main(){${FDEPTH}float r=length(vUV);float a=atan(vUV.y,vUV.x);float rays=fbm3(vec3(a*3.0,r*3.0-uTime*0.15,uTime*0.05))*fbm3(vec3(a*9.0+uTime*0.1,r*2.0,3.0));
 float g=exp(-r*6.0)*1.6+rays*exp(-r*3.2)*1.4+exp(-r*2.2)*0.25;g*=1.0+uFlick*(0.5*sin(uTime*7.0)+0.5*sin(uTime*10.7+1.3));
 vec3 col=mix(vec3(1.0,0.45,0.1)*uCorA,vec3(1.0,0.85,0.6)*uCorB,exp(-r*4.0))*g*uTint;o=vec4(col*smoothstep(1.0,0.6,r),1.0);}`;
/* ---- points: dust, sparks, creature glow ---- */
const PT_VS = `#version 300 es
precision highp float;precision highp int;
layout(location=0) in vec3 aBase;layout(location=1) in vec4 aSeed;layout(location=2) in vec3 aCol;
uniform mat4 uVP;uniform vec3 uCam,uOff,uCamMod;uniform float uTime,uPR;uniform int uMode;out float vA;out vec3 vCol;out float vFz;
uniform vec4 uPl,uPl2;uniform vec3 uPlC;   // Phase 6D plume (mode 6): direction + height (m) ; kind (0 volcanic, 1 geyser), size (m), alpha, cycles/s ; colour
uniform vec4 uTl,uTl2,uTl3;uniform vec3 uTlC;   // Phase 6E comet tail (mode 7): away-from-star dir + length (m) ; direction of motion + width (m) ; kind (0 ion, 1 dust), size (m), alpha, flow /s ; colour
#ifdef ULTRA
uniform float uPtMin;   // Phase 6B 'ultra': smallest sprite size in render pixels; smaller points get bigger and dimmer (same light)
#endif
void main(){vec3 p;float sz;vCol=vec3(0.8,0.85,1.0);
 if(uMode==0){float B=90.0;p=mod(aSeed.xyz*B-uCamMod,B)-B*0.5;sz=0.12+aSeed.w*0.15;float dc=length(p);vA=(1.0-smoothstep(28.0,45.0,dc))*0.5;}
 else if(uMode==1){p=aBase+uOff+vec3(sin(uTime*1.3+aSeed.x*9.0),cos(uTime*1.1+aSeed.y*7.0),sin(uTime*0.9+aSeed.z*5.0))*0.6;float fl=step(0.6,fract(sin(uTime*(3.0+aSeed.w*9.0)+aSeed.x*50.0)*4.0));sz=0.5+aSeed.w*0.6;vA=fl*1.5;vCol=vec3(1.0,0.75,0.4);}
 else if(uMode==2){p=aBase+uOff;sz=1.4;vA=1.4;vCol=aCol;}
 else if(uMode==3){p=aBase+uOff;sz=0.3+aSeed.w*0.9;vA=aSeed.w*0.9;vCol=aCol;}
 else if(uMode==5){p=aBase+uOff;sz=aSeed.x;vA=aSeed.w;vCol=aCol;}   // mode 5: boost debris and sparks (Phase 5D): world size in aSeed.x, alpha in aSeed.w
 else if(uMode==6){float ph=fract(uTime*uPl2.w+aSeed.w);vec3 up=uPl.xyz;vec3 sd=normalize(aSeed.xyz-0.5+vec3(1e-4));sd=normalize(sd-up*dot(sd,up)+vec3(1e-5));float H=uPl.w;float hg;vec3 lat;   // Phase 6D plumes
  if(uPl2.x>0.5){hg=H*ph*(0.75+0.5*aSeed.y);lat=sd*H*ph*0.12*(0.3+aSeed.z);}   // geyser: a narrow jet that keeps rising and fades
  else if(aSeed.y<0.35){hg=H*ph*(0.5+aSeed.z*0.5);lat=sd*H*ph*0.08;}   // volcanic: a glowing column above the vent ...
  else{hg=H*4.0*ph*(1.0-ph)*(0.6+0.4*aSeed.y);lat=sd*H*ph*(0.25+0.55*aSeed.z);}   // ... and an umbrella of ballistic arcs that fall back around it
  p=uOff+up*hg+lat;sz=uPl2.y*(0.5+1.5*ph);vA=(1.0-ph)*smoothstep(0.0,0.08,ph)*uPl2.z;vCol=uPlC*(1.0+0.8*(1.0-ph)*(1.0-uPl2.x));}
 else if(uMode==7){float sa=fract(aSeed.x+uTime*uTl3.w);vec3 ad=uTl.xyz;vec3 sd=normalize(aSeed.yzw-0.5+vec3(1e-4));sd=normalize(sd-ad*dot(sd,ad)+vec3(1e-5));   // Phase 6E comet tails
  float coma=step(fract(aSeed.w*5.13),0.14);float s=mix(sa,sa*0.05,coma);float wd=uTl2.w*(0.12+pow(s,0.6))*fract(aSeed.y*7.31+0.13);
  vec3 off=ad*(uTl.w*s)+sd*wd;if(uTl3.x>0.5)off-=uTl2.xyz*(uTl.w*0.4*s*s);   // the dust tail curves back along the orbit
  if(coma>0.5)off=normalize(aSeed.zxy-0.5+vec3(1e-4))*uTl2.w*0.35*fract(aSeed.z*3.7);   // a round coma around the nucleus
  p=uOff+off;sz=uTl3.y*(0.6+1.6*s)*(1.0+coma);vA=uTl3.z*(1.0-s)*smoothstep(0.0,0.03,s+coma)*(0.45+0.55*fract(aSeed.z*13.7))*(1.0+coma);vCol=uTlC;}
 else{p=aBase+uOff;vA=1.0;vCol=aCol;} // mode 4: distant stars of other sectors, constant pixel size
 vec4 cp=uVP*vec4(p,1.0);gl_Position=cp;
#ifdef ULTRA
 float ps=uMode==4?aSeed.x:sz*uPR/max(cp.w,0.1);float s0=clamp(ps,1.0,48.0),s1=clamp(ps,uPtMin,48.0);vA*=s0/s1;gl_PointSize=s1;   // additive sprite light ~ (vA*size)^2
#else
 gl_PointSize=uMode==4?aSeed.x:clamp(sz*uPR/max(cp.w,0.1),1.0,48.0);
#endif
 ${LOGZ}}`;
const PT_FS = `#version 300 es
precision highp float;in float vA;in vec3 vCol;out vec4 o;
void main(){vec2 c=gl_PointCoord*2.0-1.0;float r=dot(c,c);if(r>1.0)discard;float a=exp(-r*3.5)*vA;o=vec4(vCol*a,a);}`;
