/* ---- camera-facing billboard (corona) ---- */
const BILL_VS=`#version 300 es
precision highp float;layout(location=0) in vec2 aUV;uniform mat4 uVP;uniform vec3 uCenter,uRight,uUp;uniform float uSize;out vec2 vUV;out float vFz;
void main(){vec3 p=uCenter+uRight*aUV.x*uSize+uUp*aUV.y*uSize;vUV=aUV;gl_Position=uVP*vec4(p,1.0);${LOGZ}}`;
const CORONA_FS=`#version 300 es
precision highp float;in vec2 vUV;in float vFz;uniform float uTime;uniform vec3 uTint;out vec4 o;
${GL_NOISE}
void main(){${FDEPTH}float r=length(vUV);float a=atan(vUV.y,vUV.x);float rays=fbm3(vec3(a*3.0,r*3.0-uTime*0.15,uTime*0.05))*fbm3(vec3(a*9.0+uTime*0.1,r*2.0,3.0));
 float g=exp(-r*6.0)*1.6+rays*exp(-r*3.2)*1.4+exp(-r*2.2)*0.25;vec3 col=mix(vec3(1.0,0.45,0.1),vec3(1.0,0.85,0.6),exp(-r*4.0))*g*uTint;o=vec4(col*smoothstep(1.0,0.6,r),1.0);}`;
/* ---- points: dust, sparks, creature glow ---- */
const PT_VS=`#version 300 es
precision highp float;precision highp int;
layout(location=0) in vec3 aBase;layout(location=1) in vec4 aSeed;layout(location=2) in vec3 aCol;
uniform mat4 uVP;uniform vec3 uCam,uOff,uCamMod;uniform float uTime,uPR;uniform int uMode;out float vA;out vec3 vCol;out float vFz;
void main(){vec3 p;float sz;vCol=vec3(0.8,0.85,1.0);
 if(uMode==0){float B=90.0;p=mod(aSeed.xyz*B-uCamMod,B)-B*0.5;sz=0.12+aSeed.w*0.15;float dc=length(p);vA=(1.0-smoothstep(28.0,45.0,dc))*0.5;}
 else if(uMode==1){p=aBase+uOff+vec3(sin(uTime*1.3+aSeed.x*9.0),cos(uTime*1.1+aSeed.y*7.0),sin(uTime*0.9+aSeed.z*5.0))*0.6;float fl=step(0.6,fract(sin(uTime*(3.0+aSeed.w*9.0)+aSeed.x*50.0)*4.0));sz=0.5+aSeed.w*0.6;vA=fl*1.5;vCol=vec3(1.0,0.75,0.4);}
 else if(uMode==2){p=aBase+uOff;sz=1.4;vA=1.4;vCol=aCol;}
 else if(uMode==3){p=aBase+uOff;sz=0.3+aSeed.w*0.9;vA=aSeed.w*0.9;vCol=aCol;}
 else if(uMode==5){p=aBase+uOff;sz=aSeed.x;vA=aSeed.w;vCol=aCol;}   // mode 5: boost debris and sparks (Phase 5D): world size in aSeed.x, alpha in aSeed.w
 else{p=aBase+uOff;vA=1.0;vCol=aCol;} // mode 4: distant stars of other sectors, constant pixel size
 vec4 cp=uVP*vec4(p,1.0);gl_Position=cp;gl_PointSize=uMode==4?aSeed.x:clamp(sz*uPR/max(cp.w,0.1),1.0,48.0);${LOGZ}}`;
const PT_FS=`#version 300 es
precision highp float;in float vA;in vec3 vCol;out vec4 o;
void main(){vec2 c=gl_PointCoord*2.0-1.0;float r=dot(c,c);if(r>1.0)discard;float a=exp(-r*3.5)*vA;o=vec4(vCol*a,a);}`;
