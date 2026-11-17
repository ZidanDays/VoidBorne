/* ---- secrets ---- */
const secrets=[];
{const a=rnd()*TAU,Rm=(BELT.R0+BELT.R1)/2;const bp=qrot(BELT.q,[Math.cos(a)*Rm,0,Math.sin(a)*Rm]);
 const bm=new MB();bm.sphere(2,[1,0.55,0.2],xfq(Q0,[0,1.5,0]),1,8);
 secrets.push({kind:'beacon',name:'a distress beacon',pos:bp,rad:40,found:false,items:[{mesh:makeMesh(beaconMesh(),single(bp,qid(),1,[1,1,1]),'q'),mat:0},{mesh:makeMesh(bm,single(bp,qid(),1,[1,1,1]),'q'),mat:8}]});
 const ice=planets.find(p=>p.type===2)||planets[2];const md=rdir();const mp=add(ice.pos,scl(md,ice.r*1.9));const mm=new MB();mm.box(3,12,27,[1,1,1]);
 secrets.push({kind:'monolith',name:'the Monolith',pos:mp,rad:40,found:false,spin:true,items:[{mesh:makeMesh(mm,single(mp,qid(),1,[1,1,1]),'q',true),mat:9}]});
 const outer=planets[planets.length-1];const pp=add(outer.pos,scl(rdir(),outer.r*2.6));
 secrets.push({kind:'probe',name:'a derelict probe',pos:pp,rad:30,found:false,spin:true,items:[{mesh:makeMesh(probeMesh(),single(pp,qid(),1,[1,1,1]),'q',true),mat:10},{mesh:makeMesh(probePanels(),single(pp,qid(),1,[1,1,1]),'q',true),mat:1}]});
 secrets.push({kind:'artifact',name:'the Hollow Seed',pos:[0,0,0],rad:12,found:false,inside:true});}
/* ---- volumetric nebula pockets (raymarched in post against the depth buffer) ---- */
const clouds=[];
{const mono=secrets[1].pos,ice=planets.find(p=>p.type===2)||planets[2];const away=norm(sub(mono,ice.pos));
 clouds.push({c:add(mono,scl(away,160)),R:230,col:[0.12,0.46,0.5],seed:rr(0,50)});
 clouds.push({c:add(station.pos,scl(rdir(),900)),R:320,col:[0.55,0.3,0.1],seed:rr(0,50)});
 clouds.push({c:freeSpot(1200,3600,500),R:270,col:[0.3,0.1,0.36],seed:rr(0,50)});}
/* ---- rare landmarks: a lensing black hole and a pulsar, placed near the edge of the charted region ---- */
const landmarks=[];
{const dir=rdir();let bp=scl(dir,4650);for(let k=0;k<40&&planets.some(p=>len(sub(bp,p.pos))<p.r*4+400);k++)bp=scl(rdir(),4650);
 const n=rdir();const t1=norm(cross(n,Math.abs(n[1])<0.9?[0,1,0]:[1,0,0]));
 const BH={kind:'blackhole',name:nameWord(2)+'\'s Eye',pos:bp,Rs:40,n,t1,seed:rr(0,30),rad:1600,found:false};if(CFG.BLACK_HOLE)landmarks.push(BH);
 let pp=scl(norm(add(scl(dir,-1),scl(rdir(),0.5))),4550);for(let k=0;k<40&&planets.some(p=>len(sub(pp,p.pos))<p.r*4+400);k++)pp=scl(rdir(),4550);
 const pm=pulsarMeshes();const PS={kind:'pulsar',name:nameWord(2)+' Pulsar',pos:pp,axis:rdir(),tilt:qaxis(rdir(),rr(0.3,0.9)),period:1.3,ph:rr(0,6),rad:1500,found:false,pulse:0,
  items:[{mesh:makeMesh(pm.core,single(pp,qid(),22,[0.8,0.9,1.0],5),'q',true),mat:8},{mesh:makeMesh(pm.beams,single(pp,qid(),1,[1,1,1]),'q',true),mat:11}]};if(CFG.PULSAR)landmarks.push(PS);}
