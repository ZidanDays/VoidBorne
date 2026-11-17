/* =====================================================================
   MESH GENERATORS
   ===================================================================== */
class MB{
  constructor(){this.v=[];this.i=[];this.r=0;}
  vert(p,n,c){this.v.push(p[0],p[1],p[2],n[0],n[1],n[2],c[0],c[1],c[2]);const l=len(p);if(l>this.r)this.r=l;return this.v.length/9-1;}
  param(nu,nv,fn,opt={}){const xf=opt.xf,color=opt.color||[1,1,1],base=this.v.length/9,e=1e-3;
    for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){const u=i/nu,v=j/nv,p=fn(u,v);
      const du=sub(fn(Math.min(1,u+e),v),fn(Math.max(0,u-e),v)),dv=sub(fn(u,Math.min(1,v+e)),fn(u,Math.max(0,v-e)));
      let n=cross(du,dv);const l=len(n);n=l>1e-10?scl(n,1/l):[0,1,0];let pp=p,nn=n;
      if(xf){pp=add(qrot(xf.q,p),xf.t);nn=qrot(xf.q,n);}this.vert(pp,nn,typeof color==='function'?color(u,v,p):color);}
    for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){if(opt.skip&&opt.skip((i+0.5)/nu,(j+0.5)/nv))continue;const a=base+i*(nv+1)+j,b=a+nv+1;this.i.push(a,b,a+1,a+1,b,b+1);}}
  tri(a,b,c,col,xf){let n=norm(cross(sub(b,a),sub(c,a)));let pts=[a,b,c];if(xf){pts=pts.map(p=>add(qrot(xf.q,p),xf.t));n=qrot(xf.q,n);}
    const i0=this.vert(pts[0],n,col);this.vert(pts[1],n,col);this.vert(pts[2],n,col);this.i.push(i0,i0+1,i0+2);}
  quad(a,b,c,d,col,xf){this.tri(a,b,c,col,xf);this.tri(a,c,d,col,xf);}
  box(w,h,d,col,xf){const x=w/2,y=h/2,z=d/2;const P=[[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]];
    for(const f of[[0,3,2,1],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[0,4,7,3]])this.quad(P[f[0]],P[f[1]],P[f[2]],P[f[3]],col,xf);}
  cyl(r0,r1,h,segs,col,xf){this.param(segs,1,(u,v)=>{const a=u*TAU,r=r0+(r1-r0)*v;return[r*Math.cos(a),v*h,r*Math.sin(a)];},{color:col,xf});}
  sphere(r,col,xf,sq=1,n=12){this.param(n*2,n,(u,v)=>{const th=u*TAU,ph=v*PI;return[r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*sq,r*Math.sin(ph)*Math.sin(th)];},{color:col,xf});}
  torus(R,r,col,xf,n=24,m=10){this.param(n,m,(u,v)=>{const a=u*TAU,b=v*TAU;return[(R+r*Math.cos(b))*Math.cos(a),r*Math.sin(b),(R+r*Math.cos(b))*Math.sin(a)];},{color:col,xf});}
  // lathe around local x axis; prof = array of [x, radius]; outward normals
  lathe(prof,segs,col,opt={}){const n=prof.length-1;this.param(segs,n*(opt.sub||1),(u,v)=>{const t=v*n,k=Math.min(n-1,Math.floor(t)),f=t-k;const x=lerp(prof[k][0],prof[k+1][0],f),r=lerp(prof[k][1],prof[k+1][1],f)*(opt.rf?opt.rf(u,v):1);const a=u*TAU;return[x,r*Math.cos(a),r*Math.sin(a)];},{color:col,skip:opt.skip,xf:opt.xf});}
  merge(o){const base=this.v.length/9;for(const x of o.v)this.v.push(x);for(const x of o.i)this.i.push(x+base);this.r=Math.max(this.r,o.r);}
}
const Q0=qid();
const xfq=(q,t)=>({q,t});
// icosphere with optional displacement; normals from faces
function icoMesh(subdiv,disp,col=[1,1,1]){const t=(1+Math.sqrt(5))/2;let V=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(norm);
  let F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let s=0;s<subdiv;s++){const cache=new Map();const mid=(a,b)=>{const k=a<b?a*100000+b:b*100000+a;if(cache.has(k))return cache.get(k);const m=norm(add(V[a],V[b]));V.push(m);cache.set(k,V.length-1);return V.length-1;};
    const nf=[];for(const[a,b,c]of F){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);nf.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}F=nf;}
  const P=V.map(d=>disp?scl(d,disp(d)):d);const N=P.map(()=>[0,0,0]);
  for(const[a,b,c]of F){const n=cross(sub(P[b],P[a]),sub(P[c],P[a]));for(const k of[a,b,c]){N[k][0]+=n[0];N[k][1]+=n[1];N[k][2]+=n[2];}}
  const mb=new MB();for(let k=0;k<P.length;k++)mb.vert(P[k],norm(N[k]),typeof col==='function'?col(V[k]):col);for(const f of F)mb.i.push(f[0],f[1],f[2]);return mb;}
function icoPositions(sub){const m=icoMesh(sub,null);const pos=[];for(let k=0;k<m.v.length;k+=9)pos.push(m.v[k],m.v[k+1],m.v[k+2]);return{pos,idx:m.i};}
