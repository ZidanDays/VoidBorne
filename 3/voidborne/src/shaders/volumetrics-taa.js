/* ---- volumetric nebula pockets: raymarched against the resolved depth, output premultiplied rgb + transmittance ---- */
const VOL_FS = `#version 300 es
precision highp float;precision highp int;
in vec2 vUV;uniform sampler2D uDepth;uniform vec3 uCam,uRight,uUp,uFwd,uStar;uniform vec2 uTan;uniform float uTime;uniform int uN,uSteps;uniform vec4 uCloud[3];uniform vec4 uCloudCol[3];
out vec4 o;
${GL_NOISE}
void main(){vec2 n=vUV*2.0-1.0;vec3 rd=normalize(uFwd+uRight*n.x*uTan.x+uUp*n.y*uTan.y);
 float wmax=exp2(texture(uDepth,vUV).r*${LF})-1.0;float tmax=wmax/max(dot(rd,uFwd),1e-3);
 vec3 acc=vec3(0.0);float T=1.0;float jit=hash12(gl_FragCoord.xy+fract(uTime*7.0)*37.0);
 for(int c=0;c<3;c++){if(c>=uN)break;vec3 C=uCloud[c].xyz;float R=uCloud[c].w;vec3 ro=uCam-C;float b=dot(ro,rd);float cc=dot(ro,ro)-R*R;float h=b*b-cc;if(h<0.0)continue;h=sqrt(h);
  float t0=max(-b-h,0.0),t1=min(-b+h,tmax);if(t1<=t0)continue;float dt=(t1-t0)/float(uSteps);vec3 col=uCloudCol[c].rgb;float sd=uCloudCol[c].w;vec3 L=normalize(uStar-C);
  for(int i=0;i<64;i++){if(i>=uSteps)break;float t=t0+(float(i)+jit)*dt;vec3 p=uCam+rd*t;vec3 q=(p-C)/R;float fall=1.0-dot(q,q);if(fall<=0.0)continue;
   float dens=smoothstep(0.52,0.9,fbm3(q*2.6+sd)+0.4*fbm3(q*7.0-sd*1.7+vec3(uTime*0.01)))*fall*fall;if(dens<0.002)continue;
   float lit=0.55+0.45*dot(normalize(q+1e-4),L);vec3 s=col*(lit+0.35)*dens;float k=dt/R;acc+=s*T*k*2.4;T*=exp(-dens*k*5.0);if(T<0.01)break;}}
 o=vec4(acc,T);}`;
/* ---- temporal AA: reproject the previous frame through the unjittered VP, clamp to the current neighbourhood ---- */
const TAA_FS = `#version 300 es
precision highp float;precision highp int;
in vec2 vUV;uniform sampler2D uCur,uHist,uDepth,uVol;uniform mat4 uPrevVP;uniform vec3 uCam,uRight,uUp,uFwd;uniform vec2 uTan,uRes;uniform float uBlend,uVolOn;
out vec4 o;
vec3 cur(vec2 uv){vec3 c=texture(uCur,uv).rgb;if(uVolOn>0.5){vec4 v=texture(uVol,uv);c=c*v.a+v.rgb;}return c;}
void main(){vec2 uv=vUV;vec3 c=cur(uv);
 vec2 n=uv*2.0-1.0;vec3 rd=normalize(uFwd+uRight*n.x*uTan.x+uUp*n.y*uTan.y);float w=exp2(texture(uDepth,uv).r*${LF})-1.0;vec3 wp=uCam+rd*(w/max(dot(rd,uFwd),1e-3));
 vec4 pc=uPrevVP*vec4(wp,1.0);if(pc.w<=0.0){o=vec4(c,1.0);return;}vec2 puv=pc.xy/pc.w*0.5+0.5;if(any(lessThan(puv,vec2(0.0)))||any(greaterThan(puv,vec2(1.0)))){o=vec4(c,1.0);return;}
 vec3 hist=texture(uHist,puv).rgb;vec2 px=1.0/uRes;vec3 mn=c,mx=c;
 for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){if(i==0&&j==0)continue;vec3 s=cur(uv+vec2(float(i),float(j))*px);mn=min(mn,s);mx=max(mx,s);}
 hist=clamp(hist,mn-0.02,mx+0.02);o=vec4(mix(c,hist,uBlend),1.0);}`;
