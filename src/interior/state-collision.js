/* ---------------- state, persistence ---------------- */
function saveInterior(){PROG.w0={power:INT.power,sealed:INT.sealedOpen,read:Object.keys(INT.read)};saveSoon();}
function powerOn(silent){INT.power=true;const a=panelInd.mesh.inst;a[8]=0.1;a[9]=0.95;a[10]=0.25;const s=DOORS.vault.strip.mesh.inst;s[8]=0.15;s[9]=0.9;s[10]=0.3;
  if(!silent){toast(t('toast.power'));sfxPowerOn(add(W0.pos,qrot(W0.q,PANEL.p)));saveInterior();}startEngHum();}
{const w=PROG.w0;if(w){if(w.power)powerOn(true);if(w.sealed){INT.sealedOpen=true;DOORS.vault.open=DOORS.vault.target=1;}for(const id of(w.read||[]))INT.read[id]=true;updatePadGlow();}}
// the artifact only counts as discovered once the vault seal has been released
for(const d of DISCOVERABLE)if(d.ref===secrets[3]){d.rad=()=>INT.sealedOpen?12:-1;}
const doorWorld=d=>add(W0.pos,qrot(W0.q,[d.bx+DOOR_X,(DOOR_TOP+DECK)/2,d.slide*d.open]));
function localPlayer(){return qrot(qconj(W0.q),sub(player.pos,W0.pos));}
function playerInDoorway(d){const lp=localPlayer();return Math.abs(lp[0]-(d.bx+DOOR_X))<0.3+PLAYER_R+0.2&&Math.abs(lp[2])<DOOR_HW+PLAYER_R&&lp[1]>DECK-1&&lp[1]<DOOR_TOP+PLAYER_R;}
/* ---------------- collision: sphere vs (optionally y-rotated) boxes, in hull-local space ---------------- */
function interiorCollide(){if(!player.inside)return;const w=W0;const iq=qconj(w.q);
  for(let pass=0;pass<2;pass++)for(const c of INT.colliders){const lp=qrot(iq,sub(player.pos,w.pos));let cx=c.c[0],cy=c.c[1],cz=c.c[2];if(c.door)cz+=c.door.slide*c.door.open;
    let rx=lp[0]-cx,ry=lp[1]-cy,rz=lp[2]-cz;if(Math.abs(rx)>c.h[0]+PLAYER_R+3||Math.abs(ry)>c.h[1]+PLAYER_R+3||Math.abs(rz)>c.h[2]+PLAYER_R+3)continue;
    let ca=1,sa=0;if(c.ang){ca=Math.cos(c.ang);sa=Math.sin(c.ang);const x=ca*rx-sa*rz,z=sa*rx+ca*rz;rx=x;rz=z;}   // into the box frame (inverse of the y-rotation used to build it)
    const qx=clamp(rx,-c.h[0],c.h[0]),qy=clamp(ry,-c.h[1],c.h[1]),qz=clamp(rz,-c.h[2],c.h[2]);let dx=rx-qx,dy=ry-qy,dz=rz-qz;const dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
    let n,pen;if(dist>=PLAYER_R)continue;if(dist>1e-6){n=[dx/dist,dy/dist,dz/dist];pen=PLAYER_R-dist;}
    else{const ex=c.h[0]-Math.abs(rx),ey=c.h[1]-Math.abs(ry),ez=c.h[2]-Math.abs(rz);if(ex<=ey&&ex<=ez){n=[Math.sign(rx)||1,0,0];pen=ex+PLAYER_R;}else if(ey<=ez){n=[0,Math.sign(ry)||1,0];pen=ey+PLAYER_R;}else{n=[0,0,Math.sign(rz)||1];pen=ez+PLAYER_R;}}
    if(c.ang){const x=ca*n[0]+sa*n[2],z=-sa*n[0]+ca*n[2];n=[x,n[1],z];}
    bounce(qrot(w.q,n),pen);}}
