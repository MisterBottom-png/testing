const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const STORAGE_KEY = 'corners-game-save-v2';
const SETTINGS_KEY = 'corners-settings-v2';
const MODE_LABELS = { local:'На одном телефоне', bot:'Против компьютера', online:'Онлайн P2P' };

let state = createInitialState('local');
let selected = null;
let legal = [];
let history = [];
let names = ['Игрок 1','Игрок 2'];
let difficulty = 'smart';
let botThinking = false;
let settings = { sound:true, vibration:true };
let audioContext = null;
let toastTimer = null;
let online = { pc:null, dc:null, isHost:false, playerIndex:null, connected:false, peerName:'Соперник' };

const board = $('#board');
const gameApp = $('#gameApp');
const welcomeOverlay = $('#welcomeOverlay');
const onlineOverlay = $('#onlineOverlay');
const rulesOverlay = $('#rulesOverlay');
const winnerOverlay = $('#winnerOverlay');

function safeName(value, fallback){ return (value || '').trim().slice(0,18) || fallback; }
function currentPlayerCanAct(){
  if (state.phase !== 'playing' || botThinking) return false;
  if (state.mode === 'bot') return state.currentPlayer === 0;
  if (state.mode === 'online') return online.connected && state.currentPlayer === online.playerIndex;
  return true;
}
function targetCount(player){ const target = CAMPS[player === 0 ? 1 : 0]; let count=0; for(const i of target) if(state.pieces[i]===player+1) count++; return count; }
function elapsedText(){ const ms=Math.max(0,Date.now()-state.startedAt); const m=Math.floor(ms/60000); const s=Math.floor(ms/1000)%60; return `${m}:${String(s).padStart(2,'0')}`; }

function renderBoard(){
  const gradient = `<defs><radialGradient id="bluePiece" cx="32%" cy="25%"><stop offset="0" stop-color="#d8efff"/><stop offset=".34" stop-color="#78baff"/><stop offset="1" stop-color="#1465bd"/></radialGradient><radialGradient id="redPiece" cx="32%" cy="25%"><stop offset="0" stop-color="#ffe2e5"/><stop offset=".34" stop-color="#ff8490"/><stop offset="1" stop-color="#bb2341"/></radialGradient></defs>`;
  const camps = `<polygon class="camp-top" points="268,12 198,151 338,151"/><polygon class="camp-bottom" points="268,598 198,459 338,459"/>`;
  let content = gradient + camps;
  HOLES.forEach((hole,index)=>{
    const cx=28+hole.x*20, cy=28+hole.y*34.6;
    const targetClass = CAMPS[0].has(index)?'target-blue':CAMPS[1].has(index)?'target-red':'';
    content += `<circle class="hole ${targetClass}" cx="${cx}" cy="${cy}" r="8.5"/>`;
    if(legal.includes(index)) content += `<circle class="legal" data-index="${index}" cx="${cx}" cy="${cy}" r="11" role="button" aria-label="Сделать ход"/>`;
    const piece=state.pieces[index];
    if(piece){
      const classes=['piece',piece===1?'blue':'red'];
      if(selected===index) classes.push('selected');
      if(state.lastMove && state.lastMove.to===index) classes.push('last');
      if(piece===state.currentPlayer+1 && currentPlayerCanAct()) classes.push('selectable');
      content += `<circle class="${classes.join(' ')}" data-index="${index}" cx="${cx}" cy="${cy}" r="12.2" role="button" aria-label="Фишка ${piece===1?'синих':'красных'}"/>`;
    }
    if(state.lastMove && (state.lastMove.from===index || state.lastMove.to===index)) content += `<circle class="last-ring" cx="${cx}" cy="${cy}" r="16"/>`;
  });
  board.innerHTML=content;
}

