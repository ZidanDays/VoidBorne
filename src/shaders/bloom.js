/* ---- post ---- */
const BRIGHT_FS=`#version 300 es
precision highp float;in vec2 vUV;uniform sampler2D uTex;out vec4 o;
void main(){vec3 c=texture(uTex,vUV).rgb;float l=dot(c,vec3(0.3,0.59,0.11));o=vec4(c*smoothstep(0.55,1.1,l),1.0);}`;
const BLUR_FS=`#version 300 es
precision highp float;in vec2 vUV;uniform sampler2D uTex;uniform vec2 uDir;out vec4 o;
void main(){float w[5]=float[5](0.227,0.194,0.121,0.054,0.016);vec3 c=texture(uTex,vUV).rgb*w[0];for(int i=1;i<5;i++){vec2 off=uDir*float(i)*1.5;c+=texture(uTex,vUV+off).rgb*w[i];c+=texture(uTex,vUV-off).rgb*w[i];}o=vec4(c,1.0);}`;
