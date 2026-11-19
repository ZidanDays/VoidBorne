/* =====================================================================
   SHADER LIBRARY
   ===================================================================== */
const GL_NOISE = `
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float hash13(vec3 p3){p3=fract(p3*0.1031);p3+=dot(p3,p3.zyx+31.32);return fract((p3.x+p3.y)*p3.z);}
vec3 hash33(vec3 p3){p3=fract(p3*vec3(0.1031,0.1030,0.0973));p3+=dot(p3,p3.yxz+33.33);return fract((p3.xxy+p3.yxx)*p3.zyx);}
float vn3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x),mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*vn3(p);p=p*2.07+vec3(3.1,7.7,1.3);a*=0.5;}return v;}
float fbm3(vec3 p){float v=0.0,a=0.5;for(int i=0;i<3;i++){v+=a*vn3(p);p=p*2.07+vec3(3.1,7.7,1.3);a*=0.5;}return v;}
vec2 voro(vec3 p){vec3 i=floor(p),f=fract(p);float d1=9.0,d2=9.0;
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){vec3 g=vec3(float(x),float(y),float(z));vec3 o=hash33(i+g);float d=length(g+o-f);if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}
 return vec2(d1,d2);}
vec3 bump3(vec3 p){return vec3(vn3(p),vn3(p+vec3(5.2,1.3,9.1)),vn3(p+vec3(11.7,3.3,2.2)))-0.5;}`;
// Far plane for logarithmic depth. Sector streaming needs a large range; log depth keeps ~1e-6 relative precision.
const FAR = 4.0e6,
  LF = Math.log2(FAR + 1).toFixed(6);
const LOGZ = `gl_Position.z=(2.0*log2(max(1e-6,gl_Position.w+1.0))/${LF}-1.0)*gl_Position.w;vFz=1.0+gl_Position.w;`;
const FDEPTH_IN = `in float vFz;`;
const FDEPTH = `gl_FragDepth=log2(max(vFz,1.0))/${LF};`;
const FS_VS = `#version 300 es
out vec2 vUV;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUV=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
