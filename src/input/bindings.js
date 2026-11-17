/* ---- input settings and key bindings (Phase 5C): every keyboard action goes through BIND, so it can be remapped ---- */
const INPUT={get inv(){return(SETTINGS.invertY!=null?!!SETTINGS.invertY:CFG.INVERT_Y)?-1:1;},sens(k,d){const v=+SETTINGS[k];return clamp(isFinite(v)&&v>0?v:d,0.1,5);},
  get sMouse(){return this.sens('sensMouse',CFG.SENS_MOUSE);},get sTouch(){return this.sens('sensTouch',CFG.SENS_TOUCH);},get sPad(){return this.sens('sensPad',CFG.SENS_PAD);}};
const ACTIONS=[['fwd',['KeyW']],['back',['KeyS']],['left',['KeyA']],['right',['KeyD']],['up',['Space']],['down',['ControlLeft','ControlRight','KeyC']],['rollL',['KeyQ']],['rollR',['KeyE']],['boost',['ShiftLeft','ShiftRight']],
  ['lamp',['KeyF']],['interact',['KeyG']],['scan',['KeyV']],['map',['Tab']],['autopilot',['KeyT']],['codex',['KeyJ']],['photo',['KeyP']],['record',['KeyR']],['mute',['KeyM']],['hideui',['KeyH']],['fullscreen',['KeyO']],['debug',['Backquote']]];
const BIND={};function resetBinds(){for(const[a,d]of ACTIONS)BIND[a]=d.slice();}resetBinds();
if(SETTINGS.binds&&typeof SETTINGS.binds==='object')for(const[a]of ACTIONS){const v=SETTINGS.binds[a];if(Array.isArray(v))BIND[a]=v.filter(c=>typeof c==='string'&&c&&c!=='Escape').slice(0,4);}
const KEYLBL={Space:'SPACE',ShiftLeft:'SHIFT',ShiftRight:'R-SHIFT',ControlLeft:'CTRL',ControlRight:'R-CTRL',AltLeft:'ALT',AltRight:'ALT GR',Tab:'TAB',Enter:'ENTER',Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',
  Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Backspace:'⌫',CapsLock:'CAPS',MetaLeft:'META',MetaRight:'META',Delete:'DEL',Insert:'INS',Home:'HOME',End:'END',PageUp:'PGUP',PageDown:'PGDN'};
function keyLabel(c){if(!c)return'—';if(KEYLBL[c])return KEYLBL[c];if(c.startsWith('Key'))return c.slice(3);if(c.startsWith('Digit'))return c.slice(5);if(c.startsWith('Numpad'))return'NUM '+c.slice(6);return c.toUpperCase();}
const keyOf=a=>BIND[a]&&BIND[a].length?keyLabel(BIND[a][0]):'—';   // label of the first key bound to an action
const isAct=(e,a)=>!!BIND[a]&&BIND[a].indexOf(e.code)>=0;     // keydown event matches an action
const tl=(k,v)=>t(k,v);   // alias for scopes where a local variable is called t
function act(a){const b=BIND[a];if(!b)return false;for(let i=0;i<b.length;i++)if(keys[b[i]])return true;return false;}   // action held (reads the keys map in the player module)
