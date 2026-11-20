/* ---- volumetric nebula pockets: raymarched against the resolved depth, output premultiplied rgb + transmittance ---- */
// Phase 6B: AXIS is the camera's forward axis for depth -> distance. In the TILES variants (tiled photos, compiled on first use) uFwd/uTan
// are shifted to one tile, so the true axis comes in uAxis; the normal programs keep using uFwd, exactly as before.
const VOL_FS = `#version 300 es
precision highp float;precision highp int;
in vec2 vUV;uniform sampler2D uDepth;uniform vec3 uCam,uRight,uUp,uFwd,uStar;
#ifdef TILES
uniform vec3 uAxis;
#define AXIS uAxis
#else
#define AXIS uFwd
#endif
uniform vec2 uTan;uniform float uTime;uniform int uN,uSteps;uniform vec4 uCloud[3];uniform vec4 uCloudCol[3];
out vec4 o;
${GL_NOISE}
#ifdef SHELL
// Phase 6E (compiled only when a landmark is in view): emissive filament shells. uCloudK = kind (1 supernova remnant,
// 2 planetary nebula), inner radius (fraction), brightness, seed; uCloudA = lobe axis (nebula). Marched only across the shell.
uniform vec4 uCloudK[3];uniform vec4 uCloudA[3];
float shellDens(vec3 q,int c,out vec3 col){float r=length(q);vec3 dir=q/max(r,1e-4);vec4 K=uCloudK[c];float sd=K.w;
 if(K.x<1.5){float sh=smoothstep(K.y,K.y+0.07,r)*smoothstep(1.0,0.93,r);if(sh<=0.0){col=vec3(0.0);return 0.0;}
  float f1=1.0-abs(fbm3(dir*3.2+sd)*2.0-1.0);float f2=1.0-abs(fbm3(dir*8.5+sd*1.3+vec3(uTime*0.002))*2.0-1.0);
  float fil=pow(f1,9.0)+0.5*pow(f2,12.0);col=mix(vec3(1.0,0.22,0.16),vec3(0.2,0.85,0.8),smoothstep(0.35,0.7,fbm3(dir*1.7+sd*0.7)));
  return sh*fil*(0.55+0.45*fbm3(q*5.0+sd));}
 float ax=abs(dot(dir,uCloudA[c].xyz));float re=r/mix(0.55,1.0,pow(ax,0.7));   // two lobes along the axis, a pinched waist
 float sh=smoothstep(K.y,K.y+0.12,re)*smoothstep(1.0,0.82,re);if(sh<=0.0){col=vec3(0.0);return 0.0;}
 col=mix(vec3(0.3,0.85,1.0),vec3(1.0,0.35,0.3),smoothstep(0.6,0.95,re));
 return sh*(0.45+0.55*fbm3(q*4.0+sd))*(0.7+0.6*smoothstep(0.85,1.0,1.0-ax));}
void shellMarch(int c,vec3 rd,float tmax,float jit,inout vec3 acc,inout float T){vec3 C=uCloud[c].xyz;float R=uCloud[c].w;vec3 ro=uCam-C;float b=dot(ro,rd);
 float h=b*b-(dot(ro,ro)-R*R);if(h<0.0)return;h=sqrt(h);float t0=max(-b-h,0.0),t1=min(-b+h,tmax);if(t1<=t0)return;
 float Ri=R*max(uCloudK[c].y-0.02,0.0);float hi=b*b-(dot(ro,ro)-Ri*Ri);float a0=t0,a1=t1,b0=1.0,b1=0.0;   // second interval only when the inner sphere is hit
 if(hi>0.0){hi=sqrt(hi);float i0=-b-hi,i1=-b+hi;if(i1>t0&&i0<t1){a1=min(t1,max(i0,t0));b0=max(t0,i1);b1=t1;}}
 int ns=max(uSteps/2,4);float gain=uCloudK[c].z;
 for(int seg=0;seg<2;seg++){float s0=seg==0?a0:b0,s1=seg==0?a1:b1;if(s1<=s0)continue;float dt=(s1-s0)/float(ns);
  for(int i=0;i<32;i++){if(i>=ns)break;float t=s0+(float(i)+jit)*dt;vec3 q=(uCam+rd*t-C)/R;vec3 col;float d=shellDens(q,c,col);if(d<0.003)continue;
   float k=dt/R;acc+=col*d*T*k*gain;T*=exp(-d*k*1.2);if(T<0.02)return;}}}
#endif
void main(){vec2 n=vUV*2.0-1.0;vec3 rd=normalize(uFwd+uRight*n.x*uTan.x+uUp*n.y*uTan.y);
 float wmax=exp2(texture(uDepth,vUV).r*${LF})-1.0;float tmax=wmax/max(dot(rd,AXIS),1e-3);
 vec3 acc=vec3(0.0);float T=1.0;float jit=hash12(gl_FragCoord.xy+fract(uTime*7.0)*37.0);
 for(int c=0;c<3;c++){if(c>=uN)break;
#ifdef SHELL
  if(uCloudK[c].x>0.5){shellMarch(c,rd,tmax,jit,acc,T);continue;}
#endif
  vec3 C=uCloud[c].xyz;float R=uCloud[c].w;vec3 ro=uCam-C;float b=dot(ro,rd);float cc=dot(ro,ro)-R*R;float h=b*b-cc;if(h<0.0)continue;h=sqrt(h);
  float t0=max(-b-h,0.0),t1=min(-b+h,tmax);if(t1<=t0)continue;float dt=(t1-t0)/float(uSteps);vec3 col=uCloudCol[c].rgb;float sd=uCloudCol[c].w;vec3 L=normalize(uStar-C);
  for(int i=0;i<64;i++){if(i>=uSteps)break;float t=t0+(float(i)+jit)*dt;vec3 p=uCam+rd*t;vec3 q=(p-C)/R;float fall=1.0-dot(q,q);if(fall<=0.0)continue;
   float dens=smoothstep(0.52,0.9,fbm3(q*2.6+sd)+0.4*fbm3(q*7.0-sd*1.7+vec3(uTime*0.01)))*fall*fall;if(dens<0.002)continue;
   float lit=0.55+0.45*dot(normalize(q+1e-4),L);vec3 s=col*(lit+0.35)*dens;float k=dt/R;acc+=s*T*k*2.4;T*=exp(-dens*k*5.0);if(T<0.01)break;}}
 o=vec4(acc,T);}`;
