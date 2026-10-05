import { bytes64, pack, unpack, invitation, signalFromInput, description, encryptAnswer, decryptAnswer,
  fingerprint, channelCipher, control, readControl, fileOffer, safeName, CHUNK, MEMORY_LIMIT } from './security.mjs';
import { Sha256 } from './hash.mjs';
import { relayServers, peerConfiguration } from './network.mjs';
import {MAX_ACTIVE, MAX_BATCH, WINDOW_BYTES, ACK_CHUNKS, READ_BYTES, MAX_QUEUED_FRAMES,
  batchOffer, chunkPayload, readChunk, availableName} from './transfer.mjs';

const $ = id => document.getElementById(id);
let strings, language = 'es_mx', statusKey = 'idle', noticeKey;
let pc, channel, cipher, offer, role, established = false, stopped = true, epoch = 0;
let sendQueue = Promise.resolve(), receiveQueue = Promise.resolve();
let incoming = [], retainedBytes = 0, batchRunning = false, folder = null, pumping = false;
const receiving = new Map(), sending = new Map(), cancelled = new Set(), waiters = new Set();
const settled = new Set();
const draining = new Set();
let queuedFrames = 0;
const downloads = new Set();
const t = (key, values = {}) => Object.entries(values).reduce((text,[name,value]) => text.replaceAll(`{${name}}`,String(value)), strings?.[key] ?? key);
const show = (id, visible) => { $(id).hidden = !visible; };
const formatSize = bytes => new Intl.NumberFormat(language === 'es_mx' ? 'es-MX' : 'en-US', { maximumFractionDigits: 1 }).format(bytes/1024**2) + ' MiB';

function status(key, state = 'idle') { statusKey=key; $('status').textContent=t(key);$('status').dataset.state=state; }
function notice(key) { noticeKey=key; $('notice').textContent=key ? t(key) : '';show('notice',!!key); }
function wake() { for(const resolve of [...waiters])resolve(); }
function updateStatus() {
  if(receiving.size || [...sending.values()].some(file=>file.started&&!file.terminal))status('transferring','connected');
  else if(incoming.length || [...sending.values()].some(file=>!file.terminal))status('approval');
  else status('connectedStatus','connected');
}
function transferRow(file) {
  if(file.row)return;
  const row=document.createElement('div');row.className='transfer';row.dataset.transferId=file.id;
  const top=document.createElement('div');top.className='transfer-top';
  const title=document.createElement('strong'),percent=document.createElement('span');title.textContent=file.name;percent.textContent='0%';top.append(title,percent);
  const bar=document.createElement('progress');bar.max=100;bar.value=0;
  const detail=document.createElement('p');detail.className='small';detail.textContent=t('queued');
  const cancel=document.createElement('button');cancel.className='text-button';cancel.textContent=t('cancelTransfer');cancel.dataset.i18n='cancelTransfer';
  cancel.addEventListener('click',()=>{void cancelFile(file.id,true).catch(fatal);});
  row.append(top,bar,detail,cancel);$('transfer').append(row);show('transfer',true);
  file.row={element:row,percent,bar,detail,cancel};
}
function removeRow(file) { file.row?.element.remove();file.row=null;show('transfer',!!$('transfer').children.length); }
function progress(file,bytes,force=false) {
  transferRow(file);
  const now=performance.now();
  // Actualizar texto como máximo diez veces por segundo evita trabajo de diseño por fragmento.
  if(!force&&now-(file.lastPaint||0)<100&&bytes!==file.size)return;file.lastPaint=now;
  const percent=Math.min(100,Math.floor(bytes/file.size*100));file.row.bar.value=percent;file.row.percent.textContent=`${percent}%`;
  const seconds=Math.max(.1,(now-file.start)/1000);
  file.row.detail.textContent=t('progress',{current:formatSize(bytes),total:formatSize(file.size),speed:formatSize(bytes/seconds)});
}
function renderIncoming() {
  show('incoming',!!incoming.length);
  const pending=incoming[0];if(!pending){$('incoming-list').replaceChildren();updateStatus();return;}
  $('incoming-name').textContent=pending.name;$('incoming-size').textContent=t('batchCount',{count:incoming.length,total:formatSize(incoming.reduce((sum,file)=>sum+file.size,0))});
  $('incoming-list').replaceChildren();
  for(const file of incoming){const item=document.createElement('li');item.textContent=`${file.name} · ${formatSize(file.size)}`;$('incoming-list').append(item);}
  $('accept').disabled=receiving.size+draining.size>=MAX_ACTIVE||!!folder;
  $('accept-all').disabled=!!folder;
  $('accept-all').textContent=t(window.showDirectoryPicker?'acceptAll':'acceptAllMemory');
  show('accept-all',incoming.length>1);$('batch-hint').textContent=t(window.showDirectoryPicker?'folderHint':'batchMemoryHint');
  updateStatus();
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
  if(established)renderIncoming();
}
function linkFor(kind,code) { const url=new URL('./',location.href);url.hash=new URLSearchParams({[kind]:code}).toString();return url.href; }
async function copy(id) {
  try{await navigator.clipboard.writeText($(id).value);notice('copied');}
  catch{$(id).focus();$(id).select();notice('copyManual');}
}
async function waitFor(predicate,timeout=60000) {
  const start=performance.now(),currentEpoch=epoch;
  while(!predicate()) {
    if(stopped||currentEpoch!==epoch||!channel||channel.readyState!=='open')throw new Error('disconnected');
    if(performance.now()-start>timeout)throw new Error('timeout');
    // Las confirmaciones y el vaciado del canal despiertan al productor sin esperar un sondeo fijo.
    await new Promise(resolve=>{
      const finish=()=>{clearTimeout(timer);waiters.delete(finish);resolve();};
      const timer=setTimeout(finish,Math.min(1000,timeout));waiters.add(finish);
    });
  }
}
async function send(payload,file) {
  const currentEpoch=epoch;
  sendQueue=sendQueue.then(async()=>{
    if(stopped||currentEpoch!==epoch||channel?.readyState!=='open')throw new Error('disconnected');
    if(file?.cancelled)return;
    const connection=channel,sessionCipher=cipher;
    const frame=await sessionCipher.seal(payload);
    await waitFor(()=>channel.bufferedAmount<1024*1024);
    // Un fragmento pendiente nunca debe cruzarse a una sesión recién creada.
    if(stopped||currentEpoch!==epoch||channel!==connection)throw new Error('disconnected');
    connection.send(frame);
  });
  return sendQueue;
}
const command=value=>send(control(value));