function render(){
  $('#modeLabel').textContent = `${MODE_LABELS[state.mode]} · ${state.moveCount} ходов · ${elapsedText()}`;
  $('#name0').textContent=names[0]; $('#name1').textContent=names[1];
  $('#progress0').textContent=`В цели: ${targetCount(0)}/10`; $('#progress1').textContent=`В цели: ${targetCount(1)}/10`;
  $('#player0').classList.toggle('active',state.currentPlayer===0 && state.phase==='playing');
  $('#player1').classList.toggle('active',state.currentPlayer===1 && state.phase==='playing');
  const pill=$('#turnPill');
  if(state.phase==='finished'){ pill.textContent='Финиш'; pill.classList.remove('live'); }
  else if(state.mode==='online' && !online.connected){ pill.textContent='Связь…'; pill.classList.remove('live'); }
  else { pill.textContent=currentPlayerCanAct()?'Ваш ход':'Ход'; pill.classList.toggle('live',currentPlayerCanAct()); }
  const message=$('#boardMessage');
  if(botThinking) message.textContent='Компьютер думает…';
  else if(state.phase==='finished') message.textContent='Партия завершена';
  else if(!currentPlayerCanAct()) message.textContent=state.mode==='online'&&!online.connected?'Ожидание соединения…':`Ходит ${names[state.currentPlayer]}`;
  else if(selected!==null) message.textContent=`Доступно ходов: ${legal.length}`;
  else message.textContent=`Ходит ${names[state.currentPlayer]}`;
  $('#undoBtn').disabled=state.mode==='online'||history.length===0||botThinking;
  $('#soundBtn').innerHTML=settings.sound?'<span>♪</span><span>Звук</span>':'<span>×</span><span>Без звука</span>';
  renderBoard();
}

function selectOrMove(index){
  if(!currentPlayerCanAct()) return;
  const piece=state.pieces[index];
  if(selected!==null && legal.includes(index)){ requestMove(selected,index); return; }
  if(piece===state.currentPlayer+1){
    if(selected===index){ selected=null; legal=[]; }
    else { selected=index; legal=getLegalDestinations(state,index); playTone(420,.045); }
    render();
  } else if(selected!==null){ selected=null; legal=[]; render(); }
}

function snapshot(){ return cloneState(state); }
function requestMove(from,to){
  if(state.mode==='online' && !online.isHost){ sendOnline({type:'move',from,to}); selected=null; legal=[]; render(); return; }
  makeMove(from,to,true);
}
function makeMove(from,to,recordHistory=true){
  if(recordHistory) history.push(snapshot());
  const result=applyMove(state,from,to);
  if(!result.ok){ if(recordHistory) history.pop(); showToast(result.message); return false; }
  selected=null; legal=[]; playTone(620,.07); vibrate(18); saveGame(); render();
  if(state.mode==='online' && online.isHost) broadcastState();
  if(state.phase==='finished'){ setTimeout(showWinner,320); return true; }
  if(state.mode==='bot' && state.currentPlayer===1) scheduleBot();
  return true;
}
function scheduleBot(){
  botThinking=true; render();
  setTimeout(()=>{ const move=chooseBotMove(state,difficulty); botThinking=false; if(move) makeMove(move.from,move.to,true); else render(); },420+Math.random()*420);
}
function undo(){
  if(!history.length||state.mode==='online'||botThinking) return;
  if(state.mode==='bot' && history.length>=2){ const previous=history.splice(history.length-2,2)[0]; state=previous; }
  else state=history.pop();
  selected=null; legal=[]; saveGame(); render(); playTone(300,.06);
}
function restartGame(skipConfirm=false){
  if(!skipConfirm && state.moveCount>0 && !confirm('Начать партию заново?')) return;
  state=createInitialState(state.mode); history=[]; selected=null; legal=[]; botThinking=false; winnerOverlay.classList.add('hidden'); saveGame(); render();
  if(state.mode==='online' && online.isHost) broadcastState();
}
function showWinner(){
  if(state.winner===null) return;
  $('#winnerToken').className=`token winner-token ${state.winner===0?'blue':'red'}`;
  $('#winnerTitle').textContent=`Побеждает ${names[state.winner]}`;
  $('#winnerText').textContent=`Все 10 фишек достигли цели за ${state.moveCount} ходов.`;
  winnerOverlay.classList.remove('hidden'); playVictory();
}

function launchGame(mode,resuming=false){
  names=[safeName($('#blueName').value,'Игрок 1'),safeName($('#redName').value,mode==='bot'?'Компьютер':'Игрок 2')];
  if(mode==='bot') names[1]='Компьютер';
  difficulty=$('#difficulty').value;
  if(!resuming) state=createInitialState(mode);
  state.mode=mode; history=[]; selected=null; legal=[];
  welcomeOverlay.classList.add('hidden'); onlineOverlay.classList.add('hidden'); gameApp.classList.remove('hidden');
  saveGame(); render();
}
function goMenu(){
  if(state.mode==='online') closePeer();
  gameApp.classList.add('hidden'); winnerOverlay.classList.add('hidden'); welcomeOverlay.classList.remove('hidden'); updateResume();
}
function saveGame(){
  if(state.mode==='online') return;
  try{ localStorage.setItem(STORAGE_KEY,JSON.stringify({state,names,difficulty,savedAt:Date.now()})); }catch{}
}
function loadGame(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(!saved?.state?.pieces||saved.state.pieces.length!==HOLES.length) return false;
    state=saved.state; names=saved.names||names; difficulty=saved.difficulty||'smart';
    $('#blueName').value=names[0]; $('#redName').value=names[1]; $('#difficulty').value=difficulty;
    launchGame(state.mode,true); if(state.phase==='finished') setTimeout(showWinner,250); return true;
  }catch{return false;}
}
function updateResume(){ try{$('#resumeBtn').classList.toggle('hidden',!localStorage.getItem(STORAGE_KEY));}catch{$('#resumeBtn').classList.add('hidden');} }