/* ---- temporal AA: reproject the previous frame through the unjittered VP, clamp to the current neighbourhood ---- */
const TAA_FS = `#version 300 es
precision highp float;precision highp int;
in vec2 vUV;uniform sampler2D uCur,uHist,uDepth,uVol;uniform mat4 uPrevVP;uniform vec3 uCam,uRight,uUp,uFwd;
#ifdef TILES
uniform vec3 uAxis;
#define AXIS uAxis
#else
#define AXIS uFwd
#endif
uniform vec2 uTan,uRes;uniform float uBlend,uVolOn;
out vec4 o;
vec3 cur(vec2 uv){vec3 c=texture(uCur,uv).rgb;if(uVolOn>0.5){vec4 v=texture(uVol,uv);c=c*v.a+v.rgb;}return c;}
void main(){vec2 uv=vUV;vec3 c=cur(uv);
 vec2 n=uv*2.0-1.0;vec3 rd=normalize(uFwd+uRight*n.x*uTan.x+uUp*n.y*uTan.y);float w=exp2(texture(uDepth,uv).r*${LF})-1.0;vec3 wp=uCam+rd*(w/max(dot(rd,AXIS),1e-3));
 vec4 pc=uPrevVP*vec4(wp,1.0);if(pc.w<=0.0){o=vec4(c,1.0);return;}vec2 puv=pc.xy/pc.w*0.5+0.5;if(any(lessThan(puv,vec2(0.0)))||any(greaterThan(puv,vec2(1.0)))){o=vec4(c,1.0);return;}
 vec3 hist=texture(uHist,puv).rgb;vec2 px=1.0/uRes;vec3 mn=c,mx=c;
 for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){if(i==0&&j==0)continue;vec3 s=cur(uv+vec2(float(i),float(j))*px);mn=min(mn,s);mx=max(mx,s);}
 hist=clamp(hist,mn-0.02,mx+0.02);o=vec4(mix(c,hist,uBlend),1.0);}`;
