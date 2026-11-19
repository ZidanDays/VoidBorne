/* ---- generic instanced mesh ---- */
const MESH_VS = `#version 300 es
precision highp float;precision highp int;
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNor;layout(location=2) in vec3 aCol;
layout(location=3) in vec3 iPos;layout(location=4) in vec4 iQ;layout(location=5) in float iS;layout(location=6) in vec3 iCol;layout(location=7) in float iP;
uniform mat4 uVP;uniform float uTime;uniform int uAnim;uniform vec3 uOff; // uOff = mesh anchor - camera (floating origin, computed in float64 on the CPU)
out vec3 vW;out vec3 vN;out vec3 vL;out vec3 vC;out float vP;out float vFz;
#ifdef ULTRA
out vec3 vNo;flat out vec4 vQ;   // Phase 6B 'ultra': object-space normal + instance rotation for the triplanar panel detail
#endif
vec3 qrot(vec4 q,vec3 v){vec3 t=2.0*cross(q.xyz,v);return v+q.w*t+cross(q.xyz,t);}
vec3 axisRot(vec3 v,vec3 ax,float a){float c=cos(a),s=sin(a);return v*c+cross(ax,v)*s+ax*dot(ax,v)*(1.0-c);}
void main(){vec3 p=aPos;vec3 n=aNor;vec4 q=iQ;
 if(uAnim==1){float sp=iP;float t=clamp(-p.x,0.0,1.0);p.x-=t*t*sp*0.5;p.y+=sin(uTime*14.0+iP*3.0-p.x*4.0)*0.06*t;}
 else if(uAnim==2){float w=sin(p.x*5.5-uTime*1.3+iP);p.y+=w*0.035*(0.3+0.7*clamp(-p.x+0.3,0.0,1.0));p.z+=cos(p.x*4.0-uTime*0.9+iP)*0.02;n=normalize(n+vec3(0.0,w*0.2,0.0));}
 else if(uAnim==3||uAnim==7){float pu=uAnim==7?sin(iP):sin(uTime*(1.2+iP*0.1)+iP);  // 7: bell phase integrated on the CPU (home medusae)
 if(p.y>-0.05){float k=1.0+0.13*pu*(1.0-max(p.y,0.0));p.xz*=k;p.y*=1.0-0.08*pu;}else{float s=-p.y;p.xz+=vec2(sin(uTime*0.8+iP+s*1.4),cos(uTime*0.6+iP*1.3+s*1.1))*0.1*s;}}
 else if(uAnim==4){vec3 ax=normalize(q.xyz+vec3(1e-4,0,0));float a=uTime*q.w;p=axisRot(p,ax,a);n=axisRot(n,ax,a);q=vec4(0,0,0,1);}
 vec3 wp=qrot(q,p*iS)+iPos+uOff;
 vW=wp;vN=normalize(qrot(q,n));vL=aPos;vC=aCol*iCol;vP=iP;
#ifdef ULTRA
 vNo=n;vQ=q;
#endif
 gl_Position=uVP*vec4(wp,1.0);${LOGZ}}`;
const AST_VS = `#version 300 es
precision highp float;precision highp int;
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNor;layout(location=2) in vec3 aCol;
layout(location=3) in vec4 iOrb;layout(location=4) in vec4 iAx;layout(location=5) in vec2 iSS;
uniform mat4 uVP;uniform float uTime;uniform mat3 uPlane;uniform vec3 uCenter;
out vec3 vW;out vec3 vN;out vec3 vL;out vec3 vC;out float vP;out float vFz;
#ifdef ULTRA
out vec3 vNo;flat out vec4 vQ;
#endif
vec3 axisRot(vec3 v,vec3 ax,float a){float c=cos(a),s=sin(a);return v*c+cross(ax,v)*s+ax*dot(ax,v)*(1.0-c);}
void main(){float ang=iOrb.y+uTime*iOrb.z;vec3 op=vec3(cos(ang)*iOrb.x,iOrb.w,sin(ang)*iOrb.x);
 vec3 ax=normalize(iAx.xyz);float a=uTime*iAx.w+iSS.y*6.28;vec3 p=axisRot(aPos,ax,a)*iSS.x;vec3 n=axisRot(aNor,ax,a);
 vec3 wp=uPlane*(op+p)+uCenter;vW=wp;vN=normalize(uPlane*n);vL=aPos*(1.0+iSS.y);vC=aCol;vP=iSS.y;
#ifdef ULTRA
 vNo=aNor;vQ=vec4(0.0,0.0,0.0,1.0);
#endif
 gl_Position=uVP*vec4(wp,1.0);${LOGZ}}`;
