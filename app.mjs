import { bytes64, pack, unpack, invitation, signalFromInput, description, encryptAnswer, decryptAnswer,
  fingerprint, channelCipher, control, readControl, fileOffer, safeName, CHUNK, MEMORY_LIMIT } from './security.mjs';
import { Sha256 } from './hash.mjs';

const $ = id => document.getElementById(id);
let strings, language = 'es_mx', statusKey = 'idle', noticeKey;
let pc, channel, cipher, offer, role, established = false, stopped = true, epoch = 0;
let sendQueue = Promise.resolve(), receiveQueue = Promise.resolve();
let incoming, receiving, sending, retainedBytes = 0;
let queuedFrames = 0;
const downloads = new Set();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const t = (key, values = {}) => Object.entries(values).reduce((text,[name,value]) => text.replaceAll(`{${name}}`,String(value)), strings?.[key] ?? key);
const show = (id, visible) => { $(id).hidden = !visible; };
const formatSize = bytes => new Intl.NumberFormat(language === 'es_mx' ? 'es-MX' : 'en-US', { maximumFractionDigits: 1 }).format(bytes/1024**2) + ' MiB';

function status(key, state = 'idle') { statusKey=key; $('status').textContent=t(key);$('status').dataset.state=state; }
function notice(key) { noticeKey=key; $('notice').textContent=key ? t(key) : '';show('notice',!!key); }
function progress(name,bytes,total,start) {
  show('transfer',true);$('transfer-name').textContent=name;
  const percent=Math.min(100,Math.floor(bytes/total*100));
  $('progress').value=percent;$('transfer-percent').textContent=`${percent}%`;
  const seconds=Math.max(1,(performance.now()-start)/1000);
  $('transfer-detail').textContent=t('progress',{current:formatSize(bytes),total:formatSize(total),speed:formatSize(bytes/seconds)});
}
function completed(name,size,digest,url) {
  const row=document.createElement('li'),text=document.createElement('div'),title=document.createElement('span'),detail=document.createElement('small');
  title.textContent=name;detail.textContent=`${t('verified')} · ${formatSize(size)} · SHA-256 ${digest.slice(0,12)}…`;
  text.append(title,detail);row.append(text);
  if (url) {
    const link=document.createElement('a');link.href=url;link.download=name;link.textContent=t('download');
    link.addEventListener('click',()=>{
      // Dar tiempo al navegador para iniciar la descarga antes de liberar el Blob.
      setTimeout(()=>{URL.revokeObjectURL(url);if(downloads.delete(url))retainedBytes-=size;link.remove();},30000);
    },{once:true});row.append(link);
  }
  $('completed').prepend(row);
  // Acotar el historial sin perder enlaces de archivos aún pendientes de descargar.
  for(const previous of [...$('completed').children].reverse()) {
    if($('completed').children.length<=20)break;
    if(!previous.querySelector('a'))previous.remove();
  }
}
async function loadLanguage(value) {
  if(!['es_mx','en_us'].includes(value))throw new Error('translations');
  language=value;
  const response=await fetch(`./i18n/${language}.json`,{cache:'no-store',credentials:'omit'});
  if(!response.ok)throw new Error('translations');strings=await response.json();
  document.documentElement.lang=language==='es_mx'?'es-MX':'en-US';
  for(const element of document.querySelectorAll('[data-i18n]'))element.textContent=t(element.dataset.i18n);
  $('status').textContent=t(statusKey);if(noticeKey)notice(noticeKey);
  $('workspace-title').textContent=t(role==='receiver'?'receivingTitle':role==='sender'?'sendingTitle':'choose');
  $('storage-hint').textContent=t(window.showSaveFilePicker?'streamStorage':'memoryStorage');
}
function linkFor(kind,code) { const url=new URL('./',location.href);url.hash=new URLSearchParams({[kind]:code}).toString();return url.href; }
async function copy(id) {
  try{await navigator.clipboard.writeText($(id).value);notice('copied');}
  catch{$(id).focus();$(id).select();notice('copyManual');}
}
async function waitFor(predicate,timeout=60000) {
  const start=performance.now();
  while(!predicate()) {
    if(stopped||!channel||channel.readyState!=='open')throw new Error('disconnected');
    if(performance.now()-start>timeout)throw new Error('timeout');
    await sleep(25);
  }
}
async function send(payload) {
  const currentEpoch=epoch;
  sendQueue=sendQueue.then(async()=>{
    if(stopped||currentEpoch!==epoch||channel?.readyState!=='open')throw new Error('disconnected');
    const connection=channel,sessionCipher=cipher;
    const frame=await sessionCipher.seal(payload);
    await waitFor(()=>channel.bufferedAmount<256*1024);
    // Un fragmento pendiente nunca debe cruzarse a una sesión recién creada.
    if(stopped||currentEpoch!==epoch||channel!==connection)throw new Error('disconnected');
    connection.send(frame);
  });
  return sendQueue;
}
const command=value=>send(control(value));

