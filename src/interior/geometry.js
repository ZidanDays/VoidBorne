
/* =====================================================================
   WRECK 0 INTERIOR (Phase 5A)
   Compartments separated by bulkheads with doorways, sliding doors, a power panel, a sealed vault
   and datapads. Everything is defined in hull-local coordinates (x runs along the hull, metres) and
   uses its own seeded RNG, so the world random stream and therefore every existing seed is unchanged.
   Goal chain: restore power -> release the sealed vault door -> reach the artifact.
   ===================================================================== */
const W0S=W0.ship,IL=W0S.L,IR=W0S.R;
const DECK=-IR*0.5+0.3;                 // top surface of the deck slab
const DOOR_HW=3,DOOR_TOP=1.5;           // doorway: |z| < 3, y from DECK to DOOR_TOP
const DOOR_X=-0.7,DOOR_SLIDE=6.6;       // door panels sit 0.7 m on the -x side of their bulkhead and slide +z
const PLAYER_R=1.5;
const ROOMS=[{id:'aft',x0:-62,x1:-30},{id:'hold',x0:-30,x1:3},{id:'eng',x0:3,x1:20},{id:'corr',x0:20,x1:26},{id:'lab',x0:26,x1:38},{id:'vault',x0:38,x1:62}];
const INT={colliders:[],doors:[],items:[],power:false,sealedOpen:false,entered:false,target:null,room:null,lampHinted:false,roomT:0,read:{}};
const irng=mkRng(hash32(CFG.SEED,0x5A,0,7));const irr=(a,b)=>a+irng()*(b-a);const ipick=a=>a[(irng()*a.length)|0];
const hullR=x=>profR(W0S,x/IL+0.5);
function box(c,h,opt){const b=Object.assign({c,h,ang:0},opt||{});INT.colliders.push(b);return b;}
/* ---------------- geometry ---------------- */
const roomMB=new MB(),METALC=[0.33,0.34,0.38],DARKC=[0.22,0.22,0.25];
function boxMesh(mb,c,size,col,ang){mb.box(size[0],size[1],size[2],col,xfq(ang?qaxis([0,1,0],ang):Q0,c));}
// bulkhead: a disc that fills the hull cross-section, with a doorway cut out, plus a door frame; colliders are 4 slabs around the doorway
for(const bx of BULKHEADS){const rv=hullR(bx)*0.985;
  roomMB.param(64,16,(u,v)=>{const a=u*TAU,r=v*rv;return[bx,r*Math.cos(a),r*Math.sin(a)];},{color:METALC,skip:(u,v)=>{const a=u*TAU,r=v*rv;const y=r*Math.cos(a),z=r*Math.sin(a);return Math.abs(z)<DOOR_HW+0.2&&y>DECK-0.4&&y<DOOR_TOP+0.25;}});
  const hh=(DOOR_TOP-DECK)/2,yc=(DOOR_TOP+DECK)/2;
  for(const s of[-1,1])boxMesh(roomMB,[bx,yc,s*(DOOR_HW+0.3)],[1.0,DOOR_TOP-DECK+0.6,0.6],DARKC);
  boxMesh(roomMB,[bx,DOOR_TOP+0.3,0],[1.0,0.6,DOOR_HW*2+1.2],DARKC);boxMesh(roomMB,[bx,DECK+0.05,0],[1.0,0.1,DOOR_HW*2],DARKC);
  const E=IR+2;box([bx,0,-(DOOR_HW+E)/2],[0.5,E,(E-DOOR_HW)/2]);box([bx,0,(DOOR_HW+E)/2],[0.5,E,(E-DOOR_HW)/2]);
  box([bx,(DOOR_TOP+E)/2,0],[0.5,(E-DOOR_TOP)/2,DOOR_HW]);box([bx,(DECK-E)/2,0],[0.5,(E+DECK)/2,DOOR_HW]);}
// service corridor between the 20 m and 26 m bulkheads: walls, ceiling, pipes
{const[x0,x1]=CORRIDOR,xc=(x0+x1)/2,lx=x1-x0,yc=(DOOR_TOP+DECK)/2,hy=DOOR_TOP-DECK;
  for(const s of[-1,1]){boxMesh(roomMB,[xc,yc,s*(DOOR_HW+0.25)],[lx,hy,0.5],METALC);box([xc,yc,s*(DOOR_HW+0.25)],[lx/2,hy/2,0.25]);
    for(let k=0;k<3;k++)roomMB.cyl(0.18,0.18,lx,6,DARKC,xfq(qaxis([0,0,1],-PI/2),[x0,DECK+1.2+k*1.6,s*(DOOR_HW-0.3)]));}
  boxMesh(roomMB,[xc,DOOR_TOP+0.25,0],[lx,0.5,DOOR_HW*2+1],METALC);box([xc,DOOR_TOP+0.25,0],[lx/2,0.25,DOOR_HW+0.5]);}
