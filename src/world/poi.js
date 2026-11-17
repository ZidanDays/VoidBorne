/* ---- particles ---- */
function uploadPoints(pt){const vao=gl.createVertexArray();gl.bindVertexArray(vao);const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,pt.a,pt.dynamic?gl.DYNAMIC_DRAW:gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,40,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,40,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,3,gl.FLOAT,false,40,28);gl.bindVertexArray(null);pt.vao=vao;pt.vbo=vb;}
function freePoints(pt){try{gl.deleteVertexArray(pt.vao);gl.deleteBuffer(pt.vbo);}catch(e){}const i=GLR.points.indexOf(pt);if(i>=0)GLR.points.splice(i,1);}
function makePoints(n,baseFn,dynamic=false){const a=new Float32Array(n*10);for(let i=0;i<n;i++){const b=baseFn(i);a.set([b[0],b[1],b[2],rnd(),rnd(),rnd(),rnd(),1,1,1],i*10);}
  const pt={a,n,dynamic,vao:null,vbo:null};uploadPoints(pt);GLR.points.push(pt);return pt;}
const dust=makePoints(1600,()=>[0,0,0]);const sparks=makePoints(sparkPos.length,i=>sparkPos[i]);
/* ---- points of interest for HUD/radar ---- */
// Phase 5C: descriptive names and POI subtitles are getters, so they follow the current language (procedural names stay as they are)
for(const s of secrets)Object.defineProperty(s,'name',{get(){return t('name.'+(s.awake?'monolithAwake':s.kind));},configurable:true});
const POI=[];for(const p of planets){POI.push({name:p.name,get sub(){return t('cls.p'+p.type);},ptype:p.type,pos:p.pos,r:p.r,kind:'planet'});for(const m of p.moons)POI.push({name:m.name,get sub(){return t('cls.moon');},get pos(){return m.pos;},r:m.r,kind:'moon'});} // getter: moon positions are reassigned every frame
for(const w of wrecks)POI.push({name:w.name,get sub(){return t(w.big?'poi.wreckBig':'poi.wreck');},pos:w.pos,r:w.rad,kind:'wreck',ref:w});
POI.push({name:station.name,get sub(){return t('cls.station');},pos:station.pos,r:station.rad,kind:'station',ref:station});
POI.push({name:STAR.name,get sub(){return t('cls.star');},pos:STAR.pos,r:STAR.r,kind:'star'});
for(const s of secrets)if(!s.inside)POI.push({get name(){return s.name;},get sub(){return t('poi.anomaly');},pos:s.pos,r:s.rad,kind:'secret',ref:s,hidden:true});
for(const l of landmarks)POI.push({name:l.name,get sub(){return t('cls.'+l.kind);},pos:l.pos,r:l.kind==='blackhole'?l.Rs*3:60,kind:'landmark',ref:l,hidden:true});
const DISCOVERABLE=[...wrecks.map(w=>({name:w.name,ref:w,pos:()=>w.pos,rad:()=>w.rad+60})),{name:station.name,ref:station,pos:()=>station.pos,rad:()=>station.rad+80},
  {get name(){return t('disc.minnows');},ref:MINN,pos:()=>MINN.nearest||[1e9,0,0],rad:()=>60},{get name(){return t('disc.leviathans');},ref:{get found(){return whales.some(w=>w.found);},set found(v){whales[0].found=v;}},pos:()=>whales.reduce((b,w)=>len(sub(w.pos,player.pos))<len(sub(b,player.pos))?w.pos:b,[1e9,0,0]),rad:()=>160},
  {get name(){return t('disc.medusae');},ref:medusae,pos:()=>medusae.nearest||[1e9,0,0],rad:()=>50},...secrets.map(s=>({get name(){return s.name;},ref:s,pos:()=>s.pos,rad:()=>s.rad})),...landmarks.map(l=>({name:l.name,ref:l,pos:()=>l.pos,rad:()=>l.rad}))];
