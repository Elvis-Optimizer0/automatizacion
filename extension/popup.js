const $ = (sel) => document.querySelector(sel);

let currentTab = null;
let currentFrameId = null;
let currentDetection = null;
let currentProfile = null;

function escapeHtml(text) {
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

function formatTime(ms) { if (!ms || ms < 0) return 'calculando...'; const s = Math.floor(ms/1000), m = Math.floor(s/60), h = Math.floor(m/60); return h>0?`${h}h ${m%60}m`:m>0?`${m}m ${s%60}s`:`${s}s`; }

function sendToContent(type, data={}) {
  if (!currentTab?.id) return Promise.resolve({error:'No tab'});
  const target = currentFrameId != null
    ? { tabId: currentTab.id, frameIds: [currentFrameId] }
    : { tabId: currentTab.id, allFrames: true };
  return chrome.scripting.executeScript({
    target,
    func: (t, d) => window.__colaPromptsContent?.[t]?.(d),
    args: [type, data]
  }).then(rs => {
    const ok = rs.filter(r => r.result && !r.result.error);
    ok.sort((a, b) => (b.result.input?.score || 0) - (a.result.input?.score || 0));
    const best = ok[0];
    if (type === 'ENSURE_DETECTED' && best?.result?.input) currentFrameId = best.frameId;
    return best ? best.result : (rs[0]?.result ?? { error: 'Sin respuesta de la página' });
  }).catch(e => ({ error: e.message }));
}

function sendToPopup(type, data={}) { return new Promise(resolve => chrome.runtime.sendMessage({type, ...data}, resolve)); }

async function ensureInjected() {
  if (!currentTab?.id) return {success:false, error:'No active tab'};
  const blocked = ['chrome:', 'edge:', 'brave:', 'opera:', 'about:', 'chrome-extension:'];
  if (blocked.some(p => currentTab.url?.startsWith(p))) return {success:false, error:'El navegador no permite extensiones en esta página. Abre la web donde vas a usar los prompts.'};
  try {
    await chrome.scripting.executeScript({target:{tabId:currentTab.id, allFrames:true}, files:['detect.js','content.js']});
    await new Promise(r => setTimeout(r, 300));
    const ping = await sendToContent('PING');
    if (!ping?.ok) throw new Error('No response');
    return {success:true};
  } catch (e) {
    if (e.message.includes('Cannot access contents')) return {success:false, error:'El navegador bloqueó el acceso a esta página. Recárgala (F5) y vuelve a abrir esta ventana.'};
    return {success:false, error:e.message};
  }
}

function updateStatus(state) {
  const ind = $('#status-indicator'), dot = ind.querySelector('.status-dot'), txt = ind.querySelector('.status-text');
  ind.classList.remove('ready','error','connecting');
  if (!state) { ind.classList.add('error'); txt.textContent = 'Sin conexión'; return; }
  if (state.success) { ind.classList.add('ready'); txt.textContent = 'Lista en esta página'; }
  else { ind.classList.add('error'); txt.textContent = `No se pudo preparar la página: ${state.error}`; }
}

function renderQueue(queue) {
  const done = queue.filter(q=>q.status==='done').length, total = queue.length;
  $('#done-count').textContent = done; $('#total-count').textContent = total;
  const list = $('#queue-list');
  if (!total) { list.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:20px;">Cola vacía</div>'; return; }
  list.innerHTML = queue.map(item => {
    const icons = {pending:'⏳',running:'⚙️',done:'✅',error:'❌'};
    const err = item.error ? ` data-error="${escapeHtml(item.error)}"` : '';
    return `<div class="queue-item"><span class="status-icon ${item.status}">${icons[item.status]||'⏳'}</span><span class="prompt-text" title="${escapeHtml(item.text)}">${escapeHtml(item.text.slice(0,60))}</span>${item.status==='error'?`<span class="error-tooltip"${err}>⚠</span>`:''}</div>`;
  }).join('');
}

function updateProgress(state) {
  const q = state.queue, done = q.filter(x=>x.status==='done').length, run = q.find(x=>x.status==='running'), pend = q.filter(x=>x.status==='pending').length, tot = q.length;
  const pi = $('#progress-info'), pf = $('#progress-fill'), pt = $('#progress-text');
  if (!tot) { pi.hidden = true; return; }
  pi.hidden = false; pf.style.width = `${tot?(done/tot)*100:0}%`;
  if (state.running && !state.paused && run) { const avg = q.filter(x=>x.status==='done'&&x.startedAt&&x.finishedAt).reduce((a,b)=>a+(b.finishedAt-b.startedAt),0)/Math.max(1,q.filter(x=>x.status==='done'&&x.startedAt&&x.finishedAt).length); pt.textContent = `Tiempo restante: ${formatTime(pend*avg)}`; }
  else if (state.paused) pt.textContent = 'Pausado';
  else if (done===tot && tot>0) pt.textContent = '¡Completado!';
  else pt.textContent = 'Listo para iniciar';
}

function renderLogs() { chrome.storage.local.get('colaPromptsLogs', d => { const logs = d.colaPromptsLogs || []; $('#log-container').innerHTML = logs.map(e => { const t=e.substring(0,8), m=e.substring(9); let c='info'; if(m.startsWith('ERROR'))c='error';else if(m.includes('completad')||m.includes('guardado'))c='success';else if(m.includes('advert')||m.includes('warning'))c='warning'; return `<div class="log-entry ${c}"><span style="color:var(--text-dim)">${t}</span> ${escapeHtml(m)}</div>`; }).join(''); }); }

async function renderDiagnostic() {
  const {siteProfiles={}} = await new Promise(r=>chrome.storage.local.get('siteProfiles',r));
  const profile = siteProfiles[currentTab?.url?new URL(currentTab.url).hostname:''];
  const logs = await new Promise(r=>chrome.storage.local.get('colaPromptsLogs',d=>r(d.colaPromptsLogs||[])));
  const txt = [
    `Versión: ${chrome.runtime.getManifest().version}`,
    `URL: ${currentTab?.url}`, `Hostname: ${currentTab?.url?new URL(currentTab.url).hostname:'N/A'}`,
    `Detección: ${currentDetection?currentDetection.success?'ok':currentDetection.error:'pendiente'}`,
    `Perfil guardado: ${profile?'sí':'no'}`,
    `Últimos logs:`, ...logs.slice(-10).map(l=>`  ${l}`)
  ].join('\n');
  $('#diagnostic-content').textContent = txt;
}

async function loadState() {
  const state = await sendToPopup('GET_STATE');
  if (state?.state) {
    renderQueue(state.queue);
    updateProgress(state);
    $('#start-btn').disabled = !state.running && (state.queue?.length||0)===0;
    $('#pause-btn').disabled = !state.running || state.paused;
    $('#stop-btn').disabled = !state.running;
    $('#setting-delay').value = state.settings?.delayBetweenMs/1000 || 3;
    $('#setting-timeout').value = state.settings?.timeoutPerPromptMs/1000 || 180;
    $('#setting-retries').value = state.settings?.maxRetries || 2;
    $('#setting-images').value = state.settings?.imagesPerPrompt || 1;
    $('#setting-submit-method').value = state.settings?.submitMethod || 'auto';
    renderDiagnostic();
  }
}

function notify(msg, type='info') { const n=document.createElement('div'); n.className=`notification ${type}`; n.textContent=msg; document.body.appendChild(n); setTimeout(()=>{n.style.animation='slideUp 0.3s ease';setTimeout(()=>n.remove(),300);},3000); }

function setup() {
  $('#detect-btn').onclick = async () => {
    const res = await ensureInjected();
    updateStatus(res);
    if (!res.success) { notify(res.error,'error'); return; }
    currentDetection = await sendToContent('ENSURE_DETECTED', {frameId: currentFrameId});
    if (!currentDetection.success) { notify(currentDetection.error,'error'); updateStatus(currentDetection); return; }
    const inp = currentDetection.input;
    const sub = currentDetection.submit;
    $('#detection-result').hidden = false;
    $('#detected-input').textContent = inp ? `${inp.type} · "${inp.label.slice(0,40)}" (puntuación ${inp.score.toFixed(1)})` : 'No detectada';
    $('#detected-submit').textContent = sub ? `${sub.type} · "${sub.label.slice(0,40)}" (puntuación ${sub.score.toFixed(1)})` : 'Sin botón: se enviará con Enter';
    $('#next-input-btn').hidden = false;
    $('#next-submit-btn').hidden = false;
    $('#test-input-btn').hidden = false;
    $('#test-submit-btn').hidden = false;
    $('#pick-input-btn').hidden = false;
    $('#pick-submit-btn').hidden = false;
    $('#forget-btn').hidden = false;
    notify('Detección completada','success');
  };

  $('#next-input-btn').onclick = async () => {
    if (!currentDetection?.input) return;
    const inputs = currentDetection.alternatives || [];
    if (!inputs.length) return notify('No hay más candidatos','info');
    currentDetection.input = inputs.shift();
    $('#detected-input').textContent = `${currentDetection.input.type} · "${currentDetection.input.label.slice(0,40)}" (puntuación ${currentDetection.input.score.toFixed(1)})`;
  };

  $('#next-submit-btn').onclick = async () => {
    if (!currentDetection?.submit) return;
    const alts = currentDetection.alternatives || [];
    if (!alts.length) return notify('No hay más candidatos','info');
    currentDetection.submit = alts.shift();
    $('#detected-submit').textContent = `${currentDetection.submit.type} · "${currentDetection.submit.label.slice(0,40)}" (puntuación ${currentDetection.submit.score.toFixed(1)})`;
  };

  $('#test-input-btn').onclick = async () => {
    if (!currentDetection?.input?.selector) return notify('No hay selector','error');
    await sendToContent('TEST_ELEMENT', {selector: currentDetection.input.selector, elementType: 'input'});
    notify('Probando caja...','info');
  };

  $('#test-submit-btn').onclick = async () => {
    if (!currentDetection?.submit?.selector) return notify('No hay selector','error');
    await sendToContent('TEST_ELEMENT', {selector: currentDetection.submit.selector, elementType: 'submit'});
    notify('Probando botón...','info');
  };

  $('#pick-input-btn').onclick = async () => {
    await sendToContent('PICK_INPUT');
    window.close();
  };

  $('#pick-submit-btn').onclick = async () => {
    await sendToContent('PICK_SUBMIT');
    window.close();
  };

  $('#forget-btn').onclick = async () => {
    const host = currentTab?.url?new URL(currentTab.url).hostname:'';
    if (host && confirm(`Olvidar perfil para ${host}?`)) {
      await sendToPopup('CLEAR_PROFILE', {hostname: host});
      notify('Perfil olvidado','success');
    }
  };

  $('#add-prompts').onclick = async () => {
    const text = $('#prompts-textarea').value.trim();
    if (!text) return;
    const prompts = text.split('\n').map(l=>l.replace(/^\s*PROMPT\s*\d+\s*[:.\-]\s*/i,'').trim()).filter(l=>l);
    const uniq = [...new Set(prompts)];
    await sendToPopup('ADD_PROMPTS', {prompts: uniq});
    $('#prompts-textarea').value = '';
    loadState();
  };

  $('#import-prompts').onclick = () => $('#import-file').click();
  $('#import-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const txt = await f.text();
    try { const d=JSON.parse(txt); if(d.queue) await sendToPopup('IMPORT_STATE',{json:txt}); else {const p=txt.split('\n').map(l=>l.trim()).filter(l=>l); await sendToPopup('ADD_PROMPTS',{prompts:p});} } catch { const p=txt.split('\n').map(l=>l.trim()).filter(l=>l); await sendToPopup('ADD_PROMPTS',{prompts:p}); }
    e.target.value=''; loadState();
  };

  $('#export-state').onclick = async () => {
    const r = await sendToPopup('EXPORT_STATE');
    if (r?.state) { const blob=new Blob([r.state],{type:'application/json'}); const u=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=u; a.download=`cola-prompts-${Date.now()}.json`; a.click(); URL.revokeObjectURL(u); notify('Exportado','success'); }
  };

  $('#start-btn').onclick = async () => {
    const res = await ensureInjected();
    if (!res.success) { notify(res.error,'error'); updateStatus(res); return; }
    const det = await sendToContent('ENSURE_DETECTED', {frameId: currentFrameId});
    if (!det.success || !det.input) { notify('No encuentro una caja de texto en esta página','error'); return; }
    await sendToPopup('START_QUEUE');
    notify('Cola iniciada','success');
    loadState();
  };

  $('#pause-btn').onclick = async () => { await sendToPopup('PAUSE_QUEUE'); loadState(); };
  $('#stop-btn').onclick = async () => { await sendToPopup('STOP_QUEUE'); loadState(); };
  $('#clear-btn').onclick = async () => { if(confirm('Limpiar toda la cola?')) { await sendToPopup('CLEAR_QUEUE'); loadState(); } };
  $('#retry-btn').onclick = async () => { await sendToPopup('RETRY_ERRORS'); loadState(); };

  ['setting-delay','setting-timeout','setting-retries','setting-images','setting-submit-method'].forEach(id => {
    $('#' + id).onchange = async () => {
      await sendToPopup('UPDATE_SETTINGS', {settings: {
        delayBetweenMs: parseFloat($('#setting-delay').value)*1000,
        timeoutPerPromptMs: parseFloat($('#setting-timeout').value)*1000,
        maxRetries: parseInt($('#setting-retries').value),
        imagesPerPrompt: parseInt($('#setting-images').value),
        submitMethod: $('#setting-submit-method').value
      }});
    };
  });

  $('#copy-diagnostic').onclick = async () => {
    const diag = { version: chrome.runtime.getManifest().version, timestamp: new Date().toISOString(), tab: currentTab?{url:currentTab.url,title:currentTab.title}:null, detection: currentDetection, profile: currentProfile, logs: await new Promise(r=>chrome.storage.local.get('colaPromptsLogs',d=>r(d.colaPromptsLogs||[]))) };
    await navigator.clipboard.writeText(JSON.stringify(diag,null,2));
    notify('Diagnóstico copiado','success');
  };
}

async function init() {
  const tabs = await chrome.tabs.query({active:true, currentWindow:true});
  currentTab = tabs[0];
  const res = await ensureInjected();
  updateStatus(res);
  if (!res.success) {
    $('#detect-btn').disabled = true;
    $('#start-btn').disabled = true;
    $('#pause-btn').disabled = true;
    $('#stop-btn').disabled = true;
  }
  loadState();
  setup();
  setInterval(loadState, 2000);
  setInterval(renderLogs, 3000);
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();