// crew quarters: bunk stacks along both walls
for(let k=0;k<3;k++){const x=-34-k*4.6;for(const s of[-1,1]){const z=s*6.2;boxMesh(roomMB,[x,DECK+1.2,z],[3.6,0.4,2.0],[0.3,0.28,0.26]);boxMesh(roomMB,[x,DECK+3.1,z],[3.6,0.4,2.0],[0.3,0.28,0.26]);
  for(const e of[-1,1])boxMesh(roomMB,[x+e*1.7,DECK+1.9,z],[0.2,3.8,0.2],DARKC);box([x,DECK+1.9,z],[1.8,1.9,1.0]);}}
// engineering: reactor column and the power console
const PANEL={p:[10,DECK+1.9,-6.2]};
{roomMB.cyl(2.0,2.0,9,20,[0.28,0.3,0.34],xfq(Q0,[11,DECK,6.6]));for(let k=0;k<4;k++)roomMB.torus(2.05,0.12,DARKC,xfq(Q0,[11,DECK+1.5+k*2.2,6.6]),24,6);box([11,DECK+4.5,6.6],[2.0,4.5,2.0]);
  boxMesh(roomMB,[10,DECK+1.0,-6.8],[2.6,2.0,1.2],[0.26,0.27,0.3]);boxMesh(roomMB,[10,DECK+2.3,-7.2],[2.6,1.4,0.3],DARKC);box([10,DECK+1.15,-6.9],[1.3,1.15,0.75]);}
// laboratory: two benches with specimen jars
for(const s of[-1,1]){const z=s*5.6;boxMesh(roomMB,[32,DECK+0.6,z],[4.6,1.2,1.6],[0.3,0.31,0.33]);box([32,DECK+0.6,z],[2.3,0.6,0.8]);
  for(let k=0;k<4;k++)roomMB.cyl(0.25,0.25,0.6,10,[0.4,0.5,0.45],xfq(Q0,[30.6+k*0.9,DECK+1.2,z+irr(-0.4,0.4)]));}
// vault: pedestal under the artifact
{const ap=W0S.artifact.p,yb=-hullR(ap[0])*0.95,top=ap[1]-2.5;roomMB.cyl(1.3,0.9,top-yb,16,DARKC,xfq(Q0,[ap[0],yb,ap[2]]));box([ap[0],(top+yb)/2,ap[2]],[1.2,(top-yb)/2,1.2]);}
// datapads on small stands (screens are separate emissive items so they can dim once read)
const PADS=[{room:'aft',pool:'ilog.crew',p:[-38,DECK,-3.4]},{room:'aft',pool:'ilog.crew',p:[-43.2,DECK,3.2]},{room:'eng',pool:'ilog.eng',p:[16.4,DECK,5.4]},{room:'lab',pool:'ilog.lab',p:[33.6,DECK,-5.6],onBench:true}];
const padScreens=new MB();
for(const pd of PADS){const top=pd.onBench?DECK+1.2:DECK+1.0;if(!pd.onBench){boxMesh(roomMB,[pd.p[0],DECK+0.5,pd.p[2]],[1.1,1.0,0.8],[0.25,0.26,0.29]);box([pd.p[0],DECK+0.5,pd.p[2]],[0.55,0.5,0.4]);}
  pd.s=[pd.p[0],top+0.04,pd.p[2]];boxMesh(padScreens,pd.s,[0.8,0.05,0.55],[0.25,1.0,0.5]);}
// crates from genShip become oriented box colliders
for(const c of W0S.crates)box(c.p,c.h,{ang:c.ang});
if(CFG.BAKE_AO)bakeAO(roomMB,44,0.6);
W0.items.push({mesh:makeMesh(roomMB,single(W0.pos,qid(),1,[1,1,1]),'q',true),mat:7});
const padItem={mesh:makeMesh(padScreens,single(W0.pos,qid(),1,[0.18,0.32,0.2],1),'q',true),mat:8};W0.items.push(padItem);
// power console indicator (red until power is restored)
const panelInd={mesh:(()=>{const m=new MB();boxMesh(m,[10,DECK+2.35,-7.0],[1.6,0.7,0.06],[1,1,1]);return makeMesh(m,single(W0.pos,qid(),1,[0.9,0.12,0.06],3),'q',true);})(),mat:8};W0.items.push(panelInd);