async function closeSession() {
  stopped=true;established=false;epoch++;
  channel?.close();pc?.close();channel=null;pc=null;cipher=null;offer=null;
  const partial=receiving;receiving=null;incoming=null;sending=null;
  if(partial?.writer)await partial.writer.abort().catch(()=>{});
  for(const url of downloads)URL.revokeObjectURL(url);downloads.clear();retainedBytes=0;
  $('files').value='';$('files').disabled=false;$('completed').replaceChildren();
  for(const id of ['invite-link','answer-input','offer-input','answer-link'])$(id).value='';
  for(const id of ['receiver-setup','sender-setup','invite-output','answer-output','connected','incoming','transfer','session-actions'])show(id,false);
  show('home',true);$('workspace-title').textContent=t('choose');status('idle');
  sendQueue=Promise.resolve();receiveQueue=Promise.resolve();role=null;
  queuedFrames=0;$('remote-network').disabled=false;
}
async function fatal(error) {
  const known=['badCode','expired','badFile','protocol','timeout','disconnected','memoryLimit','integrity','network','unavailable','disk'];
  const key=known.includes(error?.message)?error.message:error?.name==='AbortError'?'cancelled':'unavailable';
  await closeSession();notice(key);status('error','error');
}
function setup(selectedRole) {
  role=selectedRole;stopped=false;established=false;notice();show('home',false);show('session-actions',true);
  show(selectedRole==='receiver'?'receiver-setup':'sender-setup',true);
  $('workspace-title').textContent=t(selectedRole==='receiver'?'receivingTitle':'sendingTitle');
}
async function createPeer() {
  if(!window.isSecureContext||!window.RTCPeerConnection||!crypto.subtle)throw new Error('unavailable');
  const currentEpoch=epoch;
  pc=new RTCPeerConnection({iceServers:offer?.remote===false||!$('remote-network').checked?[]:[{urls:'stun:stun.l.google.com:19302'}]});
  pc.addEventListener('connectionstatechange',()=>{
    if(currentEpoch!==epoch||stopped)return;
    if(pc.connectionState==='failed')void fatal(new Error('network'));
    else if(pc.connectionState==='disconnected') { notice('disconnected');status('reconnecting','error'); }
    else if(pc.connectionState==='connected'&&established) { notice();status('connectedStatus','connected'); }
  });
  if(role==='receiver')await attachChannel(pc.createDataChannel('entre-dos-v1',{ordered:true}));
  else pc.addEventListener('datachannel',event=>{
    if(channel||event.channel.label!=='entre-dos-v1'){event.channel.close();return;}
    void attachChannel(event.channel).catch(fatal);
  });
}
async function attachChannel(value) {
  channel=value;channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=128*1024;
  const currentEpoch=epoch;
  channel.addEventListener('open',()=>{
    if(currentEpoch!==epoch)return;
    void command({type:'hello',role,v:1}).catch(fatal);
  });
  channel.addEventListener('message',event=>{
    if(currentEpoch!==epoch||stopped)return;
    // La ventana de ocho fragmentos permite acotar también la cola de recepción.
    if(!(event.data instanceof ArrayBuffer)||event.data.byteLength>CHUNK+1052||++queuedFrames>24){void fatal(new Error('protocol'));return;}
    // El disco, el descifrado y el hash se procesan en orden. Las confirmaciones limitan el flujo.
    receiveQueue=receiveQueue.then(async()=>{
      if(currentEpoch!==epoch||stopped)return;
      if(!(event.data instanceof ArrayBuffer))throw new Error('protocol');
      const bytes=await cipher.open(event.data);
      if(bytes[0]===1)await handleControl(readControl(bytes));
      else if(bytes[0]===2)await handleChunk(bytes.subarray(1));
      else throw new Error('protocol');
    }).catch(error=>{if(currentEpoch===epoch&&!stopped)return fatal(error);})
      .finally(()=>{if(currentEpoch===epoch)queuedFrames--;});
  });
  channel.addEventListener('close',()=>{if(currentEpoch===epoch&&!stopped)void fatal(new Error('disconnected'));});
}
async function gather() {
  const connection=pc,currentEpoch=epoch;
  if(connection.iceGatheringState!=='complete')await new Promise(resolve=>{
    const finish=()=>{connection.removeEventListener('icegatheringstatechange',changed);clearTimeout(timer);resolve();};
    const changed=()=>{if(connection.iceGatheringState==='complete')finish();};
    const timer=setTimeout(finish,8000);connection.addEventListener('icegatheringstatechange',changed);
  });
  if(currentEpoch!==epoch||stopped)throw new Error('disconnected');
  return {type:connection.localDescription.type,sdp:connection.localDescription.sdp};
}
async function createInvitation() {
  if(pc)return;
  offer={v:1,id:crypto.randomUUID(),key:bytes64(crypto.getRandomValues(new Uint8Array(32))),until:Date.now()+15*60*1000,remote:$('remote-network').checked};
  cipher=await channelCipher(offer,role);
  await createPeer();await pc.setLocalDescription(await pc.createOffer());
  offer.desc=await gather();
  $('invite-link').value=linkFor('invite',pack(offer));show('invite-output',true);status('waiting');
  $('remote-network').disabled=true;
  if(location.hostname==='localhost'||location.hostname==='127.0.0.1')notice('localPreview');
  expirePending();
}
function expirePending() {
  const currentEpoch=epoch;
  setTimeout(()=>{if(currentEpoch===epoch&&!stopped&&!established)void fatal(new Error('expired'));},Math.max(1,offer.until-Date.now()));
}
async function joinInvitation() {
  if(pc)return;
  const parsed=unpack(signalFromInput($('offer-input').value,'invite'));
  offer={...invitation(parsed),remote:parsed.remote!==false};
  $('offer-input').value='';cipher=await channelCipher(offer,role);
  await createPeer();await pc.setRemoteDescription(description(offer.desc,'offer'));
  await pc.setLocalDescription(await pc.createAnswer());
  $('answer-link').value=linkFor('answer',await encryptAnswer(offer,await gather()));
  show('answer-output',true);status('waiting');expirePending();
}
async function acceptAnswer() {
  if(!pc||pc.remoteDescription)throw new Error('badCode');
  const answer=await decryptAnswer(offer,signalFromInput($('answer-input').value,'answer'));
  $('answer-input').value='';await pc.setRemoteDescription(answer);status('connecting');
  const currentEpoch=epoch;
  setTimeout(()=>{if(currentEpoch===epoch&&!established&&!stopped)notice('network');},30000);
}
async function handleControl(message) {
  if(!message||typeof message.type!=='string')throw new Error('protocol');
  if(message.type==='hello') {
    if(established||message.v!==1||message.role!==(role==='receiver'?'sender':'receiver'))throw new Error('protocol');
    established=true;show('receiver-setup',false);show('sender-setup',false);show('connected',true);
    show('send-panel',role==='sender');show('receive-panel',role==='receiver');
    $('fingerprint').textContent=await fingerprint(offer.key,offer.id);status('connectedStatus','connected');notice();
    $('invite-link').value='';$('answer-link').value='';return;
  }
  if(!established)throw new Error('protocol');
  if(message.type==='offer-file'&&role==='receiver') {
    if(incoming||receiving)throw new Error('protocol');
    incoming=fileOffer(message.file);$('incoming-name').textContent=incoming.name;$('incoming-size').textContent=formatSize(incoming.size);
    show('incoming',true);return;
  }
  if(['accept','reject','ack','done'].includes(message.type)&&role==='sender') {
    if(!sending||message.id!==sending.id)throw new Error('protocol');
    if(message.type==='accept'||message.type==='reject') {
      if(sending.decision!==null)throw new Error('protocol');sending.decision=message.type;return;
    }
    if(sending.decision!=='accept')throw new Error('protocol');
    if(message.type==='ack') {
      if(!Number.isSafeInteger(message.bytes)||message.bytes<sending.acked||message.bytes>sending.sent)throw new Error('protocol');
      sending.acked=message.bytes;progress(sending.name,sending.acked,sending.size,sending.start);return;
    }
    if(!sending.finished||message.sha256!==sending.digest)throw new Error('integrity');sending.done=true;return;
  }
  if(message.type==='finish'&&role==='receiver') {
    const current=receiving,currentEpoch=epoch;
    if(!current||current.id!==message.id||current.bytes!==current.size||
        !/^[a-f0-9]{64}$/.test(message.sha256))throw new Error('protocol');
    const digest=current.hash.hex();if(digest!==message.sha256)throw new Error('integrity');
    let url;
    if(current.writer)await current.writer.close();
    else {url=URL.createObjectURL(new Blob(current.parts,{type:'application/octet-stream'}));downloads.add(url);retainedBytes+=current.size;}
    if(currentEpoch!==epoch||stopped)return;
    current.parts=null;receiving=null;completed(current.name,current.size,digest,url);
    await command({type:'done',id:current.id,sha256:digest});show('transfer',false);status('connectedStatus','connected');return;
  }
  throw new Error('protocol');
}
async function handleChunk(bytes) {
  const current=receiving,currentEpoch=epoch;
  if(role!=='receiver'||!current||!bytes.length||bytes.length>CHUNK||current.bytes+bytes.length>current.size)throw new Error('protocol');
  if(current.writer)await current.writer.write(bytes);
  else current.parts.push(bytes);
  if(currentEpoch!==epoch||stopped)return;
  current.hash.update(bytes);current.bytes+=bytes.length;current.chunks++;
  progress(current.name,current.bytes,current.size,current.start);
  if(current.chunks%8===0||current.bytes===current.size)await command({type:'ack',id:current.id,bytes:current.bytes});
}
async function acceptFile() {
  if(!incoming||receiving)return;
  const pending=incoming,currentEpoch=epoch;
  let writer;
  try {
    if(window.showSaveFilePicker) {
      // El selector se invoca desde el clic, antes de esperar: Chrome exige activación del usuario.
      const handle=await window.showSaveFilePicker({suggestedName:pending.name});
      writer=await handle.createWritable();
    } else if(pending.size+retainedBytes>MEMORY_LIMIT)throw new Error('memoryLimit');
    if(currentEpoch!==epoch||stopped){await writer?.abort();return;}
    receiving={...pending,writer,parts:writer?null:[],bytes:0,chunks:0,hash:new Sha256(),start:performance.now()};
    incoming=null;show('incoming',false);progress(pending.name,0,pending.size,receiving.start);
    await command({type:'accept',id:pending.id});
  } catch(error) {
    await writer?.abort().catch(()=>{});
    if(currentEpoch!==epoch||stopped)return;
    incoming=null;show('incoming',false);await command({type:'reject',id:pending.id});
    notice(error.message==='memoryLimit'?'memoryLimit':error.name==='AbortError'?'cancelled':'disk');
  }
}
async function rejectFile() {
  if(!incoming)return;
  const id=incoming.id;incoming=null;show('incoming',false);await command({type:'reject',id});
}
async function sendFiles(files) {
  if(role!=='sender'||!established||sending)return;
  $('files').disabled=true;notice();
  try {
    for(const file of files) {
      const metadata=fileOffer({id:crypto.randomUUID(),name:safeName(file.name),size:file.size});
      sending={...metadata,decision:null,acked:0,sent:0,finished:false,done:false,start:performance.now()};
      await command({type:'offer-file',file:metadata});status('approval');
      await waitFor(()=>sending?.decision!==null,5*60*1000);
      if(sending.decision==='reject'){notice('rejected');sending=null;status('connectedStatus','connected');continue;}
      const hash=new Sha256();progress(metadata.name,0,metadata.size,sending.start);status('transferring','connected');
      for(let offset=0;offset<file.size;offset+=CHUNK) {
        await waitFor(()=>sending.sent-sending.acked<CHUNK*8);
        const chunk=new Uint8Array(await file.slice(offset,offset+CHUNK).arrayBuffer());hash.update(chunk);
        const payload=new Uint8Array(chunk.length+1);payload[0]=2;payload.set(chunk,1);
        sending.sent+=chunk.length;await send(payload);
      }
      await waitFor(()=>sending.acked===sending.size);
      sending.digest=hash.hex();sending.finished=true;
      await command({type:'finish',id:sending.id,sha256:sending.digest});status('verifying','connected');
      await waitFor(()=>sending.done);
      completed(metadata.name,metadata.size,sending.digest);sending=null;show('transfer',false);status('connectedStatus','connected');
    }
  } finally { $('files').disabled=false;$('files').value=''; }
}
function button(id,operation) {
  $(id).addEventListener('click',async()=>{
    const currentEpoch=epoch;
    $(id).disabled=true;
    try{await operation();}catch(error){if(currentEpoch===epoch)await fatal(error);}finally{$(id).disabled=false;}
  });
}
async function main() {
  // No se permite incrustar la app; las invitaciones se retiran del historial antes de cargar recursos.
  if(window.top!==window.self){document.body.replaceChildren();return;}
  const fragment=location.hash;history.replaceState(null,'',location.pathname+location.search);
  await loadLanguage('es_mx');
  button('receive-role',()=>setup('receiver'));button('send-role',()=>setup('sender'));
  button('create',createInvitation);button('join',joinInvitation);button('connect',acceptAnswer);
  button('copy-invite',()=>copy('invite-link'));button('copy-answer',()=>copy('answer-link'));
  button('accept',acceptFile);button('reject',rejectFile);button('end',async()=>{await closeSession();$('remote-network').disabled=false;notice('closed');});
  $('files').addEventListener('change',()=>{const currentEpoch=epoch;void sendFiles([...$('files').files]).catch(error=>{if(currentEpoch===epoch)return fatal(error);});});
  $('language').addEventListener('change',()=>{void loadLanguage($('language').value).catch(fatal);});
  window.addEventListener('beforeunload',event=>{if(incoming||receiving||sending){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{channel?.close();pc?.close();void receiving?.writer?.abort().catch(()=>{});});
  if(fragment) {
    const params=new URLSearchParams(fragment.slice(1));
    if(params.has('invite')){setup('sender');$('offer-input').value=params.get('invite');}
    else if(params.has('answer'))notice('answerInComputer');
  }
}
main().catch(error=>{if(strings)void fatal(error);else{$('notice').hidden=false;$('notice').textContent='No se pudo iniciar la app. Recarga desde HTTPS o localhost.';}});
