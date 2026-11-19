/* ---- god rays: sun mask, then radial blur ---- */
const MASK_FS = `#version 300 es
precision highp float;in vec2 vUV;uniform sampler2D uTex;uniform vec2 uSunUV,uRes;out vec4 o;
void main(){vec3 c=texture(uTex,vUV).rgb;float l=dot(c,vec3(0.3,0.59,0.11));vec2 asp=vec2(uRes.x/uRes.y,1.0);float d=length((vUV-uSunUV)*asp);
 float m=smoothstep(0.72,1.0,l)*exp(-d*d*30.0)+smoothstep(0.92,1.0,l)*exp(-d*d*8.0)*0.6;o=vec4(vec3(m),1.0);}`;
const RAYS_FS = `#version 300 es
precision highp float;precision highp int;in vec2 vUV;uniform sampler2D uTex;uniform vec2 uSunUV;uniform float uDensity,uDecay;uniform int uN;out vec4 o;
void main(){vec2 d=(vUV-uSunUV)*uDensity/float(uN);float illum=1.0;vec3 acc=vec3(0.0);vec2 p=vUV;for(int i=0;i<32;i++){if(i>=uN)break;p-=d;acc+=texture(uTex,p).rgb*illum;illum*=uDecay;}o=vec4(acc/float(uN)*2.0,1.0);}`;
/* ---- composite: volumetrics, black-hole lens, bloom, rays, flare, grading ---- */
const COMP_FS = `#version 300 es
precision highp float;precision highp int;
in vec2 vUV;uniform sampler2D uTex,uBloom,uRays,uVol,uMask,uDepth;uniform samplerCube uCube;uniform vec2 uSunUV,uRes,uTan;uniform float uSunVis,uAberr,uTime,uBloomK,uSat,uLift,uRayK,uVolOn;uniform vec3 uTint,uRight,uUp,uFwd,uCam;uniform mat4 uVP;
uniform vec4 uBH;uniform vec3 uBHpos,uBHn,uBHt;uniform float uBHr,uBHon,uBHq,uWarp,uFlare;
uniform sampler2D uCrack,uRefl;uniform vec4 uVisor,uScan,uScanD,uIntro;uniform float uFxQ,uCalm;   // Phase 5B: visor (refl,fog,crack,curve), scanner, intro (open,blur,fade)
out vec4 o;
${GL_NOISE}
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
float sceneW(vec2 uv){return exp2(texture(uDepth,uv).r*${LF})-1.0;}
vec3 blurS(vec2 uv,float r){vec2 a=vec2(uRes.y/uRes.x,1.0);vec3 c=vec3(0.0);
 if(uFxQ<0.5){for(int i=0;i<4;i++){float an=float(i)*1.5708+0.785;c+=texture(uTex,uv+vec2(cos(an),sin(an))*r*a).rgb;}return c*0.25;}
 for(int i=0;i<8;i++){float an=float(i)*2.39996;float rr=r*sqrt((float(i)+0.5)/8.0);c+=texture(uTex,uv+vec2(cos(an),sin(an))*rr*a).rgb;}return c*0.125;}
float scanMask(float d){return step(uScanD.x-uScanD.y*1.35,d)*step(d,uScanD.x+uScanD.y*1.35);}
float lumAt(vec2 uv){return dot(texture(uTex,uv).rgb,vec3(0.3,0.59,0.11));}
void main(){vec2 uv=vUV;vec2 vq=vUV-0.5;
 if(uVisor.w>0.0)uv=0.5+vq*(1.0-uVisor.w*dot(vq,vq)*0.1);   // visor glass curvature: sample slightly inward near the edges
 float crk=0.0;if(uVisor.z>0.0){crk=texture(uCrack,vUV).r;vec2 cg=vec2(texture(uCrack,vUV+vec2(0.004,0.0)).r-crk,texture(uCrack,vUV+vec2(0.0,0.007)).r-crk);uv+=cg*0.005*uVisor.z;}   // refraction along the cracks
 vec2 dc=uv-0.5;float r2=dot(dc,dc);vec2 ca=dc*(0.004+uAberr*0.03)*(0.5+r2*3.0)*(1.0-uCalm);   // reduce motion: no chromatic aberration
 vec3 col=vec3(texture(uTex,uv+ca).r,texture(uTex,uv).g,texture(uTex,uv-ca).b);
 if(uVolOn>0.5){vec4 v=texture(uVol,uv);col=col*v.a+v.rgb;}
 if(uBHon>0.5){vec2 asp=vec2(uRes.x/uRes.y,1.0);vec2 pb=(uv-uBH.xy)*asp;float rb=length(pb);
  if(rb<uBH.z){vec2 n=uv*2.0-1.0;vec3 rd=normalize(uFwd+uRight*n.x*uTan.x+uUp*n.y*uTan.y);vec3 ro=-uBHpos;float dBH=length(uBHpos);
   if(sceneW(uv)>dBH*0.9){float along=dot(-ro,rd);vec3 cp=ro+rd*along;float b=length(cp);float Rs=uBHr;
    float shadow=smoothstep(2.6*Rs,2.42*Rs,b);float bend=uBHq>0.5?clamp(2.0*Rs/max(b,0.3*Rs)*1.7,0.0,1.25):0.0;
    vec3 nb=-normalize(cp+vec3(1e-4));vec3 rdb=normalize(rd*cos(bend)+nb*sin(bend));
    vec4 pc=uVP*vec4(uCam+rdb*5.0e4,1.0);vec3 bg=texture(uTex,uv).rgb;if(uBHq>0.5){bg=texture(uCube,rdb).rgb*0.85;if(pc.w>0.0){vec2 bu=pc.xy/pc.w*0.5+0.5;if(all(greaterThanEqual(bu,vec2(0.0)))&&all(lessThanEqual(bu,vec2(1.0))))bg=texture(uTex,bu).rgb;}}
    vec3 disk=vec3(0.0);float da=0.0;float dn=dot(rdb,uBHn);
    if(abs(dn)>1e-4){float t=dot(-cp,uBHn)/dn;if(t>0.0){vec3 hp=cp+rdb*t;float r=length(hp)/Rs;if(r>2.1&&r<7.5){vec3 t2=cross(uBHn,uBHt);float ang=atan(dot(hp,t2),dot(hp,uBHt));
      float bands=fbm3(vec3(r*2.2,ang*1.5-uTime*(2.5/r),uBH.w))*0.75+0.25;vec3 tang=cross(uBHn,hp/max(length(hp),1e-4));float dop=mix(0.4,2.4,smoothstep(-1.0,1.0,dot(tang,-rd)));
      float temp=smoothstep(7.5,2.1,r);vec3 dcol=mix(vec3(1.0,0.42,0.1),vec3(1.0,0.92,0.78),temp*temp);da=smoothstep(2.1,2.5,r)*smoothstep(7.5,6.2,r)*bands;disk=dcol*da*dop*2.4*(0.4+temp);}}}
    float ring=exp(-pow((b-2.62*Rs)/(0.1*Rs),2.0))*1.6;
    vec3 lensed=mix(bg,disk,clamp(da*0.92,0.0,1.0))+vec3(1.0,0.8,0.6)*ring;vec3 bh=mix(lensed,vec3(0.0),shadow);
    col=mix(bh,col,smoothstep(uBH.z*0.8,uBH.z,rb));}}}
 col+=texture(uBloom,uv).rgb*uBloomK;
 if(uRayK>0.0)col+=texture(uRays,uv).rgb*uRayK;
 if(uSunVis>0.0){vec2 asp=vec2(uRes.x/uRes.y,1.0);vec2 s=(uSunUV-0.5)*asp;vec2 p=dc*asp;float ds=length(p-s);
  col+=vec3(1.0,0.8,0.5)*exp(-ds*9.0)*0.9*uSunVis;
  for(int i=0;i<6;i++){float k=-0.35-float(i)*0.3;vec2 g=s*k;float rad=0.03+float(i)*0.012;float d=length(p-g);float ring=smoothstep(rad,rad*0.6,d)*0.12+smoothstep(0.004,0.0,abs(d-rad))*0.08;
   vec3 gc=mix(vec3(0.4,0.6,1.0),vec3(1.0,0.5,0.6),float(i)/5.0);col+=gc*ring*uSunVis*smoothstep(0.0,0.15,d+0.1);}
  float h=length(p-s*-1.0);col+=vec3(0.5,0.3,0.7)*smoothstep(0.02,0.0,abs(h-0.32))*0.25*uSunVis;}
 if(uWarp>0.0){vec3 acc=vec3(0.0);for(int i=1;i<=12;i++){float k=1.0-float(i)*0.045*uWarp;acc+=texture(uTex,0.5+dc*k).rgb;}col=mix(col,acc/12.0*1.6,uWarp*0.85);
  float a=atan(dc.y,dc.x);float streak=pow(max(0.0,sin(a*90.0+hash12(vec2(floor(a*45.0),0.0))*6.28)),40.0)*smoothstep(0.02,0.3,sqrt(r2));col+=vec3(0.55,0.75,1.0)*streak*uWarp*1.5+vec3(0.15,0.25,0.5)*uWarp*uWarp;}
 col+=vec3(1.0,0.85,0.6)*uFlare*0.9;
 float fogA=0.0;if(uVisor.y>0.0){vec2 fp=(vUV-vec2(0.5,-0.1))*vec2(uRes.x/uRes.y,1.0);float sh=1.0-smoothstep(0.2,1.0,length(fp));   // breath fog, strongest at the bottom centre of the glass
  vec3 np=vec3(vUV*vec2(uRes.x/uRes.y,1.0)*6.0,uTime*0.07);float nz=uFxQ<0.5?vn3(np):fbm3(np);fogA=uVisor.y*smoothstep(0.2,0.65,nz*0.8+sh*0.75)*sh;}
 float blA=max(fogA*0.9,uIntro.y);
 if(blA>0.01){vec3 bl=blurS(uv,0.003+blA*0.014)+texture(uBloom,uv).rgb*uBloomK;col=mix(col,bl,clamp(blA*1.3,0.0,1.0));col=mix(col,col*0.8+vec3(0.16,0.18,0.2),fogA*0.55);}
 col*=1.0-smoothstep(0.25,0.95,r2)*0.5;
 col=aces(col*1.15);col=pow(col,vec3(0.94));
 col*=uTint;float lum=dot(col,vec3(0.3,0.59,0.11));col=mix(vec3(lum),col,uSat);col=max((col-uLift)/(1.0-uLift),0.0);
 if(uVisor.x>0.0){vec2 ru=0.5+vq*(0.93+0.12*dot(vq,vq));float rf=texture(uRefl,vec2(ru.x,1.0-ru.y)).r;float em=smoothstep(0.06,0.3,dot(vq,vq));   // faint HUD reflection + glass highlights
  vec2 asp2=vec2(uRes.x/uRes.y,1.0);float arc=exp(-pow((length((vUV-vec2(0.1,1.15))*asp2)-0.62)/0.018,2.0))*smoothstep(0.35,0.75,vUV.y)+exp(-pow((length((vUV-vec2(0.95,-0.2))*asp2)-0.5)/0.03,2.0))*0.6*(1.0-smoothstep(0.0,0.4,vUV.y));
  col+=vec3(0.55,0.78,1.0)*(rf*0.065*em+arc*0.025)*uVisor.x;}
 if(crk>0.003)col=mix(col,vec3(0.86,0.93,1.0),clamp(crk*0.6*uVisor.z,0.0,0.7));
 if(uScanD.w>0.5){vec2 asp=vec2(uRes.x/uRes.y,1.0);vec2 pq=(vUV-uScan.xy)*asp;float rq=length(pq);float RR=uScan.z;   // scanner: contour + sweep on the target
  if(rq<RR*1.3+0.03){float e=0.0,m0=0.0;
   if(uScanD.z<0.5){vec2 tx=1.0/vec2(textureSize(uDepth,0));float c0=sceneW(vUV);m0=scanMask(c0);   // opaque targets: depth-range mask, edge = mask change (+ depth creases on medium/high)
    float sl=sceneW(vUV-vec2(tx.x,0.0)),sr=sceneW(vUV+vec2(tx.x,0.0)),su=sceneW(vUV+vec2(0.0,tx.y)),sd=sceneW(vUV-vec2(0.0,tx.y));
    e=max(max(abs(m0-scanMask(sl)),abs(m0-scanMask(sr))),max(abs(m0-scanMask(su)),abs(m0-scanMask(sd))));
    if(uFxQ>0.5)e=max(e,m0*smoothstep(0.015,0.06,abs(sl+sr+su+sd-4.0*c0)/max(c0,1.0)));}
   else{vec2 tc=1.5/uRes;float fall=1.0-smoothstep(RR*0.9,RR*1.2,rq);float c0=lumAt(vUV);m0=smoothstep(0.03,0.12,c0)*fall;   // glowing (transparent) targets: luminance edges
    float gx=lumAt(vUV+vec2(tc.x,0.0))-lumAt(vUV-vec2(tc.x,0.0)),gy=lumAt(vUV+vec2(0.0,tc.y))-lumAt(vUV-vec2(0.0,tc.y));e=smoothstep(0.03,0.12,length(vec2(gx,gy)))*fall;}
   float pr=uScan.w;vec3 sc=vec3(0.45,0.95,1.0);float swY=uScan.y+RR*(1.0-2.0*(pr<1.0?pr:fract(uTime*0.4)));float sw=exp(-pow((vUV.y-swY)*uRes.y/3.0,2.0));
   float grid=step(0.5,fract(gl_FragCoord.y*0.25));col+=sc*m0*(0.05+0.05*grid)*(pr<1.0?1.0:0.6);col=mix(col,sc,clamp(e*0.85,0.0,1.0));col+=sc*sw*m0*(pr<1.0?0.6:0.25);
   float ang=atan(pq.y,pq.x)/6.28318+0.5;float ring=1.0-smoothstep(0.0,1.6/uRes.y,abs(rq-RR*1.15-0.01));float ticks=step(0.06,fract(ang*4.0+uTime*0.05));
   col+=sc*ring*ticks*0.35+sc*(1.0-smoothstep(0.0,2.0/uRes.y,abs(rq-RR*1.15-0.018)))*step(ang,pr)*0.7;}}
 if(uIntro.x<0.999){vec2 iq=(vUV-0.5)*vec2(uRes.x/uRes.y,1.0)*2.0;float op=uIntro.x;float W=1.9+3.2*op;float H=1.25*sqrt(max(0.0,1.0-iq.x*iq.x/(W*W)))*op;float sf=0.05+0.4*(1.0-op);   // intro: eyelids
  float lid=1.0-smoothstep(H-sf,H,abs(iq.y));col*=lid;col=mix(col,col*vec3(1.0,0.62,0.55),(1.0-op)*0.4);}
 col*=uIntro.z;
 col+=(hash12(gl_FragCoord.xy+fract(uTime)*91.0)-0.5)*0.035*uIntro.z;
 o=vec4(col,1.0);}`;
