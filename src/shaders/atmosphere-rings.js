/* ---- atmosphere: cheap single-scattering (Rayleigh colour from the palette + Mie forward lobe), 8 samples ---- */
const ATMO_FS = `#version 300 es
precision highp float;precision highp int;
in vec3 vD;in vec3 vW;in float vFz;uniform vec3 uCam,uStar,uAtmo,uPos,uSunCol;uniform float uAtmoK,uRadius,uRp;
uniform vec4 uStar2;uniform vec3 uSunCol2;   // Phase 6C: second star (w > 0 = on)
out vec4 o;
void main(){vec3 ro=uCam-uPos;vec3 rd=normalize(vW-uCam);float Ra=uRadius,Rp=uRp;
 float b=dot(ro,rd);float c=dot(ro,ro)-Ra*Ra;float h=b*b-c;if(h<0.0)discard;h=sqrt(h);float t0=max(-b-h,0.0),t1=-b+h;
 float cp=dot(ro,ro)-Rp*Rp;float hp=b*b-cp;if(hp>0.0){float tp=-b-sqrt(hp);if(tp>0.0)t1=min(t1,tp);}
 if(t1<=t0)discard;vec3 L=normalize(uStar-uPos);float H=Ra-Rp;
 const int N=8;float dt=(t1-t0)/float(N);float T=1.0;vec3 sum=vec3(0.0),sum2=vec3(0.0);float mu=dot(rd,L);float phR=0.75*(1.0+mu*mu);float g=0.72;float phM=(1.0-g*g)/(4.0*3.14159*pow(1.0+g*g-2.0*g*mu,1.5));
 for(int i=0;i<N;i++){vec3 s=ro+rd*(t0+(float(i)+0.5)*dt);float hh=clamp((length(s)-Rp)/H,0.0,1.0);float dens=exp(-hh*4.5)*(1.0-hh);
  float sunH=dot(normalize(s),L);float sunVis=smoothstep(-0.3,0.2,sunH);vec3 sunCol=mix(vec3(1.0,0.42,0.12),vec3(1.0),smoothstep(-0.12,0.3,sunH));
  vec3 scat=(uAtmo*phR+vec3(1.0)*phM*0.3)*dens*sunVis*sunCol;float k=dt/H;sum+=scat*T*k*2.6;
  if(uStar2.w>0.0){vec3 L2=normalize(uStar2.xyz-uPos);float m2=dot(rd,L2);float pr2=0.75*(1.0+m2*m2);float pm2=(1.0-g*g)/(4.0*3.14159*pow(1.0+g*g-2.0*g*m2,1.5));float h2=dot(normalize(s),L2);   // the same scattering for the second star
   sum2+=(uAtmo*pr2+vec3(1.0)*pm2*0.3)*dens*smoothstep(-0.3,0.2,h2)*mix(vec3(1.0,0.42,0.12),vec3(1.0),smoothstep(-0.12,0.3,h2))*T*k*2.6;}
  T*=exp(-dens*k*2.2);}
 vec3 res=sum*uSunCol*uAtmoK;if(uStar2.w>0.0)res+=sum2*uSunCol2*uAtmoK;o=vec4(res,1.0);}`;
const ATMO_RIM_FS = `#version 300 es
precision highp float;precision highp int;
in vec3 vD;in vec3 vW;in float vFz;uniform mat3 uRot;uniform vec3 uCam,uStar,uAtmo;uniform float uAtmoK;uniform vec4 uStar2;   // uStar2: Phase 6C second star
out vec4 o;
void main(){${FDEPTH}vec3 N=normalize(uRot*normalize(vD));vec3 V=normalize(uCam-vW);vec3 L=normalize(uStar-vW);float f=pow(1.0-max(dot(N,V),0.0),5.5);float lit=smoothstep(-0.25,0.35,dot(N,L));
 if(uStar2.w>0.0)lit=max(lit,smoothstep(-0.25,0.35,dot(N,normalize(uStar2.xyz-vW))));o=vec4(uAtmo*f*lit*1.6*uAtmoK,1.0);}`;
/* ---- ring disk ---- */
const RING_VS = `#version 300 es
precision highp float;layout(location=0) in vec2 aRA;uniform mat4 uVP;uniform mat3 uPlane;uniform vec3 uCenter;uniform float uIn,uOut;out vec3 vW;out float vR;out float vFz;
void main(){float R=mix(uIn,uOut,aRA.x);vec3 p=uPlane*vec3(cos(aRA.y)*R,0.0,sin(aRA.y)*R)+uCenter;vW=p;vR=R;gl_Position=uVP*vec4(p,1.0);${LOGZ}}`;
const RING_FS = `#version 300 es
precision highp float;in vec3 vW;in float vR;in float vFz;uniform vec3 uCenter,uStar,uSunCol,uPNormal,uRingCol;uniform float uPR,uSeed,uIn,uOut;out vec4 o;   // Phase 6D: uRingCol (the old rings: .75 .68 .58)
uniform vec4 uStar2;uniform vec3 uSunCol2;   // Phase 6C: second star (w > 0 = on): a second lit side and a second planet shadow
${GL_NOISE}
${RING_COMMON}
void main(){${FDEPTH}float t=(vR-uIn)/(uOut-uIn);float b=ringB(t,uSeed);float dens=ringDensB(t,b);
 vec3 L=normalize(uStar-vW);vec3 rel=vW-uCenter;float along=dot(rel,L);vec3 perp=rel-L*along;float sh=along<0.0?smoothstep(uPR*1.02,uPR*0.96,length(perp)):0.0;
 float lit=abs(dot(normalize(uPNormal),L))*0.8+0.2;vec3 col=uRingCol*(0.5+0.5*b)*uSunCol*lit*(1.0-sh*0.92)+vec3(0.02,0.03,0.05);
 if(uStar2.w>0.0){vec3 L2=normalize(uStar2.xyz-vW);float a2=dot(rel,L2);float sh2=a2<0.0?smoothstep(uPR*1.02,uPR*0.96,length(rel-L2*a2)):0.0;
  col+=uRingCol*(0.5+0.5*b)*uSunCol2*(abs(dot(normalize(uPNormal),L2))*0.8+0.2)*(1.0-sh2*0.92);}
 o=vec4(col,dens*0.85);}`;