function playTone(frequency,duration){
  if(!settings.sound) return;
  try{ audioContext ||= new (window.AudioContext||window.webkitAudioContext)(); const o=audioContext.createOscillator(); const g=audioContext.createGain(); o.type='sine'; o.frequency.value=frequency; g.gain.setValueAtTime(.055,audioContext.currentTime); g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration); o.connect(g).connect(audioContext.destination); o.start(); o.stop(audioContext.currentTime+duration); }catch{}
}
function playVictory(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>playTone(f,.18),i*120)); vibrate([40,40,70]); }
function vibrate(pattern){ if(settings.vibration && navigator.vibrate) navigator.vibrate(pattern); }
function showToast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2100); }
async function copyText(text){
  if(!text) return;
  try{ await navigator.clipboard.writeText(text); showToast('Код скопирован'); }
  catch{ const ta=document.createElement('textarea'); ta.value=text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); showToast('Код скопирован'); }
}

function bytesToBase64(bytes){ let binary=''; const chunk=0x8000; for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk)); return btoa(binary).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
function base64ToBytes(value){ let normalized=value.trim().replaceAll('-','+').replaceAll('_','/'); while(normalized.length%4) normalized+='='; const binary=atob(normalized); return Uint8Array.from(binary,c=>c.charCodeAt(0)); }
function encodeSignal(data){ return bytesToBase64(new TextEncoder().encode(JSON.stringify(data))); }
function decodeSignal(value){ return JSON.parse(new TextDecoder().decode(base64ToBytes(value))); }
function setConnectionStatus(text,ok=false){ const el=$('#connectionStatus'); el.textContent=text; el.classList.toggle('ok',ok); }
function waitForIce(pc){ return new Promise(resolve=>{ if(pc.iceGatheringState==='complete') return resolve(); const done=()=>{ if(pc.iceGatheringState==='complete'){ pc.removeEventListener('icegatheringstatechange',done); resolve(); } }; pc.addEventListener('icegatheringstatechange',done); setTimeout(resolve,6500); }); }
function closePeer(){ try{online.dc?.close();online.pc?.close();}catch{} online={pc:null,dc:null,isHost:false,playerIndex:null,connected:false,peerName:'Соперник'}; }
function setupPeer(isHost){
  closePeer(); online.isHost=isHost; online.playerIndex=isHost?0:1;
  online.pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]});
  online.pc.onconnectionstatechange=()=>{ const s=online.pc.connectionState; setConnectionStatus(`Состояние: ${s}`,s==='connected'); if(['failed','closed','disconnected'].includes(s)&&online.connected){online.connected=false;render();showToast('Связь с соперником потеряна');} };
  if(isHost) attachChannel(online.pc.createDataChannel('corners',{ordered:true})); else online.pc.ondatachannel=e=>attachChannel(e.channel);
}
function attachChannel(channel){
  online.dc=channel;
  channel.onopen=()=>{ online.connected=true; setConnectionStatus('Соперник подключён. Игра начинается.',true); sendOnline({type:'hello',name:isFinite(online.playerIndex)?names[online.playerIndex]:'Игрок'}); if(online.isHost) broadcastState(); launchGame('online',true); };
  channel.onclose=()=>{online.connected=false;render();}; channel.onerror=()=>setConnectionStatus('Ошибка канала данных.');
  channel.onmessage=e=>handleOnlineMessage(JSON.parse(e.data));
}
function sendOnline(message){ if(online.dc?.readyState==='open') online.dc.send(JSON.stringify(message)); }
function broadcastState(){ sendOnline({type:'state',state,names}); }
function handleOnlineMessage(message){
  if(message.type==='hello'){ online.peerName=safeName(message.name,'Соперник'); names[online.isHost?1:0]=online.peerName; if(online.isHost) broadcastState(); render(); return; }
  if(message.type==='state' && !online.isHost){ state=message.state; names=message.names||names; selected=null;legal=[];render(); if(state.phase==='finished')setTimeout(showWinner,250); return; }
  if(message.type==='move' && online.isHost){ if(state.currentPlayer!==1) return broadcastState(); makeMove(Number(message.from),Number(message.to),false); return; }
  if(message.type==='reset'){ if(online.isHost) restartGame(true); }
}
async function createOffer(){
  try{ names[0]=safeName($('#blueName').value,'Игрок 1'); names[1]='Соперник'; state=createInitialState('online'); setupPeer(true); const offer=await online.pc.createOffer(); await online.pc.setLocalDescription(offer); setConnectionStatus('Собираем данные соединения…'); await waitForIce(online.pc); $('#offerOut').value=encodeSignal(online.pc.localDescription); $('#copyOfferBtn').disabled=false; setConnectionStatus('Код готов. Отправь его сопернику.'); }
  catch(error){setConnectionStatus(`Не удалось создать приглашение: ${error.message}`);}
}
async function createAnswer(){
  try{ const offer=decodeSignal($('#offerIn').value); names[1]=safeName($('#redName').value,'Игрок 2'); names[0]='Соперник'; state=createInitialState('online'); setupPeer(false); await online.pc.setRemoteDescription(offer); const answer=await online.pc.createAnswer(); await online.pc.setLocalDescription(answer); setConnectionStatus('Собираем данные соединения…'); await waitForIce(online.pc); $('#answerOut').value=encodeSignal(online.pc.localDescription); $('#copyAnswerBtn').disabled=false; setConnectionStatus('Ответ готов. Отправь его создателю игры.'); }
  catch(error){setConnectionStatus(`Неверный код или ошибка соединения: ${error.message}`);}
}
async function acceptAnswer(){
  try{ await online.pc.setRemoteDescription(decodeSignal($('#answerIn').value)); setConnectionStatus('Ответ принят. Ждём прямое соединение…'); }
  catch(error){setConnectionStatus(`Не удалось принять ответ: ${error.message}`);}
}

