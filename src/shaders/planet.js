/* ---- planets: one heightfield shared by the vertex displacement and the fragment normals ---- */
// Phase 6D: the same source with PEXT defined = the build for the new types' features (render/pipeline.js planetProgX)
const pextSrc = (src) => src.replace('#version 300 es\n', '#version 300 es\n#define PEXT 1\n');
const PLANET_COMMON =
  GL_NOISE +
  `
uniform int uType;uniform float uSeed,uTime;
uniform vec4 uPP[20];   // Phase 6D: the surface is a parameter set (layout + the values of every type: world/planet-types.js)
float craters(vec3 p){vec2 v=voro(p);float r=v.x;return -smoothstep(0.0,0.32,r)*0.5+smoothstep(0.26,0.36,r)*0.5*smoothstep(0.5,0.36,r);}
#ifdef PEXT
float ridged(vec3 p){float v=0.0,a=0.5;for(int i=0;i<3;i++){v+=a*(1.0-abs(vn3(p)*2.0-1.0));p=p*2.03+vec3(1.7,9.2,4.1);a*=0.5;}return v;}
#endif
float height(vec3 d){float h=0.0;
 if(uPP[0].y!=0.0)h+=fbm(d*uPP[0].x+uSeed)*uPP[0].y;
 if(uPP[0].w!=0.0)h+=fbm3(d*uPP[0].z+uSeed)*uPP[0].w;
 if(uPP[1].x!=0.0)h+=craters(d*5.0+uSeed)*uPP[1].x;
 if(uPP[1].y!=0.0)h+=craters(d*13.0+uSeed*2.0)*uPP[1].y;
 if(uPP[1].z!=0.0){vec2 v=voro(d*uPP[1].z+uSeed);h-=smoothstep(uPP[1].w,0.0,v.y-v.x)*uPP[2].x;}
#ifdef PEXT
 if(uPP[2].z!=0.0){vec3 q=d*uPP[2].y+uSeed;q+=vec3(fbm3(q*0.3),0.0,fbm3(q*0.3+4.0))*1.6;h+=(ridged(vec3(q.x,q.y*0.3,q.z))-0.45)*uPP[2].z;}   // dunes: warped, stretched ridges
#endif
 return h;}
float dispK(){return uPP[2].w;}
float dispH(vec3 d){float h=height(d);if(uPP[3].x>=0.0)return max(0.0,h-uPP[3].z)*dispK()*1.5;return (h-0.5)*dispK();}
float cloudA(vec3 d){return smoothstep(uPP[8].x,uPP[8].y,fbm(d*3.2+uSeed+vec3(uTime*0.004,0.0,0.0)));}
#ifdef PEXT
// irregular small moons (uPP[14].w > 0): 4 broad lobes / dents; world/planet-types.js irregularR() is the same sum (collision)
float lobe1(vec3 d,vec4 l){return l.w*exp((dot(d,l.xyz)-1.0)*uPP[14].w);}   // constant indices only: a dynamically indexed uniform array is slower on some drivers
float lobes(vec3 d){return lobe1(d,uPP[16])+lobe1(d,uPP[17])+lobe1(d,uPP[18])+lobe1(d,uPP[19]);}
vec3 lobesG(vec3 d){vec3 g=(uPP[16].xyz*lobe1(d,uPP[16])+uPP[17].xyz*lobe1(d,uPP[17])+uPP[18].xyz*lobe1(d,uPP[18])+uPP[19].xyz*lobe1(d,uPP[19]))*uPP[14].w;return g-d*dot(g,d);}
#endif`;
const RING_COMMON = `
float ringB(float t,float seed){return fbm(vec3(t*9.0,seed,0.0))*0.7+fbm3(vec3(t*40.0,seed*3.0,1.0))*0.3;}
uniform vec4 uRingGap;   // Phase 6D: the two gaps (centre 1, centre 2, half width 1, half width 2); the old rings: .42 .7 .02 .015
float ringDensB(float t,float b){float dens=smoothstep(0.28,0.62,b)*smoothstep(0.0,0.08,t)*smoothstep(1.0,0.85,t);return dens*(1.0-0.8*smoothstep(uRingGap.z,0.0,abs(t-uRingGap.x))-0.6*smoothstep(uRingGap.w,0.0,abs(t-uRingGap.y)));}
float ringDens(float t,float seed){return ringDensB(t,ringB(t,seed));}`;
const PLANET_VS = `#version 300 es
precision highp float;precision highp int;
layout(location=0) in vec3 aPos;
uniform mat4 uVP;uniform mat3 uRot;uniform vec3 uPos;uniform float uRadius,uDisp;
out vec3 vD;out vec3 vW;out float vFz;
${PLANET_COMMON}
void main(){vec3 d=normalize(aPos);float h=uDisp>0.0?dispH(d)*uDisp:0.0;
#ifdef PEXT
 if(uPP[14].w>0.0)h+=lobes(d);
#endif
 vec3 wp=uRot*(d*uRadius*(1.0+h))+uPos;vD=d;vW=wp;gl_Position=uVP*vec4(wp,1.0);${LOGZ}}`;
