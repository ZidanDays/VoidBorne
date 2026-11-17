/* ---------------- procedural names ---------------- */
const SYL=['ka','ve','ry','lon','thu','ser','mi','ra','dos','ix','al','tor','ne','phi','on','ul','bra','zen','ara','kos','ith','mor','sa','quel','ty','ome','gar','nis','vor','eli'];
const cap=s=>s[0].toUpperCase()+s.slice(1);
function nameWord(n=2+(rnd()*2|0)){let s='';for(let i=0;i<n;i++)s+=pick(SYL);return cap(s);}
const ROMAN=['I','II','III','IV','V','VI','VII','VIII'];
function planetName(i){return nameWord()+(rnd()<0.5?' '+ROMAN[i]:'');}
function shipName(){return pick(['ISV','MV','DSS','CSS','RV','HMV'])+' '+nameWord()+(rnd()<0.4?' '+pick(['Dawn','Vigil','Lantern','Pilgrim','Hollow','Meridian']):'');}