board.addEventListener('click',event=>{ const target=event.target.closest('[data-index]'); if(target) selectOrMove(Number(target.dataset.index)); });
$$('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>launchGame(btn.dataset.mode)));
$('#onlineModeBtn').addEventListener('click',()=>{ names=[safeName($('#blueName').value,'Игрок 1'),safeName($('#redName').value,'Игрок 2')]; onlineOverlay.classList.remove('hidden'); });
$$('[data-close-online]').forEach(btn=>btn.addEventListener('click',()=>onlineOverlay.classList.add('hidden')));
$$('[data-online-tab]').forEach(btn=>btn.addEventListener('click',()=>{ $$('[data-online-tab]').forEach(x=>x.classList.toggle('active',x===btn)); $('#hostPanel').classList.toggle('hidden',btn.dataset.onlineTab!=='host'); $('#guestPanel').classList.toggle('hidden',btn.dataset.onlineTab!=='guest'); }));
$('#createOfferBtn').addEventListener('click',createOffer); $('#copyOfferBtn').addEventListener('click',()=>copyText($('#offerOut').value)); $('#createAnswerBtn').addEventListener('click',createAnswer); $('#copyAnswerBtn').addEventListener('click',()=>copyText($('#answerOut').value)); $('#acceptAnswerBtn').addEventListener('click',acceptAnswer);
$('#undoBtn').addEventListener('click',undo); $('#restartBtn').addEventListener('click',()=>state.mode==='online'&&!online.isHost?sendOnline({type:'reset'}):restartGame()); $('#menuBtn').addEventListener('click',goMenu);
$('#soundBtn').addEventListener('click',()=>{settings.sound=!settings.sound;try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}render();if(settings.sound)playTone(500,.08);});
$('#rulesBtn').addEventListener('click',()=>rulesOverlay.classList.remove('hidden')); $$('[data-close-rules]').forEach(btn=>btn.addEventListener('click',()=>rulesOverlay.classList.add('hidden')));
$('#fullscreenBtn').addEventListener('click',async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{showToast('Полный экран недоступен');}});
$('#winnerRestartBtn').addEventListener('click',()=>restartGame(true)); $('#winnerMenuBtn').addEventListener('click',goMenu); $('#resumeBtn').addEventListener('click',loadGame);
window.addEventListener('beforeunload',saveGame); setInterval(()=>{if(!gameApp.classList.contains('hidden'))render();},1000);
try{settings={...settings,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')};}catch{}
updateResume(); render();