async function closeSession() {
  stopped=true;established=false;epoch++;
  wake();
  channel?.close();pc?.close();channel=null;pc=null;cipher=null;offer=null;
  const partials=[...receiving.values()];for(const file of [...partials,...sending.values()])file.cancelled=true;
  receiving.clear();sending.clear();incoming=[];cancelled.clear();settled.clear();draining.clear();folder=null;batchRunning=false;pumping=false;
  await Promise.allSettled(partials.map(async file=>{await file.writer?.abort().catch(()=>{});await file.cleanup?.().catch(()=>{});}));
  for(const url of downloads)URL.revokeObjectURL(url);downloads.clear();retainedBytes=0;
  $('files').value='';$('files').disabled=false;$('completed').replaceChildren();
  $('transfer').replaceChildren();$('incoming-list').replaceChildren();
  for(const id of ['invite-link','answer-input','offer-input','answer-link','relay-input'])$(id).value='';
  for(const id of ['receiver-setup','sender-setup','invite-output','answer-output','connected','incoming','transfer','session-actions'])show(id,false);
  show('home',true);$('workspace-title').textContent=t('choose');status('idle');
  sendQueue=Promise.resolve();receiveQueue=Promise.resolve();role=null;
  queuedFrames=0;$('remote-network').disabled=false;
  show('relay-options',true);
}
async function fatal(error) {
  const known=['badCode','expired','badFile','badRelay','relayUnavailable','protocol','timeout','disconnected','memoryLimit','integrity','network','unavailable','disk','batchLimit','updateNeeded'];
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
  pc=new RTCPeerConnection(await peerConfiguration(offer));
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
  channel=value;channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=512*1024;
  channel.addEventListener('bufferedamountlow',wake);
  const currentEpoch=epoch;
  channel.addEventListener('open',()=>{
    if(currentEpoch!==epoch)return;
    void command({type:'hello',role,v:2}).catch(fatal);
  });
  channel.addEventListener('message',event=>{
    if(currentEpoch!==epoch||stopped)return;
    // Tres ventanas de 64 fragmentos más controles caben en una cola limitada a unos cuatro MiB.
    if(!(event.data instanceof ArrayBuffer)||event.data.byteLength>CHUNK+1052||++queuedFrames>MAX_QUEUED_FRAMES){void fatal(new Error('protocol'));return;}
    // El disco, el descifrado y el hash se procesan en orden. Las confirmaciones limitan el flujo.
    receiveQueue=receiveQueue.then(async()=>{
      if(currentEpoch!==epoch||stopped)return;
      if(!(event.data instanceof ArrayBuffer))throw new Error('protocol');
      const bytes=await cipher.open(event.data);
      if(bytes[0]===1)await handleControl(readControl(bytes));
      else if(bytes[0]===2)await handleChunk(readChunk(bytes));
      else throw new Error('protocol');
    }).catch(error=>{if(currentEpoch===epoch&&!stopped)return fatal(error);})
      .finally(()=>{if(currentEpoch===epoch){queuedFrames--;wake();}});
  });
  channel.addEventListener('close',()=>{if(currentEpoch===epoch&&!stopped)void fatal(new Error('disconnected'));});
}
async function gather() {
  const connection=pc,currentEpoch=epoch;
  if(connection.iceGatheringState!=='complete')await new Promise(resolve=>{
    const finish=()=>{connection.removeEventListener('icegatheringstatechange',changed);clearTimeout(timer);resolve();};
    const changed=()=>{if(connection.iceGatheringState==='complete')finish();};
    // Safari y redes restrictivas pueden tardar más que ocho segundos en descubrir una ruta.
    const timer=setTimeout(finish,20000);connection.addEventListener('icegatheringstatechange',changed);
  });
  if(currentEpoch!==epoch||stopped)throw new Error('disconnected');
  if(offer.remote!==false&&relayServers(offer.iceServers).some(item=>item.urls.some(url=>/^turns?:/i.test(url)))&&
      !/ typ relay(?:\s|$)/m.test(connection.localDescription.sdp))throw new Error('relayUnavailable');
  return {type:connection.localDescription.type,sdp:connection.localDescription.sdp};
}
async function createInvitation() {
  if(pc)return;
  const configured=relayServers($('relay-input').value.trim());
  if(configured.length&&!configured.some(item=>item.urls.some(url=>/^turns?:/i.test(url))))throw new Error('badRelay');
  offer={v:1,id:crypto.randomUUID(),key:bytes64(crypto.getRandomValues(new Uint8Array(32))),until:Date.now()+15*60*1000,remote:$('remote-network').checked,
    ...(configured.length?{iceServers:configured}:{})};
  $('relay-input').value='';show('relay-options',false);status('findingRoute');
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
  status('findingRoute');
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
  setTimeout(()=>{if(currentEpoch===epoch&&!established&&!stopped)notice('network');},45000);
}
async function handleControl(message) {
  if(!message||typeof message.type!=='string')throw new Error('protocol');
  if(message.type==='hello') {
    if(message.v!==2)throw new Error('updateNeeded');
    if(established||message.role!==(role==='receiver'?'sender':'receiver'))throw new Error('protocol');
    established=true;show('receiver-setup',false);show('sender-setup',false);show('connected',true);
    show('send-panel',role==='sender');show('receive-panel',role==='receiver');
    $('fingerprint').textContent=await fingerprint(offer.key,offer.id);status('connectedStatus','connected');notice();
    $('invite-link').value='';$('answer-link').value='';return;
  }
  if(!established)throw new Error('protocol');
  if(message.type==='offer-batch'&&role==='receiver') {
    if(incoming.length||receiving.size)throw new Error('protocol');
    incoming=batchOffer(message.files);
    if(incoming.some(file=>cancelled.has(file.id)))throw new Error('protocol');
    folder=null;renderIncoming();return;
  }
  if(message.type==='cancel') {
    if(typeof message.id!=='string')throw new Error('protocol');
    if(!cancelled.has(message.id)&&!settled.has(message.id))await cancelFile(message.id,false);
    if(role==='sender')await command({type:'cancel-confirm',id:message.id});
    else {draining.delete(message.id);await pumpFolder();}
    return;
  }
  if(message.type==='cancel-confirm'&&role==='receiver') {
    if(!cancelled.has(message.id))throw new Error('protocol');
    // El marcador llega después de los paquetes ya enviados: ahora sí se puede reutilizar la ventana.
    draining.delete(message.id);renderIncoming();await pumpFolder();return;
  }
  if(['accept','reject','ack','done'].includes(message.type)&&role==='sender') {
    if(cancelled.has(message.id))return;
    const current=sending.get(message.id);
    if(!current)throw new Error('protocol');
    if(message.type==='accept'||message.type==='reject') {
      if(current.decision!==null)throw new Error('protocol');current.decision=message.type;wake();return;
    }
    if(current.decision!=='accept')throw new Error('protocol');
    if(message.type==='ack') {
      if(!Number.isSafeInteger(message.bytes)||message.bytes<current.acked||message.bytes>current.sent)throw new Error('protocol');
      current.acked=message.bytes;progress(current,current.acked);wake();return;
    }
    if(!current.finished||message.sha256!==current.digest)throw new Error('integrity');
    current.done=true;wake();return;
  }
  if(message.type==='finish'&&role==='receiver') {
    if(cancelled.has(message.id))return;
    const current=receiving.get(message.id),currentEpoch=epoch;
    if(!current||current.bytes!==current.size||!/^[a-f0-9]{64}$/.test(message.sha256))throw new Error('protocol');
    const digest=current.hash.hex();if(digest!==message.sha256)throw new Error('integrity');
    // A partir del cierre verificado ya no hay descarga parcial que cancelar.
    current.committing=true;current.row.cancel.disabled=true;
    let url;
    if(current.writer)await current.writer.close();
    if(currentEpoch!==epoch||stopped)return;
    if(!current.writer){url=URL.createObjectURL(new Blob(current.parts,{type:'application/octet-stream'}));downloads.add(url);retainedBytes+=current.size;}
    current.parts=null;receiving.delete(current.id);settled.add(current.id);if(settled.size>64)settled.delete(settled.values().next().value);
    removeRow(current);completed(current.savedName||current.name,current.size,digest,url);
    await command({type:'done',id:current.id,sha256:digest});updateStatus();await pumpFolder();return;
  }
  throw new Error('protocol');
}
async function handleChunk({id,bytes}) {
  if(cancelled.has(id))return;
  const current=receiving.get(id),currentEpoch=epoch;
  if(role!=='receiver'||!current||current.bytes+bytes.length>current.size||current.committing)throw new Error('protocol');
  if(current.writer) {
    try{await current.writer.write(bytes);}
    catch(error){if(current.cancelled||currentEpoch!==epoch)return;throw error;}
  }
  else current.parts.push(bytes);
  if(currentEpoch!==epoch||stopped||current.cancelled)return;
  current.hash.update(bytes);current.bytes+=bytes.length;current.chunks++;
  progress(current,current.bytes);
  if(current.chunks%ACK_CHUNKS===0||current.bytes===current.size)await command({type:'ack',id,bytes:current.bytes});
}
function reserveMemory(size) {
  if(size+retainedBytes+[...receiving.values()].filter(file=>!file.writer).reduce((sum,file)=>sum+file.size,0)>MEMORY_LIMIT)throw new Error('memoryLimit');
}
async function startReceiving(pending,writer) {
  const currentEpoch=epoch;
  if(cancelled.has(pending.id)||!incoming.some(file=>file.id===pending.id)){await writer?.abort().catch(()=>{});await pending.cleanup?.().catch(()=>{});return;}
  if(receiving.size+draining.size>=MAX_ACTIVE){await writer?.abort().catch(()=>{});throw new Error('protocol');}
  if(!writer)reserveMemory(pending.size);
  const current={...pending,writer,parts:writer?null:[],bytes:0,chunks:0,hash:new Sha256(),start:performance.now()};
  receiving.set(pending.id,current);incoming=incoming.filter(file=>file.id!==pending.id);
  progress(current,0,true);renderIncoming();
  if(currentEpoch===epoch)await command({type:'accept',id:pending.id});
}
async function acceptFile() {
  if(!incoming.length||receiving.size+draining.size>=MAX_ACTIVE||folder)return;
  const pending=incoming[0],currentEpoch=epoch;
  let writer;
  try {
    if(window.showSaveFilePicker) {
      // El selector se invoca desde el clic: los permisos necesitan activación del usuario.
      const handle=await window.showSaveFilePicker({suggestedName:pending.name});writer=await handle.createWritable();
    }
    if(currentEpoch!==epoch||stopped){await writer?.abort().catch(()=>{});return;}
    await startReceiving(pending,writer);
  } catch(error) {
    await writer?.abort().catch(()=>{});
    if(currentEpoch!==epoch||stopped)return;
    if(!cancelled.has(pending.id)){incoming=incoming.filter(file=>file.id!==pending.id);await command({type:'reject',id:pending.id});}
    renderIncoming();notice(error.message==='memoryLimit'?'memoryLimit':error.name==='AbortError'?'cancelled':'disk');
  }
}
async function rejectFile() {
  if(!incoming.length)return;
  const pending=incoming.shift();renderIncoming();await command({type:'reject',id:pending.id});
}
async function folderWriter(directory,pending) {
  for(let attempt=0;attempt<1000;attempt++) {
    const name=availableName(pending.name,attempt);
    try{await directory.getFileHandle(name);continue;}
    catch(error){if(error.name!=='NotFoundError')throw error;}
    // Conservar un archivo existente: añadir un sufijo en lugar de truncarlo.
    const handle=await directory.getFileHandle(name,{create:true});
    const cleanup=()=>directory.removeEntry(name);
    try{return {writer:await handle.createWritable(),savedName:name,cleanup};}
    catch(error){await cleanup().catch(()=>{});throw error;}
  }
  throw new Error('disk');
}
async function acceptAll() {
  if(!incoming.length||folder)return;
  const currentEpoch=epoch;
  try {
    // La autorización cubre únicamente los nombres ya visibles de este lote.
    const ids=new Set(incoming.map(file=>file.id));
    const directory=window.showDirectoryPicker?await window.showDirectoryPicker({mode:'readwrite'}):null;
    if(currentEpoch!==epoch||stopped)return;
    folder={directory,ids};renderIncoming();await pumpFolder();
  } catch(error) {
    if(currentEpoch!==epoch||stopped)return;
    folder=null;renderIncoming();notice(error.name==='AbortError'?'cancelled':'disk');
  }
}
async function pumpFolder() {
  if(pumping||!folder||stopped)return;
  pumping=true;const currentEpoch=epoch,authorization=folder;
  try {
    while(currentEpoch===epoch&&!stopped&&folder===authorization&&receiving.size+draining.size<MAX_ACTIVE) {
      const pending=incoming.find(file=>authorization.ids.has(file.id));if(!pending)break;
      let writer;
      try {
        if(authorization.directory){const result=await folderWriter(authorization.directory,pending);writer=result.writer;pending.savedName=result.savedName;pending.cleanup=result.cleanup;}
        if(currentEpoch!==epoch||stopped){await writer?.abort().catch(()=>{});await pending.cleanup?.().catch(()=>{});break;}
        await startReceiving(pending,writer);
      } catch(error) {
        await writer?.abort().catch(()=>{});
        await pending.cleanup?.().catch(()=>{});
        if(currentEpoch!==epoch||stopped)break;
        incoming=incoming.filter(file=>file.id!==pending.id);
        if(!cancelled.has(pending.id))await command({type:'reject',id:pending.id});
        notice(error.message==='memoryLimit'?'memoryLimit':'disk');
      }
    }
    if(currentEpoch===epoch&&!incoming.some(file=>authorization.ids.has(file.id)))folder=null;
  } finally {if(currentEpoch===epoch){pumping=false;renderIncoming();}}
}
function rememberCancelled(id) {
  cancelled.add(id);if(cancelled.size>64)cancelled.delete(cancelled.values().next().value);
}
async function cancelFile(id,local) {
  if(cancelled.has(id)||settled.has(id))return;
  const currentEpoch=epoch;
  const current=role==='sender'?sending.get(id):receiving.get(id);
  const pending=incoming.find(file=>file.id===id);
  if(current?.done||current?.terminal||current?.committing||(local&&current?.finished))return;
  if(!current&&!pending)throw new Error('protocol');
  rememberCancelled(id);
  if(local&&role==='receiver'&&current)draining.add(id);
  if(current){current.cancelled=true;current.terminal=true;removeRow(current);}
  incoming=incoming.filter(file=>file.id!==id);receiving.delete(id);wake();renderIncoming();
  if(current?.writer)await current.writer.abort().catch(()=>{});
  await current?.cleanup?.().catch(()=>{});
  if(currentEpoch!==epoch||stopped)return;
  if(current)current.parts=null;
  if(local)await command({type:'cancel',id});
  notice(local?'transferCancelled':'partnerCancelled');updateStatus();await pumpFolder();
}
async function sendOne(current,file) {
  await waitFor(()=>current.cancelled||current.decision!==null,5*60*1000);
  if(current.cancelled)return;
  if(current.decision==='reject'){notice('rejected');current.terminal=true;removeRow(current);updateStatus();return;}
  current.started=true;current.start=performance.now();const hash=new Sha256();progress(current,0,true);updateStatus();
  // Leer un MiB reduce las llamadas a Safari; los mensajes cifrados siguen siendo menores de 16 KiB.
  for(let offset=0;offset<file.size&&!current.cancelled;offset+=READ_BYTES) {
    const block=new Uint8Array(await file.slice(offset,offset+READ_BYTES).arrayBuffer());
    if(current.cancelled)return;hash.update(block);
    for(let cursor=0;cursor<block.length&&!current.cancelled;cursor+=CHUNK) {
      await waitFor(()=>current.cancelled||current.sent-current.acked<WINDOW_BYTES);
      if(current.cancelled)return;
      const chunk=block.subarray(cursor,cursor+CHUNK);current.sent+=chunk.length;
      await send(chunkPayload(current.id,chunk),current);
    }
  }
  if(current.cancelled)return;
  await waitFor(()=>current.cancelled||current.acked===current.size);if(current.cancelled)return;
  current.digest=hash.hex();current.finished=true;current.row.cancel.disabled=true;current.row.detail.textContent=t('verifying');
  await command({type:'finish',id:current.id,sha256:current.digest});
  await waitFor(()=>current.cancelled||current.done);if(current.cancelled)return;
  current.terminal=true;completed(current.name,current.size,current.digest);removeRow(current);updateStatus();
}
async function sendFiles(files) {
  if(role!=='sender'||!established||batchRunning)return;
  let metadata;
  try{metadata=batchOffer(files.map(file=>({id:crypto.randomUUID(),name:safeName(file.name),size:file.size})));}
  catch(error){notice(error.message==='batchLimit'?'batchLimit':'badFile');$('files').value='';return;}
  const currentEpoch=epoch;batchRunning=true;$('files').disabled=true;notice();sending.clear();
  try {
    for(const file of metadata){const current={...file,decision:null,acked:0,sent:0,finished:false,done:false,start:performance.now()};sending.set(file.id,current);transferRow(current);}
    await command({type:'offer-batch',files:metadata});status('approval');
    let index=0;
    // Tres productores intercalan paquetes; el cifrado mantiene un solo contador de envío ordenado.
    await Promise.all(Array.from({length:Math.min(MAX_ACTIVE,metadata.length)},async()=>{
      while(index<metadata.length){const position=index++;await sendOne(sending.get(metadata[position].id),files[position]);}
    }));
  } finally {
    if(currentEpoch===epoch){batchRunning=false;$('files').disabled=false;$('files').value='';updateStatus();}
  }
}

