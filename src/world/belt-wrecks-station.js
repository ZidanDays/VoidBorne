/* ---- asteroid belt & ring rocks (orbital instances computed on GPU) ---- */
const astMeshes=[0,1,2].map(k=>asteroidMesh(k+1));
function orbitalInst(n,R0,R1,ySpread,omegaK,sclMin,sclMax){const a=new Float32Array(n*INSTA);for(let i=0;i<n;i++){const o=i*INSTA;const R=rr(R0,R1);a[o]=R;a[o+1]=rnd()*TAU;a[o+2]=omegaK*Math.pow(2000/R,1.5);a[o+3]=rr(-ySpread,ySpread);const ax=rdir();a[o+4]=ax[0];a[o+5]=ax[1];a[o+6]=ax[2];a[o+7]=rr(0.05,0.6)*(rnd()<0.5?1:-1);a[o+8]=Math.pow(rnd(),2)*(sclMax-sclMin)+sclMin;a[o+9]=rnd();}return a;}
const BELT={R0:(planets[2].orbit+planets[3].orbit)/2-150,R1:(planets[2].orbit+planets[3].orbit)/2+150,q:qaxis([1,0,0],rr(-0.1,0.1)),ySpread:90};
const beltItems=astMeshes.map(m=>makeMesh(m,orbitalInst(Math.ceil(CFG.ASTEROID_COUNT/3),BELT.R0,BELT.R1,BELT.ySpread,0.004,0.8,9),'a'));
const ringedP=planets.find(p=>p.ring);
const ringItems=astMeshes.map(m=>makeMesh(m,orbitalInst(Math.ceil(CFG.RING_ROCKS/3),ringedP.ring.in,ringedP.ring.out,ringedP.r*0.012,0.02,0.4,2.2),'a'));
/* ---- free-space position helper ---- */
function freeSpot(minR,maxR,margin){for(let k=0;k<200;k++){const p=scl(rdir(),rr(minR,maxR));let ok=len(p)>STAR.r+600;for(const pl of planets){if(len(sub(p,pl.pos))<pl.r*3+margin)ok=false;}const rad=Math.hypot(p[0],p[2]);if(rad>BELT.R0-200&&rad<BELT.R1+200&&Math.abs(p[1])<300)ok=false;if(ok)return p;}return scl(rdir(),maxR);}
/* ---- wrecks ---- */
const wrecks=[];const debrisMB=debrisMeshes();const debrisInst=[[],[],[]];const sparkPos=[];
for(let i=0;i<CFG.WRECK_COUNT;i++){const big=i===0;const ship=genShip(big);const pos=big?freeSpot(900,1600,300):freeSpot(700,4300,250);
  if(CFG.BAKE_AO){bakeAO(ship.hull,big?48:36,0.7);if(big)bakeAO(ship.interior,40,0.8);}
  const w={name:shipName(),pos,ship,big,axis:rdir(),rate:big?0.0025:rr(0.01,0.04),ph:rnd()*TAU,q:qid(),items:[],rad:ship.rad,found:false};
  w.items.push({mesh:makeMesh(ship.hull,single(pos,qid(),1,[1,1,1]),'q',true),mat:0});
  w.items.push({mesh:makeMesh(ship.panels,single(pos,qid(),1,[1,1,1]),'q',true),mat:1});
  w.items.push({mesh:makeMesh(ship.lights,single(pos,qid(),1,[1,1,1],rnd()*10),'q',true),mat:3});
  if(big){w.items.push({mesh:makeMesh(ship.interior,single(pos,qid(),1,[1,1,1]),'q',true),mat:7});
    if(CFG.BREACH_MARKER&&ship.marker)w.items.push({mesh:makeMesh(ship.marker,single(pos,qid(),1,[1,1,1],2),'q',true),mat:8});w.artifact={mesh:makeMesh(ship.artifact.mb,single(pos,qid(),1.8,[0.3,0.9,1.0]),'q',true),local:ship.artifact.p,found:false,name:'the Hollow Seed'};}
  for(let k=0;k<CFG.DEBRIS_PER_WRECK;k++){const d=add(pos,scl(rdir(),rr(ship.rad*0.5,ship.rad*2.2)));const ax=rdir();debrisInst[k%3].push(d,[ax[0],ax[1],ax[2],rr(0.1,0.8)],rr(0.6,1.7),[1,1,1],rnd());}
  for(let k=0;k<30;k++)sparkPos.push(add(pos,scl(rdir(),rr(ship.rad*0.3,ship.rad*1.4))));
  wrecks.push(w);}
function packQ(list){const n=list.length/5;const a=new Float32Array(n*INST);for(let i=0;i<n;i++)instQ(a,i,list[i*5],list[i*5+1],list[i*5+2],list[i*5+3],list[i*5+4]);return a;}
const debrisItems=debrisMB.map((m,k)=>({mesh:makeMesh(m,packQ(debrisInst[k]),'q'),mat:0}));
/* ---- station ---- */
const station=(()=>{const g=genStation();if(CFG.BAKE_AO)bakeAO(g.hull,48,0.7);const pos=freeSpot(2000,3200,700);const base=qaxis(rdir(),rr(0.2,0.8));
  return{name:nameWord(2)+' Ring',pos,base,q:base,R:g.R,r:g.r,rad:g.R+g.r+20,found:false,items:[{mesh:makeMesh(g.hull,single(pos,base,1,[1,1,1]),'q',true),mat:0},{mesh:makeMesh(g.lights,single(pos,base,1,[1,1,1],3),'q',true),mat:3}]};})();
