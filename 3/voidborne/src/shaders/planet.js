/* ---- planets: one heightfield shared by the vertex displacement and the fragment normals ---- */
const PLANET_COMMON =
  GL_NOISE +
  `
uniform int uType;uniform float uSeed,uTime;
float craters(vec3 p){vec2 v=voro(p);float r=v.x;return -smoothstep(0.0,0.32,r)*0.5+smoothstep(0.26,0.36,r)*0.5*smoothstep(0.5,0.36,r);}
float height(vec3 d){
 if(uType==0||uType==5){return fbm(d*3.0+uSeed)*0.6+craters(d*5.0+uSeed)*0.35+craters(d*13.0+uSeed*2.0)*0.15;}
 if(uType==2){vec2 v=voro(d*6.0+uSeed);return fbm3(d*5.0+uSeed)*0.5-smoothstep(0.12,0.0,v.y-v.x)*0.4;}
 if(uType==3){vec2 v=voro(d*5.0+uSeed);return fbm3(d*4.0+uSeed)*0.6-smoothstep(0.1,0.0,v.y-v.x)*0.5;}
 if(uType==4){return fbm(d*3.0+uSeed);}
 return 0.0;}
float dispK(){return (uType==0||uType==5)?0.07:(uType==2?0.025:(uType==3?0.04:(uType==4?0.06:0.0)));}
float dispH(vec3 d){float h=height(d);if(uType==4)return max(0.0,h-0.52)*dispK()*1.5;return (h-0.5)*dispK();}
float cloudA(vec3 d){return smoothstep(0.5,0.72,fbm(d*3.2+uSeed+vec3(uTime*0.004,0.0,0.0)));}`;
const RING_COMMON = `
float ringB(float t,float seed){return fbm(vec3(t*9.0,seed,0.0))*0.7+fbm3(vec3(t*40.0,seed*3.0,1.0))*0.3;}
float ringDensB(float t,float b){float dens=smoothstep(0.28,0.62,b)*smoothstep(0.0,0.08,t)*smoothstep(1.0,0.85,t);return dens*(1.0-0.8*smoothstep(0.02,0.0,abs(t-0.42))-0.6*smoothstep(0.015,0.0,abs(t-0.7)));}
float ringDens(float t,float seed){return ringDensB(t,ringB(t,seed));}`;
const PLANET_VS = `#version 300 es
precision highp float;precision highp int;
layout(location=0) in vec3 aPos;
uniform mat4 uVP;uniform mat3 uRot;uniform vec3 uPos;uniform float uRadius,uDisp;
out vec3 vD;out vec3 vW;out float vFz;
${PLANET_COMMON}
void main(){vec3 d=normalize(aPos);float h=uDisp>0.0?dispH(d)*uDisp:0.0;vec3 wp=uRot*(d*uRadius*(1.0+h))+uPos;vD=d;vW=wp;gl_Position=uVP*vec4(wp,1.0);${LOGZ}}`;
const PLANET_FS = `#version 300 es
precision highp float;precision highp int;
in vec3 vD;in vec3 vW;in float vFz;
uniform mat3 uRot;uniform vec3 uPos,uCam,uStar,uSunCol,uAtmo,uCol1,uCol2,uCol3,uRingN;uniform float uRadius,uAtmoK,uDisp;uniform vec4 uRing;
out vec4 o;
${PLANET_COMMON}
${RING_COMMON}
void main(){${FDEPTH}vec3 d=normalize(vD);vec3 Ng=normalize(uRot*d);vec3 V=normalize(uCam-vW);vec3 L=normalize(uStar-vW);
 vec3 N=Ng;vec3 col;float spec=0.0,gloss=0.3;vec3 emis=vec3(0.0);float shadowK=1.0;
 if(uType==7){float g=fbm(d*14.0+vec3(uTime*0.05,0.0,uTime*0.03));float g2=vn3(d*40.0+uTime*0.2);float limb=max(dot(Ng,V),0.0);
  col=mix(vec3(1.0,0.35,0.05),vec3(1.0,0.9,0.6),g*0.8+g2*0.3)*(1.6+1.4*limb)*1.6*uCol1;o=vec4(col,1.0);return;}
 if(uType==6){float a=cloudA(d);float lit=smoothstep(-0.1,0.3,dot(Ng,L));col=vec3(1.0)*(lit*uSunCol+0.02);o=vec4(col,a*0.9);return;}
 if(uType==1){float lat=d.y;float w=fbm(d*4.0+uSeed+vec3(uTime*0.015,0.0,0.0));float w2=fbm3(d*9.0+uSeed*1.7-vec3(0.0,0.0,uTime*0.02));
  float t=lat*9.0+w*2.2+w2*0.6;float b=0.5+0.5*sin(t*3.14159);float b2=0.5+0.5*sin(t*1.9+1.0);
  col=mix(uCol1,uCol2,b);col=mix(col,uCol3,b2*0.6*smoothstep(0.3,0.7,w));
  vec3 spotC=normalize(vec3(0.6,-0.25,0.75));vec3 tt=d-spotC*dot(d,spotC);float sr=length(tt)*7.0;float swirl=0.5+0.5*sin(sr*4.0-atan(tt.y,tt.x)*2.0+uTime*0.1);col=mix(col,uCol3*1.2,exp(-sr*sr)*0.9*(0.5+0.5*swirl));
  col*=0.85+0.3*fbm3(d*20.0+uSeed);spec=0.15;gloss=0.4;}
 else{float e=0.008;vec3 T=normalize(cross(abs(d.y)<0.99?vec3(0,1,0):vec3(1,0,0),d));vec3 B=cross(d,T);
  float h=height(d),hx=height(normalize(d+T*e)),hy=height(normalize(d+B*e));float k=max(dispK(),0.02)*2.4;
  N=normalize(Ng-uRot*(T*(hx-h)+B*(hy-h))*k/e);
  if(uType==0||uType==5){col=mix(uCol1,uCol2,smoothstep(0.2,0.75,h))*(0.8+0.4*vn3(d*30.0+uSeed));col=mix(col,uCol3,smoothstep(0.55,0.8,fbm3(d*2.0+uSeed*3.0))*0.5);spec=0.05;}
  else if(uType==2){vec2 v=voro(d*6.0+uSeed);float crack=smoothstep(0.1,0.0,v.y-v.x);col=mix(uCol1,uCol2,smoothstep(0.35,0.65,h));col=mix(col,uCol3,crack*0.8);spec=0.6;gloss=0.7;}
  else if(uType==3){vec2 v=voro(d*5.0+uSeed);float crack=smoothstep(0.08,0.0,v.y-v.x);float pool=smoothstep(0.66,0.78,fbm(d*3.5+uSeed*2.0));float glow=max(crack,pool)*(0.75+0.25*sin(uTime*1.5+h*20.0));
   col=mix(uCol1,uCol2,smoothstep(0.3,0.7,h));emis=mix(vec3(1.0,0.25,0.02),vec3(1.0,0.75,0.2),pool)*glow*2.2;spec=0.1;}
  else if(uType==4){float land=smoothstep(0.5,0.53,h);float polar=smoothstep(0.75,0.92,abs(d.y)+h*0.2);vec3 lc=mix(uCol2,uCol3,smoothstep(0.55,0.75,h));lc=mix(lc,vec3(0.95),polar);
   col=mix(uCol1*(0.6+0.8*smoothstep(0.3,0.5,h)),lc,land);spec=mix(0.9,0.1,land);gloss=mix(0.85,0.3,land);
   vec3 Lo=transpose(uRot)*L;shadowK=1.0-0.6*cloudA(normalize(d+Lo*0.045));
   float night=1.0-smoothstep(-0.05,0.15,dot(Ng,L));float city=step(0.86,vn3(d*60.0+uSeed))*land*(1.0-polar)*smoothstep(0.5,0.6,fbm3(d*6.0+uSeed));emis=vec3(1.0,0.8,0.45)*city*night*2.0;}}
 float lit=smoothstep(-0.03,0.3,dot(Ng,L));
 if(uRing.w>0.5){float dn=dot(L,uRingN);if(abs(dn)>1e-4){float t=dot(uPos-vW,uRingN)/dn;if(t>0.0){vec3 hp=vW+L*t;float r=length(hp-uPos);if(r>uRing.x&&r<uRing.y)lit*=1.0-0.88*ringDens((r-uRing.x)/(uRing.y-uRing.x),uRing.z);}}}
 float diff=max(dot(N,L),0.0)*lit*shadowK;vec3 H=normalize(L+V);float sp=pow(max(dot(N,H),0.0),mix(10.0,150.0,gloss))*spec*lit*shadowK;
 vec3 final=col*(diff*uSunCol+0.02*vec3(0.3,0.4,0.6))+uSunCol*sp+emis;
 float rim=pow(1.0-max(dot(Ng,V),0.0),3.5)*lit*uAtmoK;final+=uAtmo*rim*0.7;final=mix(final,uAtmo*(0.3+0.7*lit),uAtmoK*0.12*(1.0-max(dot(Ng,V),0.0)));
 o=vec4(final,1.0);}`;