function button(id,operation) {
  $(id).addEventListener('click',async()=>{
    const currentEpoch=epoch;
    $(id).disabled=true;
    try{await operation();}catch(error){if(currentEpoch===epoch)await fatal(error);}finally{$(id).disabled=false;if(established)renderIncoming();}
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
  button('accept',acceptFile);button('accept-all',acceptAll);button('reject',rejectFile);button('end',async()=>{await closeSession();$('remote-network').disabled=false;notice('closed');});
  $('files').addEventListener('change',()=>{const currentEpoch=epoch;void sendFiles([...$('files').files]).catch(error=>{if(currentEpoch===epoch)return fatal(error);});});
  $('language').addEventListener('change',()=>{void loadLanguage($('language').value).catch(fatal);});
  window.addEventListener('beforeunload',event=>{if(incoming.length||receiving.size||batchRunning){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{channel?.close();pc?.close();for(const file of receiving.values())void file.writer?.abort().catch(()=>{});});
  if(fragment) {
    const params=new URLSearchParams(fragment.slice(1));
    if(params.has('invite')){setup('sender');$('offer-input').value=params.get('invite');}
    else if(params.has('answer'))notice('answerInComputer');
  }
}
main().catch(error=>{if(strings)void fatal(error);else{$('notice').hidden=false;$('notice').textContent='No se pudo iniciar la app. Recarga desde HTTPS o localhost.';}});
