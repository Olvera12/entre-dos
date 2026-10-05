// Las credenciales TURN se reciben de la cuenta del dueño, no del repositorio público.
// Sólo se admiten proveedores comprobados y claves de transporte, nunca claves de administración.
export function relayServers(value) {
  if(value===undefined||value===null||value==='')return [];
  let list=value;
  if(typeof value==='string') {
    if(value.length>12000)throw new Error('badRelay');
    try{list=JSON.parse(value);}catch{throw new Error('badRelay');}
  }
  if(!Array.isArray(list)||list.length>8)throw new Error('badRelay');
  return list.map(item=>{
    if(!item||typeof item!=='object'||Object.keys(item).some(key=>!['urls','username','credential','credentialType'].includes(key)))throw new Error('badRelay');
    const urls=typeof item.urls==='string'?[item.urls]:item.urls;
    if(!Array.isArray(urls)||!urls.length||urls.length>8)throw new Error('badRelay');
    for(const url of urls) {
      if(typeof url!=='string'||url.length>512)throw new Error('badRelay');
      const match=/^(stun|stuns|turn|turns):([a-z0-9.-]+)(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/i.exec(url);
      if(!match)throw new Error('badRelay');
      const host=match[2].toLowerCase();
      if(!host.endsWith('.metered.ca')&&host!=='turn.cloudflare.com')throw new Error('badRelay');
      if(match[3]&&(Number(match[3])<1||Number(match[3])>65535))throw new Error('badRelay');
    }
    const hasTurn=urls.some(url=>/^turns?:/i.test(url));
    if(hasTurn&&(typeof item.username!=='string'||!item.username.length||item.username.length>1024||
        typeof item.credential!=='string'||!item.credential.length||item.credential.length>1024||
        (item.credentialType!==undefined&&item.credentialType!=='password')))throw new Error('badRelay');
    return hasTurn?{urls,username:item.username,credential:item.credential}:{urls};
  });
}
export async function peerConfiguration(offer) {
  // La misma opción viaja en la invitación: el iPhone no depende de una casilla local oculta.
  if(offer.remote===false)return {iceServers:[]};
  return {iceServers:[{urls:'stun:stun.l.google.com:19302'},...relayServers(offer.iceServers)]};
}