const MESH_FS = (fd) => `#version 300 es
precision highp float;precision highp int;
in vec3 vW;in vec3 vN;in vec3 vL;in vec3 vC;in float vP;${fd ? FDEPTH_IN : ''}
uniform vec3 uCam,uFwd,uStar,uSunCol;uniform float uTime,uLamp,uCalm;uniform int uMat;   // uCalm = reduce motion and flashing (Phase 5C)
uniform vec4 uStar2;uniform vec3 uSunCol2;   // Phase 6C: second star (w > 0 = on)
uniform vec4 uLightPos[16];uniform vec4 uLightCol[16];uniform int uNumLights;
#ifdef ULTRA
in vec3 vNo;flat in vec4 vQ;uniform sampler2D uPanel;uniform float uPanelOn,uSparkleAA,uGGX;   // Phase 6B 'ultra' (CFG.ULTRA_HULLS: panels + GGX, CFG.ULTRA_CREATURES: sparkle filter)
#endif
out vec4 o;
${GL_NOISE}
#ifdef ULTRA
vec3 qrotU(vec4 q,vec3 v){vec3 t=2.0*cross(q.xyz,v);return v+q.w*t+cross(q.xyz,t);}
// triplanar panel atlas (baked, mipmapped, anisotropic): r = height (panels, seams, greebles), gb = height gradient (0.5 = flat), a = grime
vec4 panelTri(vec3 p,vec3 n,out vec3 g){vec3 w=pow(abs(n),vec3(4.0));w/=dot(w,vec3(1.0));
 vec4 tx=texture(uPanel,p.yz),ty=texture(uPanel,p.zx),tz=texture(uPanel,p.xy);vec2 gx=tx.gb*2.0-1.0,gy=ty.gb*2.0-1.0,gz=tz.gb*2.0-1.0;
 g=w.x*vec3(0.0,gx.x,gx.y)+w.y*vec3(gy.y,0.0,gy.x)+w.z*vec3(gz.x,gz.y,0.0);return tx*w.x+ty*w.y+tz*w.z;}
// panel lines + greebles on a hull: bends N (world space, already flipped for back faces) and returns (height, grime)
vec2 hullDetail(inout vec3 N,float sc,float k){vec3 no=normalize(vNo);vec3 g;vec4 pt=panelTri(vL*sc,no,g);vec3 gt=g-no*dot(g,no);
 N=normalize(N-qrotU(vQ,gt)*k*(gl_FrontFacing?1.0:-1.0));return pt.ra;}
#endif
vec3 shade(vec3 base,vec3 N,float spec,float gloss,float amb,float sunK){
 vec3 L=normalize(uStar-vW);vec3 V=normalize(uCam-vW);float diff=max(dot(N,L),0.0)*sunK;
 vec3 H=normalize(L+V);
#ifdef ULTRA
 float al2=2.0/(mix(8.0,140.0,gloss)+2.0);float nh=max(dot(N,H),0.0);float dd=nh*nh*(al2-1.0)+1.0;   // GGX lobe (same core width as the old Blinn exponent, longer tail)
 float sp=uGGX>0.5?(al2/dd)*(al2/dd)*(1.0+3.0*pow(1.0-max(dot(V,H),0.0),5.0))*spec*sunK:pow(nh,mix(8.0,140.0,gloss))*spec*sunK;   // normalised to the old peak, Schlick-style Fresnel rise at grazing angles
#else
 float sp=pow(max(dot(N,H),0.0),mix(8.0,140.0,gloss))*spec*sunK;
#endif
 vec3 col=base*(diff*uSunCol+amb*vec3(0.22,0.28,0.42))+uSunCol*sp*diff;
 if(uStar2.w>0.0){vec3 L2=normalize(uStar2.xyz-vW);float d2=max(dot(N,L2),0.0)*sunK;vec3 H2=normalize(L2+V);   // Phase 6C: second star (Blinn-Phong lobe in every preset)
  col+=base*d2*uSunCol2+uSunCol2*pow(max(dot(N,H2),0.0),mix(8.0,140.0,gloss))*spec*sunK*d2;}
 if(uLamp>0.0){vec3 d=vW-uCam;float dist=length(d);d/=dist;float cone=smoothstep(0.86,0.985,dot(d,uFwd));float att=uLamp*cone*3.0/(1.0+0.03*dist*dist);
  col+=base*vec3(1.0,0.95,0.85)*att*max(dot(N,-d),0.0)+vec3(1.0,0.95,0.85)*att*pow(max(dot(N,normalize(-d+V)),0.0),40.0)*spec*0.5;}
 for(int i=0;i<16;i++){if(i>=uNumLights)break;if(uLightCol[i].w<=0.0)continue;vec3 dl=uLightPos[i].xyz-vW;float dd=length(dl);float a=uLightCol[i].w/(1.0+uLightPos[i].w*dd*dd);col+=base*uLightCol[i].rgb*a*(max(dot(N,dl/dd),0.0)*0.8+0.2);}
 return col;}
void main(){${fd ? FDEPTH : ''}vec3 N=normalize(vN);bool front=gl_FrontFacing;if(!front)N=-N;vec3 V=normalize(uCam-vW);float fres=pow(1.0-max(dot(N,V),0.0),4.0);
 vec3 col;float alpha=1.0;
 if(uMat==0||uMat==10){float sx=fract(vL.x*0.45),sa=fract(atan(vL.z,vL.y)*1.27+vL.x*0.1);float seam=min(smoothstep(0.0,0.025,sx)+smoothstep(0.08,0.055,sx),1.0)*min(smoothstep(0.0,0.03,sa)+smoothstep(0.09,0.06,sa),1.0);
  float sx2=fract(vL.x*1.8+0.5),sa2=fract(sa*4.0);float seam2=min(smoothstep(0.0,0.03,sx2)+smoothstep(0.08,0.05,sx2),1.0)*min(smoothstep(0.0,0.04,sa2)+smoothstep(0.1,0.06,sa2),1.0);
  float wear=fbm3(vL*0.35);float scratch=smoothstep(0.72,0.8,vn3(vL*vec3(0.25,4.0,4.0)));float burn=smoothstep(0.6,0.8,fbm3(vL*0.12+7.0));
  float rust=smoothstep(0.56,0.74,fbm3(vL*0.5+vec3(vP*0.3,3.0,1.0)))*(0.6+0.4*(1.0-seam));float bare=smoothstep(0.7,0.86,vn3(vL*1.7+3.0))*(1.0-rust);
  vec3 base=vC*(0.7+0.5*wear)*(0.55+0.45*seam)*(0.86+0.14*seam2)*(1.0-0.5*scratch)*(1.0-0.75*burn);
#ifdef ULTRA
  if(uPanelOn>0.5){vec2 pd=hullDetail(N,uMat==10?0.55:0.21,0.6);base*=(0.8+0.2*pd.x)*(1.0-0.3*pd.y);}
#endif
  base=mix(base,vec3(0.42,0.2,0.08)*(0.7+0.6*vn3(vL*7.0)),rust*0.85);base=mix(base,vec3(0.72,0.74,0.78),bare*0.4);
  float spc=mix(0.45,0.06,rust)+bare*0.45,gls=mix(0.5,0.15,rust)+bare*0.3;
  if(uMat==10){base=vC*(0.8+0.4*vn3(vL*9.0));N=normalize(N+bump3(vL*6.0)*0.3);spc=0.9;gls=0.8;}
  float sunK=front?1.0:0.0;col=shade(base,N,spc,gls,front?0.06:0.01,sunK);}
 else if(uMat==1){vec2 c=fract(vL.xz*1.2);float frame=1.0-min(smoothstep(0.0,0.04,c.x)*smoothstep(0.0,0.04,c.y)*smoothstep(1.0,0.96,c.x)*smoothstep(1.0,0.96,c.y),1.0);
  float broken=step(0.86,hash12(floor(vL.xz*1.2)));vec3 base=mix(vec3(0.06,0.1,0.32),vec3(0.55,0.55,0.6),frame);base=mix(base,vec3(0.03),broken*(1.0-frame));
  col=shade(base,N,mix(0.9,0.2,broken),0.85,0.06,1.0);}
 else if(uMat==2){N=normalize(N+bump3(vL*2.5)*0.4);float cr=fbm3(vL*1.3);vec3 base=vC*(0.55+0.8*cr);col=shade(base,N,0.15,0.2,0.05,1.0);}
 else if(uMat==3){float ph=vP+hash13(floor(vL*0.37))*37.0;float f=smoothstep(0.3,0.45,sin(uTime*(1.2+fract(ph*7.3)*4.0)+ph*23.0));float jit=step(0.15,vn3(vec3(uTime*9.0,ph*31.0,0.0)));if(uCalm>0.5){f=0.45+0.1*sin(uTime*0.6+ph*5.0);jit=1.0;}col=vC*(f*jit*2.2+0.08);}
 else if(uMat==4){float head=smoothstep(-0.7,0.5,vL.x);col=vC*(0.25+2.2*head)*(0.8+0.3*sin(uTime*9.0+vP*5.0));alpha=0.35+0.65*head;}
 else if(uMat==5){vec3 base=mix(vec3(0.1,0.13,0.2),vec3(0.3,0.33,0.38),smoothstep(0.0,-0.1,vL.y))*(0.8+0.4*vn3(vL*vec3(15.0,40.0,40.0)));
  col=shade(base,N,0.4,0.5,0.08,1.0);float s=vn3(vL*vec3(28.0,70.0,70.0)+vP);float gl=smoothstep(0.77,0.86,s)*(0.55+0.45*sin(uTime*2.0+vL.x*9.0+vP));
#ifdef ULTRA
  if(uSparkleAA>0.5)gl=mix(gl,0.035,smoothstep(0.3,0.9,length(fwidth(vL*vec3(28.0,70.0,70.0)))));   // far away the sparkle field fades to its average instead of shimmering
#endif
 col+=vec3(0.25,0.9,1.0)*gl*1.8+fres*vec3(0.1,0.3,0.4)*0.4;}
 else if(uMat==6||uMat==13){float pu=uMat==13?0.5+0.5*sin(vP):0.5+0.5*sin(uTime*(1.2+vP*0.1)+vP);col=vC*(0.25+fres*1.6)+vec3(0.4,0.6,1.0)*0.35*pu*(vL.y>-0.05?1.0:0.4);alpha=vL.y>-0.05?0.12+0.55*fres:0.22;col*=(vL.y>-0.05?1.0:0.8);}
 else if(uMat==7){float gr=fbm3(vL*0.6);vec3 base=vC*(0.45+0.6*gr);N=normalize(N+bump3(vL*3.0)*0.15);col=shade(base,N,0.3,0.4,0.015,0.0);}
 else if(uMat==8){float pu=0.5+0.5*sin(uTime*2.5+vP);col=vC*(0.9+1.6*pu)*(0.6+0.6*vn3(vL*6.0+uTime*0.5))+fres*vec3(1.0)*1.2;}
 else if(uMat==9){col=shade(vec3(0.012),N,1.2,0.97,0.02,1.0)+fres*vec3(0.05,0.06,0.1);}
 else if(uMat==12){col=shade(vec3(0.012),N,1.2,0.97,0.02,1.0)+fres*vec3(0.05,0.06,0.1);float gl=smoothstep(0.9,0.97,fract(vL.y*0.9+0.3*sin(vL.z*0.7)))+smoothstep(0.93,0.98,fract(vL.z*0.55));col+=vec3(0.25,0.85,1.0)*gl*(0.6+0.4*sin(uTime*1.3+vL.y*0.25))*2.0+vec3(0.1,0.35,0.45)*fres*(0.6+0.4*sin(uTime*0.7));}
 else if(uMat==11){float along=clamp(vL.y/2200.0,0.0,1.0);float a=pow(1.0-along,2.2)*pow(abs(dot(N,V)),1.4)*(uCalm>0.5?0.5:0.85+0.15*sin(uTime*40.0+vL.y*0.05));col=vC*a*2.4;alpha=a;}
 else{col=shade(vC,N,0.3,0.4,0.05,1.0);}
 o=vec4(col,alpha);}`;
