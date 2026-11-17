/* ---------------- CPU noise ---------------- */
function hash3(x,y,z){const n=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453123;return n-Math.floor(n);}
function vn3(x,y,z){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);let fx=x-ix,fy=y-iy,fz=z-iz;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);fz=fz*fz*(3-2*fz);
  const l=(a,b,t)=>a+(b-a)*t;const c00=l(hash3(ix,iy,iz),hash3(ix+1,iy,iz),fx),c10=l(hash3(ix,iy+1,iz),hash3(ix+1,iy+1,iz),fx),c01=l(hash3(ix,iy,iz+1),hash3(ix+1,iy,iz+1),fx),c11=l(hash3(ix,iy+1,iz+1),hash3(ix+1,iy+1,iz+1),fx);
  return l(l(c00,c10,fy),l(c01,c11,fy),fz);}
function fbm3(x,y,z,o){let v=0,a=0.5,s=0;for(let i=0;i<o;i++){v+=a*vn3(x,y,z);s+=a;x=x*2.03+1.7;y=y*1.97+9.1;z=z*2.01+4.3;a*=0.5;}return v/s;}