const PLANET_FS = `#version 300 es
precision highp float;precision highp int;
in vec3 vD;in vec3 vW;in float vFz;
uniform mat3 uRot;uniform vec3 uPos,uCam,uStar,uSunCol,uAtmo,uCol1,uCol2,uCol3,uRingN;uniform float uRadius,uAtmoK,uDisp;uniform vec4 uRing;
uniform vec4 uStar2;uniform vec3 uSunCol2;   // Phase 6C: a second star (w > 0 = on; its light colour x strength in uSunCol2)
#ifdef ULTRA
uniform sampler2D uDetail;uniform float uDetOn;   // Phase 6B 'ultra' (CFG.ULTRA_PLANETS): baked tileable detail noise, r = value, gb = gradient (0.5 = flat), a = second value
#endif
out vec4 o;
${PLANET_COMMON}
${RING_COMMON}
#ifdef ULTRA
// triplanar detail on the unit sphere: returns (value, second value) and the object-space gradient (mip filtering keeps it from shimmering)
vec2 detTri(vec3 p,vec3 n,out vec3 g){vec3 w=pow(abs(n),vec3(4.0));w/=dot(w,vec3(1.0));
 vec4 tx=texture(uDetail,p.yz),ty=texture(uDetail,p.zx),tz=texture(uDetail,p.xy);vec2 gx=tx.gb*2.0-1.0,gy=ty.gb*2.0-1.0,gz=tz.gb*2.0-1.0;
 g=w.x*vec3(0.0,gx.x,gx.y)+w.y*vec3(gy.y,0.0,gy.x)+w.z*vec3(gz.x,gz.y,0.0);g-=n*dot(g,n);return (tx.ra*w.x+ty.ra*w.y+tz.ra*w.z);}
// extra analytic octaves above the heightfield's own, each faded out before it gets finer than ~2 pixels (fp = pixel footprint on the unit sphere)
float hFine(vec3 d,float fp){float v=0.0,a=0.035,f=110.0;for(int i=0;i<3;i++){v+=a*(vn3(d*f+uSeed*1.7+float(i)*5.3)-0.5)*(1.0-smoothstep(0.25,0.5,f*fp));f*=2.13;a*=0.5;}return v;}
#endif
// Phase 6C, second light: the planet's ring shadow along L, and the specular lobe (the same one the first light uses)
float ringShadow(vec3 L){if(uRing.w<0.5)return 1.0;float dn=dot(L,uRingN);if(abs(dn)<=1e-4)return 1.0;float t=dot(uPos-vW,uRingN)/dn;if(t<=0.0)return 1.0;vec3 hp=vW+L*t;float r=length(hp-uPos);
 return (r>uRing.x&&r<uRing.y)?1.0-0.88*ringDens((r-uRing.x)/(uRing.y-uRing.x),uRing.z):1.0;}
float specL(vec3 N,vec3 L,vec3 V,float gloss,float spec){vec3 H=normalize(L+V);
#ifdef ULTRA
 float al2=2.0/(mix(10.0,150.0,gloss)+2.0);float nh=max(dot(N,H),0.0);float dd=nh*nh*(al2-1.0)+1.0;return (al2/dd)*(al2/dd)*(1.0+4.0*pow(1.0-max(dot(V,H),0.0),5.0)*spec)*spec;
#else
 return pow(max(dot(N,H),0.0),mix(10.0,150.0,gloss))*spec;
#endif
}
#ifdef PEXT
// Phase 6D: voronoi that also returns the nearest cell (crystal facets, sulfur vents); d1 / d2 are the same as voro()
vec2 voroC(vec3 p,out vec3 cell){vec3 i=floor(p),f=fract(p);float d1=9.0,d2=9.0;cell=i;
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){vec3 g=vec3(float(x),float(y),float(z));vec3 o=hash33(i+g);float d=length(g+o-f);if(d<d1){d2=d1;d1=d;cell=i+g;}else if(d<d2)d2=d;}
 return vec2(d1,d2);}
#endif
void main(){${FDEPTH}vec3 d=normalize(vD);vec3 Ng=normalize(uRot*d);vec3 V=normalize(uCam-vW);vec3 L=normalize(uStar-vW);
 vec3 N=Ng;vec3 col;float spec=0.0,gloss=0.3;vec3 emis=vec3(0.0);float shadowK=1.0;float land=1.0;
 if(uType==7){float g=fbm(d*14.0+vec3(uTime*0.05,0.0,uTime*0.03));float g2=vn3(d*40.0+uTime*0.2);float limb=max(dot(Ng,V),0.0);
  col=mix(vec3(1.0,0.35,0.05)*uCol2,vec3(1.0,0.9,0.6)*uCol3,g*0.8+g2*0.3)*(1.6+1.4*limb)*1.6*uCol1;   // Phase 6C: uCol2/uCol3 = star-class palette (1 = the old colours)
  col*=1.0+uAtmoK*(0.5*sin(uTime*7.0)+0.5*sin(uTime*10.7+1.3));o=vec4(col,1.0);return;}   // uAtmoK: slow flicker of a neutron star (0 for every other star)
 if(uType==6){float a=cloudA(d);float lit=smoothstep(-0.1,0.3,dot(Ng,L));col=uPP[13].rgb*(lit*uSunCol+0.02);   // cloud layer; Phase 6D: cloud colour and coverage from the planet's set
  if(uStar2.w>0.0)col+=smoothstep(-0.1,0.3,dot(Ng,normalize(uStar2.xyz-vW)))*uSunCol2*uPP[13].rgb;o=vec4(col,a*0.9);return;}
 if(uPP[9].x>0.0){float lat=d.y;float w=fbm(d*4.0+uSeed+vec3(uTime*0.015,0.0,0.0));float w2=fbm3(d*9.0+uSeed*1.7-vec3(0.0,0.0,uTime*0.02));   // gas bands
  float t=lat*uPP[9].y+w*2.2+w2*0.6;float b=0.5+0.5*sin(t*3.14159);float b2=0.5+0.5*sin(t*1.9+1.0);if(uPP[9].x!=1.0){b=mix(0.5,b,uPP[9].x);b2=mix(0.5,b2,uPP[9].x);}
  col=mix(uCol1,uCol2,b);col=mix(col,uCol3,b2*0.6*smoothstep(0.3,0.7,w));
  vec3 spotC=normalize(vec3(0.6,-0.25,0.75));vec3 tt=d-spotC*dot(d,spotC);float sr=length(tt)*7.0;float swirl=0.5+0.5*sin(sr*4.0-atan(tt.y,tt.x)*2.0+uTime*0.1);col=mix(col,uCol3*1.2,exp(-sr*sr)*0.9*(0.5+0.5*swirl));
  col*=0.85+0.3*fbm3(d*20.0+uSeed);spec=uPP[6].x;gloss=uPP[6].y;
#ifdef ULTRA
  if(uDetOn>0.5){float fpg=length(fwidth(d));col*=1.0+0.1*(vn3(vec3(d.x*60.0,d.y*170.0,d.z*60.0)+w2*3.0+uSeed)-0.5)*(1.0-smoothstep(0.004,0.01,fpg));}   // fine band turbulence, faded by footprint
#endif
 }
 else{
#ifdef ULTRA
  float fp=length(fwidth(d));float e=uDetOn>0.5?clamp(fp*1.5,0.0012,0.008):0.008;   // finite-difference step follows the pixel footprint: crisp up close, no noise far away
#else
  float e=0.008;
#endif
  vec3 T=normalize(cross(abs(d.y)<0.99?vec3(0,1,0):vec3(1,0,0),d));vec3 B=cross(d,T);
  float h=height(d),hx=height(normalize(d+T*e)),hy=height(normalize(d+B*e));float k=max(dispK(),0.02)*2.4;
#ifdef ULTRA
  vec2 dv=vec2(0.5);if(uDetOn>0.5){hx+=hFine(normalize(d+T*e),fp)-hFine(d,fp);hy+=hFine(normalize(d+B*e),fp)-hFine(d,fp);}
  N=normalize(Ng-uRot*(T*(hx-h)+B*(hy-h))*k/e);
  if(uDetOn>0.5&&uPP[5].w>0.5){vec3 g1,g2;dv=detTri(d*36.0+uSeed,d,g1);vec2 dv2=detTri(d*170.0+uSeed*2.0,d,g2);N=normalize(N-uRot*(g1*0.16+g2*0.08));dv=mix(dv,dv2,0.4);}
#else
  N=normalize(Ng-uRot*(T*(hx-h)+B*(hy-h))*k/e);
#endif
#ifdef PEXT
  if(uPP[14].w>0.0)N=normalize(N-uRot*lobesG(d)/(1.0+lobes(d)));   // irregular moon: the slope of its lobes
#endif
  // one voronoi evaluation shared by cracks, facets and vents (the cell is only tracked when facets / vents need it)
  vec2 vc=vec2(9.0);vec3 cell=vec3(0.0);bool needV=uPP[5].z!=0.0||uPP[7].y!=0.0;
#ifdef PEXT
  bool cellOn=uPP[10].y!=0.0||uPP[10].z!=0.0;needV=needV||cellOn;
  if(cellOn)vc=voroC(d*uPP[1].z+uSeed,cell);else
#endif
  if(needV)vc=voro(d*uPP[1].z+uSeed);
  float crack=needV?smoothstep(uPP[5].y,0.0,vc.y-vc.x):0.0;float polar=0.0;
  if(uPP[3].x>=0.0){land=smoothstep(uPP[3].x,uPP[3].y,h);polar=smoothstep(0.75,0.92,abs(d.y)+h*0.2);vec3 lc=mix(uCol2,uCol3,smoothstep(uPP[4].x,uPP[4].y,h));lc=mix(lc,vec3(0.95),polar*uPP[3].w);   // sea worlds
   col=mix(uCol1*(0.6+0.8*smoothstep(0.3,0.5,h)),lc,land);spec=mix(uPP[6].x,uPP[6].z,land);gloss=mix(uPP[6].y,uPP[6].w,land);
#ifdef ULTRA
   if(uDetOn>0.5){vec3 gw,gl2;detTri(d*90.0+vec3(uTime*0.004,0.0,uTime*0.003),d,gw);detTri(d*260.0-vec3(0.0,uTime*0.006,uTime*0.004),d,gl2);   // slow wave field: sun glints
    N=normalize(N-uRot*(gw*0.035+gl2*0.02)*(1.0-land));}
#endif
#ifdef PEXT
   if(uPP[8].w!=0.0){vec3 wv=bump3(d*70.0+vec3(uTime*0.02,0.0,uTime*0.015))+bump3(d*190.0-vec3(0.0,uTime*0.03,uTime*0.02))*0.5;wv-=d*dot(wv,d);N=normalize(N-uRot*wv*uPP[8].w*(1.0-land));}   // Phase 6D ocean waves, every quality
#endif
  }
  else{col=mix(uCol1,uCol2,smoothstep(uPP[4].x,uPP[4].y,h));
   if(uPP[4].w!=0.0)col*=(uPP[4].z+uPP[4].w*vn3(d*30.0+uSeed));
   if(uPP[5].x!=0.0)col=mix(col,uCol3,smoothstep(0.55,0.8,fbm3(d*2.0+uSeed*3.0))*uPP[5].x);
   if(uPP[5].z!=0.0)col=mix(col,uCol3,crack*uPP[5].z);
   if(uPP[3].w!=0.0){polar=smoothstep(0.75,0.92,abs(d.y)+h*0.2);col=mix(col,vec3(0.95),polar*uPP[3].w);}
   spec=uPP[6].x;gloss=uPP[6].y;
#ifdef ULTRA
   if(uPP[9].w==1.0)col*=0.9+0.2*dv.x;else if(uPP[9].w==2.0)col*=0.94+0.12*dv.y;
#endif
  }
  if(uPP[7].x!=0.0){float pool=uPP[7].z<1.0?smoothstep(uPP[7].z,uPP[7].w,fbm(d*3.5+uSeed*2.0)):0.0;float glow=max(crack*uPP[7].y,pool)*(0.75+0.25*sin(uTime*1.5+h*20.0));
   emis=mix(uPP[11].rgb,uPP[12].rgb,pool)*glow*uPP[7].x;}
#ifdef PEXT
  if(uPP[10].x!=0.0){float ez=dot(Ng,normalize(uStar-uPos))+(h-0.5)*0.35;float hot=smoothstep(0.2,0.7,ez)*uPP[10].x;float cold=smoothstep(0.0,-0.4,ez)*uPP[10].x;   // tidally locked: day side baked, night side frozen
   col=mix(col,uCol3*(0.7+0.6*h),hot);col=mix(col,vec3(0.82,0.88,0.95)*(0.9+0.2*h),cold);spec=mix(spec,0.05,max(hot,cold));land=max(land,max(hot,cold));}
  if(uPP[10].y!=0.0){vec3 fn=hash33(cell*1.31+7.0)-0.5;N=normalize(N+uRot*(fn-d*dot(fn,d))*uPP[10].y);}   // crystal facets: one tilted plane per cell
  if(uPP[10].z!=0.0){float sel=step(0.55,hash13(cell*7.13+1.7));float vent=smoothstep(0.22,0.0,vc.x)*sel;col=mix(col,uCol3,smoothstep(0.5,0.0,vc.x)*sel*0.6);   // sulfur vents
   emis+=uPP[12].rgb*vent*uPP[10].z*(0.6+0.4*sin(uTime*2.3+hash13(cell)*40.0));}
#endif
  if(uPP[8].x<1.0&&uPP[13].w!=0.0){vec3 Lo=transpose(uRot)*L;shadowK=1.0-uPP[13].w*cloudA(normalize(d+Lo*0.045));}
  if(uPP[8].z!=0.0){float night=1.0-smoothstep(-0.05,0.15,dot(Ng,L));if(uStar2.w>0.0)night*=1.0-smoothstep(-0.05,0.15,dot(Ng,normalize(uStar2.xyz-vW)));float city=step(0.86,vn3(d*60.0+uSeed))*land*(1.0-polar)*smoothstep(0.5,0.6,fbm3(d*6.0+uSeed));
   emis+=vec3(1.0,0.8,0.45)*city*night*2.0;}}
 float lit=smoothstep(-0.03,0.3,dot(Ng,L));
 if(uRing.w>0.5){float dn=dot(L,uRingN);if(abs(dn)>1e-4){float t=dot(uPos-vW,uRingN)/dn;if(t>0.0){vec3 hp=vW+L*t;float r=length(hp-uPos);if(r>uRing.x&&r<uRing.y)lit*=1.0-0.88*ringDens((r-uRing.x)/(uRing.y-uRing.x),uRing.z);}}}
 float diff=max(dot(N,L),0.0)*lit*shadowK;vec3 H=normalize(L+V);
#ifdef ULTRA
 float al2=2.0/(mix(10.0,150.0,gloss)+2.0);float nh=max(dot(N,H),0.0);float dd=nh*nh*(al2-1.0)+1.0;   // GGX lobe + Fresnel: wet/icy limbs brighten, ocean glints get a soft halo
 float sp=(al2/dd)*(al2/dd)*(1.0+4.0*pow(1.0-max(dot(V,H),0.0),5.0)*spec)*spec*lit*shadowK;
#else
 float sp=pow(max(dot(N,H),0.0),mix(10.0,150.0,gloss))*spec*lit*shadowK;
#endif
 vec3 final=col*(diff*uSunCol+0.02*vec3(0.3,0.4,0.6))+uSunCol*sp+emis;
 // Phase 6D: light-independent features (hot night side, broad sun glint, aurora, glowing haze); all off for the old types
#ifdef PEXT
 if(uPP[9].z!=0.0)final+=uPP[11].rgb*(1.0-lit)*uPP[9].z*(0.55+0.45*fbm3(d*6.0+uSeed+vec3(0.0,uTime*0.01,0.0)));
 if(uPP[10].w!=0.0)final+=uSunCol*pow(max(dot(reflect(-L,N),V),0.0),60.0)*uPP[10].w*(1.0-land)*lit*shadowK;
 if(uPP[11].w!=0.0){float al=abs(d.y)+(fbm3(d*3.0+uSeed)-0.5)*0.08;float bandA=smoothstep(0.74,0.8,al)*smoothstep(0.9,0.82,al);float cur=0.5+0.5*sin(atan(d.z,d.x)*9.0+fbm3(d*6.0+vec3(uTime*0.05))*5.0+uTime*0.4);   // aurora curtains
  final+=uPP[15].rgb*bandA*cur*cur*cur*uPP[11].w*(1.0-0.8*lit);}
 if(uPP[12].w!=0.0)final+=uPP[14].rgb*(pow(1.0-max(dot(Ng,V),0.0),2.0)*0.8+0.25*fbm3(d*4.0+uSeed+vec3(uTime*0.02)))*uPP[12].w;
#endif
 float litR=lit;   // Phase 6C: second light: its own terminator, ring shadow and highlight; the atmosphere rim follows whichever is stronger
 if(uStar2.w>0.0){vec3 L2=normalize(uStar2.xyz-vW);float lit2=smoothstep(-0.03,0.3,dot(Ng,L2))*ringShadow(L2);final+=col*max(dot(N,L2),0.0)*lit2*uSunCol2+uSunCol2*specL(N,L2,V,gloss,spec)*lit2;
  litR=max(lit,lit2*min(1.0,dot(uSunCol2,vec3(1.0))/max(dot(uSunCol,vec3(1.0)),1e-3)));}
 float rim=pow(1.0-max(dot(Ng,V),0.0),3.5)*litR*uAtmoK;final+=uAtmo*rim*0.7;final=mix(final,uAtmo*(0.3+0.7*litR),uAtmoK*0.12*(1.0-max(dot(Ng,V),0.0)));
 o=vec4(final,1.0);}`;
