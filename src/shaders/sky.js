/* ---- sky bake: nebula, milky way, galaxies, faint stars -> cubemap ---- */
const SKYBAKE_FS=`#version 300 es
precision highp float;precision highp int;
in vec2 vUV;uniform int uFace;uniform vec3 uSeed;uniform vec3 uBand;uniform vec3 uGal[6];uniform float uGalSize[6];uniform float uNeb;
out vec4 o;
${GL_NOISE}
void main(){float sc=vUV.x*2.0-1.0,tc=vUV.y*2.0-1.0;vec3 d;
 if(uFace==0)d=vec3(1,-tc,-sc);else if(uFace==1)d=vec3(-1,-tc,sc);else if(uFace==2)d=vec3(sc,1,tc);else if(uFace==3)d=vec3(sc,-1,-tc);else if(uFace==4)d=vec3(sc,-tc,1);else d=vec3(-sc,-tc,-1);
 d=normalize(d);
 vec3 p=d*2.2+uSeed;
 vec3 q=vec3(fbm(p+vec3(1.7,9.2,3.1)),fbm(p+vec3(8.3,2.8,5.4)),fbm(p+vec3(4.1,6.6,1.9)));
 vec3 r=vec3(fbm(p+3.0*q+vec3(1.7,9.2,3.1)),fbm(p+3.0*q+vec3(8.3,2.8,5.4)),fbm(p+3.0*q+vec3(4.1,6.6,1.9)));
 float f=fbm(p+3.5*r);
 float big=smoothstep(0.46,0.8,fbm(d*1.1+uSeed*0.3));
 float m1=smoothstep(0.42,0.78,f);float m2=smoothstep(0.48,0.82,fbm(p*1.6+13.0+2.5*q));float m3=smoothstep(0.5,0.86,fbm(p*0.8+27.0+2.0*r));
 vec3 col=(m1*vec3(0.5,0.1,0.45)*f*0.75+m2*vec3(0.05,0.46,0.5)*1.25+m3*vec3(0.62,0.34,0.08)*1.1)*big;
 col=pow(max(col,0.0),vec3(1.35))*uNeb*1.3+vec3(0.012,0.012,0.03)*smoothstep(0.35,0.9,f)*big*uNeb;
 float band=exp(-pow(dot(d,uBand),2.0)*22.0);float dens=band*(0.5+0.9*fbm(d*6.0+uSeed*0.7));
 float lane=smoothstep(0.52,0.68,fbm(d*9.0+uSeed*1.3))*band;
 col+=(vec3(0.55,0.6,0.78)*dens*0.28-vec3(0.08,0.07,0.06)*lane)*(0.6+0.4*uNeb);
 col=max(col,0.0);
 for(int i=0;i<6;i++){float ca=dot(d,uGal[i]);if(ca>0.95){vec3 t=d-uGal[i]*ca;vec3 b1=normalize(cross(uGal[i],vec3(0.3,1.0,0.2)));vec3 b2=cross(uGal[i],b1);
  float rr=length(t)/uGalSize[i];float ang=atan(dot(t,b2),dot(t,b1));float arm=0.5+0.5*cos(2.0*ang-3.5*log(rr+0.04));
  float br=exp(-rr*2.8)*(0.3+0.7*arm*smoothstep(0.08,0.4,rr))+exp(-rr*14.0)*1.2;col+=vec3(0.85,0.78,0.95)*br*0.38*smoothstep(1.6,0.9,rr);}}
 vec3 sp=d*260.0;vec3 c=floor(sp);float h=hash13(c);if(h>0.55){vec3 s=c+0.5+(hash33(c)-0.5)*0.7;float dd=length(sp-s);float mag=pow(hash13(c+7.0),4.0);col+=vec3(0.9,0.9,1.0)*exp(-dd*dd*14.0)*(0.08+mag*0.5);}
 o=vec4(col,1.0);}`;
/* ---- live sky: cubemap + bright twinkling stars ---- */
const SKY_FS=`#version 300 es
precision highp float;precision highp int;
in vec2 vUV;uniform samplerCube uCube;uniform vec3 uRight,uUp,uFwd;uniform vec2 uTan,uJit;uniform float uTime;uniform vec3 uStarDir;
out vec4 o;
${GL_NOISE}
float stars(vec3 d,float scale,float dens,float k,out vec3 col){vec3 p=d*scale;vec3 c=floor(p);float h=hash13(c);col=vec3(0.0);if(h>dens)return 0.0;
 vec3 sp=c+0.5+(hash33(c+3.0)-0.5)*0.6;float dist=length(p-sp);float mag=pow(hash13(c+7.0),3.0);
 float tw=0.72+0.28*sin(uTime*(1.5+hash13(c+9.0)*5.0)+hash13(c+11.0)*100.0);
 float temp=hash13(c+5.0);col=mix(vec3(1.0,0.72,0.5),vec3(0.62,0.74,1.0),temp);
 return exp(-dist*dist*k/(0.25+mag))*(0.25+mag*3.0)*tw;}
void main(){vec2 n=vUV*2.0-1.0-uJit;vec3 d=normalize(uFwd+uRight*n.x*uTan.x+uUp*n.y*uTan.y);
 vec3 col=texture(uCube,d).rgb;
 vec3 sc;float s=stars(d,38.0,0.42,70.0,sc);col+=sc*s;s=stars(d,95.0,0.5,60.0,sc);col+=sc*s*0.7;s=stars(d,180.0,0.55,55.0,sc);col+=sc*s*0.4;
 o=vec4(col,1.0);}`;
