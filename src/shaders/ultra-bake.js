/* =====================================================================
   'ULTRA' BAKE SHADERS (Phase 6B): two tileable textures baked at runtime, a strip per frame (render/ultra.js),
   then mipmapped and anisotropically filtered. Both store a height in r and its gradient in g/b (0.5 = flat), so the
   material shaders bend normals with one filtered fetch per triplanar plane: far away the mip average flattens the
   detail instead of letting it shimmer.
   ===================================================================== */
const ULTRA_BAKE_COMMON = `
float hashP(vec2 c,float P,float s){c=mod(c,P);return hash12(c+vec2(s*17.13,s*3.71));}
float vnP(vec2 p,float P,float s){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(hashP(i,P,s),hashP(i+vec2(1.0,0.0),P,s),f.x),mix(hashP(i+vec2(0.0,1.0),P,s),hashP(i+vec2(1.0,1.0),P,s),f.x),f.y);}
float fbmP(vec2 uv,float P,float s,int n){float v=0.0,a=0.5;for(int i=0;i<6;i++){if(i>=n)break;v+=a*vnP(uv*P,P,s+float(i));P*=2.0;a*=0.5;}return v;}`;
/* ---- hull panel atlas: r = height (panels at slightly different heights, bevelled seams, rivets, greeble boxes, vents),
   gb = gradient, a = grime. One tile = 1 uv; the mesh shader maps it to about 4.8 m of hull. ---- */
const PANEL_BAKE_FS = `#version 300 es
precision highp float;precision highp int;
in vec2 vUV;uniform float uTexel;out vec4 o;
${GL_NOISE}
${ULTRA_BAKE_COMMON}
float panelH(vec2 uv){uv=fract(uv);
 vec2 g=uv*4.0;vec2 c=floor(g);vec2 f=fract(g);float h0=hashP(c,4.0,1.0);
 // split some cells into 2x1 / 1x2 / 2x2 sub-panels
 vec2 sub=vec2(1.0);if(h0>0.55)sub=vec2(2.0,1.0);if(h0>0.75)sub=vec2(1.0,2.0);if(h0>0.9)sub=vec2(2.0);
 vec2 sf=f*sub;vec2 sc=floor(sf);vec2 lf=fract(sf);vec2 sz=0.25/sub;   // local coords in the sub-panel, its size in uv
 float id=hash12(c*7.0+sc*1.3+3.0);
 vec2 e2=min(lf,1.0-lf)*sz;float e=min(e2.x,e2.y);   // distance to the panel edge, uv
 float h=0.62+0.08*(id-0.5);   // each panel sits a little higher or lower
 h*=smoothstep(0.0012,0.0055,e);   // bevelled seam groove
 // rivets along the edges of most panels
 if(id>0.3){float sp=0.018;vec2 q=lf*sz;float along=e2.x<e2.y?q.y:q.x;float r=length(vec2(e-0.0085,(fract(along/sp)-0.5)*sp));h+=0.18*smoothstep(0.0028,0.0008,r);}
 // greeble: raised box, sometimes with vent slots
 if(id>0.78){vec2 q=abs(lf-0.5)*sz;vec2 bs=sz*vec2(0.28+0.12*hash12(c+sc+9.0),0.22+0.1*hash12(c+sc+4.0));float d=max(q.x-bs.x,q.y-bs.y);float box=smoothstep(0.0025,0.0,d);
  float vent=id>0.9?step(0.5,fract(lf.y*sub.y*28.0))*box*0.12:0.0;h+=box*0.22-vent;}
 // shallow stamped stripe on a few panels
 if(id<0.12){float s=abs(lf.y-0.5)*sz.y;h-=0.06*smoothstep(0.004,0.002,abs(s-0.012));}
 return h;}
void main(){vec2 uv=vUV;float e=uTexel;float h=panelH(uv);
 vec2 gr=vec2(panelH(uv+vec2(e,0.0))-panelH(uv-vec2(e,0.0)),panelH(uv+vec2(0.0,e))-panelH(uv-vec2(0.0,e)))/(2.0*e);
 float grime=fbmP(uv,6.0,11.0,5);float seamDirt=1.0-smoothstep(0.0,0.6,h);
 o=vec4(h,0.5+0.5*clamp(gr*0.004,-1.0,1.0),clamp(smoothstep(0.45,0.75,grime)*0.8+seamDirt*0.35,0.0,1.0));}`;
/* ---- detail noise for planets: r = fbm, gb = its gradient, a = a second, ridged field ---- */
const DETAIL_BAKE_FS = `#version 300 es
precision highp float;precision highp int;
in vec2 vUV;uniform float uTexel;out vec4 o;
${GL_NOISE}
${ULTRA_BAKE_COMMON}
float dH(vec2 uv){return fbmP(fract(uv),8.0,2.0,6);}
void main(){vec2 uv=vUV;float e=uTexel;float h=dH(uv);
 vec2 gr=vec2(dH(uv+vec2(e,0.0))-dH(uv-vec2(e,0.0)),dH(uv+vec2(0.0,e))-dH(uv-vec2(0.0,e)))/(2.0*e);
 float r=1.0-abs(fbmP(uv,6.0,23.0,5)*2.0-1.0);
 o=vec4(h,0.5+0.5*clamp(gr/40.0,-1.0,1.0),r*r);}`;
