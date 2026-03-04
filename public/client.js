// Mini‑IRC client – runs in the browser
const logEl   = document.getElementById('log');
const input   = document.getElementById('input');
const nickTag = document.getElementById('nick');
const chanTag = document.getElementById('chan');

const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProto}://${location.host}`);

let myNick = '';
let myChan = '';

function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function addLine(html, cls=''){
  const el=document.createElement('div');
  if(cls) el.className=cls;
  el.innerHTML=html;
  logEl.appendChild(el);
  logEl.scrollTop=logEl.scrollHeight;
}

function renderChat(msg){
  const t = new Date(msg.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const cls = msg.nick===myNick ? 'self' : 'other';
  addLine(`[${t}] <${esc(msg.nick)}> ${esc(msg.text)}`, cls);
}

ws.onmessage = ev => {
  const data = JSON.parse(ev.data);
  switch(data.type){
    case 'welcome':
      myNick = data.nick; myChan = data.channel;
      nickTag.textContent = myNick; chanTag.textContent = myChan;
      break;
    case 'history':
      data.messages.forEach(renderChat);
      break;
    case 'info':
      addLine(`* ${esc(data.text)}`, 'info');
      break;
    case 'error':
      addLine(`! ${esc(data.text)}`, 'info');
      break;
    case 'chat':
      renderChat(data);
      break;
    case 'pm':
      const dir = data.from===myNick ? '→' : '←';
      addLine(`${esc(data.from)} ${dir} ${esc(data.text)}`, 'pm');
      break;
  }
};

input.addEventListener('keydown', e => {
  if(e.key!=='Enter') return;
  const txt = input.value.trim();
  if(!txt) return;
  ws.send(JSON.stringify({type:'text', text:txt}));
  input.value='';
});
