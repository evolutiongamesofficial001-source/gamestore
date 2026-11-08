'use strict';
/* ═══ EVOLUTION GAME STORE v2 ═══ */
const DB_USERS = 'https://uuuuu-52b5b-default-rtdb.firebaseio.com';                                   // contas, avaliações, bibliotecas
const DB_GAMES = 'https://project-8231730293140055887-default-rtdb.asia-southeast1.firebasedatabase.app'; // jogos

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const UA = navigator.userAgent;
const isMobile = () => /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(UA)
  || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1) || window.innerWidth <= 820;

/* ─── Configurações ─── */
const DEF = { tema:'escuro', cor:'azul', fonte:'normal', raio:'medio', densidade:'confortavel', colunas:'auto', anim:true, fundo:true,
  ordem:'padrao', inicio:'loja', heroAuto:true, heroVel:6, ocultarAcima:false, ocultarBreve:false, mostrarNota:true, mostrarClass:true, mostrarPreco:true,
  confirmarDl:true, autoBiblioteca:true, novaAba:true, anonimo:false, avisarEspera:true, sons:false };
let cfg = { ...DEF, ...JSON.parse(localStorage.getItem('egs_cfg') || '{}') };
function applyConfig() {
  const d = document.documentElement.dataset;
  d.tema = cfg.tema; d.cor = cfg.cor; d.fonte = cfg.fonte; d.raio = cfg.raio; d.dens = cfg.densidade; d.cols = cfg.colunas; d.anim = cfg.anim ? 'on' : 'off'; d.fundo = cfg.fundo ? 'on' : 'off';
  document.documentElement.style.setProperty('--hv', cfg.heroVel + 's');
}
let cfgT; function saveCfg() {
  localStorage.setItem('egs_cfg', JSON.stringify(cfg)); applyConfig();
  if (me) { clearTimeout(cfgT); cfgT = setTimeout(() => db(DB_USERS, `usuarios/${me.key}/config`, 'PUT', cfg).catch(() => {}), 600); }
}
applyConfig();

let me = null, games = [], reviews = {}, libIdx = {}, query = '', filter = 'all', genre = '', sort = cfg.ordem, heroTimer = null, heroIdx = 0, draft = { nota: 0 };

/* ─── Firebase REST ─── */
async function db(base, path, method = 'GET', body) {
  const r = await fetch(`${base}/${path}.json`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error('Firebase ' + r.status);
  return r.json();
}
const toArr = d => Array.isArray(d) ? d.filter(Boolean) : d ? Object.values(d) : [];

/* ─── Utilidades ─── */
async function hash(s) {
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('egs::' + s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const c of 'egs::' + s) h = ((h << 5) + h) ^ c.charCodeAt(0); return 'x' + (h >>> 0).toString(36);
}
const userKey = u => u.toLowerCase().replace(/[^a-z0-9_]/g, '_');
const emailKey = e => e.toLowerCase().replace(/[^a-z0-9]/g, c => '_' + c.charCodeAt(0).toString(16));
const ageOf = u => { if (u.nascimento) { const b = new Date(u.nascimento + 'T00:00:00'), n = new Date(); let a = n.getFullYear() - b.getFullYear(); const m = n.getMonth() - b.getMonth(); if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--; return a; } return +u.idade || 0; };
const fmtDate = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR') : (s || '—');
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : ''); clearTimeout(t._t); t._t = setTimeout(() => t.className = 'toast', 3200); }
let actx; function tick() { if (!cfg.sons) return; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 660; g.gain.value = .04; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + .05); } catch {} }

/* ─── Jogos ─── */
const normGame = g => ({
  id: String(g.id ?? '').replace(/[^\w-]/g, ''), nome: g.nome || 'Sem nome', descricao: g.descricao || '', peso: g.peso || '',
  classificacao: String(g.classificacao ?? 'L'), valor: g.valor ?? 0, produtora: (g.produtora || '').trim(),
  genero: Array.isArray(g.genero) ? g.genero : String(g.genero || '').split(',').map(x => x.trim()).filter(Boolean),
  lancamento: g.lancamento || '', versao: g.versao || '', idiomas: g.idiomas || '', requisitos: g.requisitos || '',
  capa: g.capa || '', banner: g.banner || '', link: (g.link || '').trim()
});
const available = g => /^https?:\/\//i.test(g.link);
const ageNum = c => { const n = parseInt(String(c).replace(/\D/g, ''), 10); return isNaN(n) ? 0 : n; };
const ageCls = c => { const n = ageNum(c); return n >= 18 ? 'a18' : n >= 16 ? 'a16' : n >= 14 ? 'a14' : n >= 12 ? 'a12' : n >= 10 ? 'a10' : 'l'; };
const ageTxt = c => ageNum(c) || 'L';
const priceNum = g => parseFloat(String(g.valor).replace(',', '.')) || 0;
const isFree = g => priceNum(g) <= 0;
const priceTxt = g => isFree(g) ? 'Grátis' : 'R$ ' + priceNum(g).toFixed(2).replace('.', ',');
const priceHtml = g => !available(g) ? '<span class="price soon">EM BREVE</span>' : `<span class="price ${isFree(g) ? 'free' : ''}">${priceTxt(g)}</span>`;
const byId = id => games.find(g => g.id === id);
const coverHtml = g => g.capa ? `<img src="${esc(g.capa)}" alt="" loading="lazy">` : `<div class="ph">${esc(g.nome[0] || '?')}</div>`;
const heroImg = g => g.banner ? `<img class="hero-bg" src="${esc(g.banner)}" alt="">` : g.capa ? `<img class="hero-bg blur" src="${esc(g.capa)}" alt="">` : '';
const visible = () => games.filter(g => !(cfg.ocultarAcima && ageNum(g.classificacao) > ageOf(me)) && !(cfg.ocultarBreve && !available(g)));

/* avaliações e biblioteca (contagens) */
const revList = id => Object.values(reviews[id] || {}).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
function rate(id) { const l = revList(id), dist = [0, 0, 0, 0, 0]; l.forEach(r => dist[(r.nota | 0) - 1]++); const n = l.length; return { n, dist, avg: n ? l.reduce((s, r) => s + r.nota, 0) / n : 0 }; }
const libCount = id => Object.keys(libIdx[id] || {}).length;
const stars = v => `<span class="stars" style="--p:${Math.round(v / 5 * 100)}%">★★★★★</span>`;

async function loadAll() {
  const safe = (b, p) => db(b, p).catch(() => null);
  const [g, r, l] = await Promise.all([safe(DB_GAMES, 'jogos'), safe(DB_USERS, 'avaliacoes'), safe(DB_USERS, 'bibliotecas')]);
  let list = toArr(g);
  if (!list.length) { try { list = await (await fetch('jogos.json')).json(); } catch (e) { console.warn(e); } }
  games = list.map(normGame).filter(x => x.id); reviews = r || {}; libIdx = l || {};
}

/* ─── Autenticação ─── */
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
  $('#form-login').classList.toggle('hidden', b.dataset.tab !== 'login');
  $('#form-register').classList.toggle('hidden', b.dataset.tab !== 'register');
});
$('#r-birth').max = new Date().toISOString().slice(0, 10);

$('#form-register').onsubmit = async ev => {
  ev.preventDefault(); const err = $('#r-err'); err.textContent = '';
  const email = $('#r-email').value.trim(), usuario = $('#r-user').value.trim(), nascimento = $('#r-birth').value, senha = $('#r-pass').value;
  const idade = ageOf({ nascimento });
  if (!/^\S+@\S+\.\S+$/.test(email)) return err.textContent = 'E-mail inválido.';
  if (!/^[A-Za-z0-9_]{3,20}$/.test(usuario)) return err.textContent = 'Usuário: 3 a 20 caracteres (letras, números e _).';
  if (!nascimento || isNaN(idade) || idade < 3 || idade > 120) return err.textContent = 'Data de nascimento inválida.';
  if (senha.length < 6) return err.textContent = 'A senha precisa ter ao menos 6 caracteres.';
  const btn = ev.submitter; btn.disabled = true;
  try {
    const uk = userKey(usuario), ek = emailKey(email);
    if (await db(DB_USERS, `usuarios/${uk}`)) throw new Error('Esse usuário já existe.');
    if (await db(DB_USERS, `emails/${ek}`)) throw new Error('Esse e-mail já está cadastrado.');
    const h = await hash(senha);
    await db(DB_USERS, `usuarios/${uk}`, 'PUT', { usuario, email, nascimento, senha: h, criadoEm: new Date().toISOString() });
    await db(DB_USERS, `emails/${ek}`, 'PUT', uk);
    await startSession(uk, h);
  } catch (e) { err.textContent = e.message.startsWith('Firebase') ? 'Erro de conexão. Tente novamente.' : e.message; }
  btn.disabled = false;
};
$('#form-login').onsubmit = async ev => {
  ev.preventDefault(); const err = $('#l-err'); err.textContent = '';
  const id = $('#l-id').value.trim(), senha = $('#l-pass').value; const btn = ev.submitter; btn.disabled = true;
  try {
    const uk = id.includes('@') ? await db(DB_USERS, `emails/${emailKey(id)}`) : userKey(id);
    const u = uk && await db(DB_USERS, `usuarios/${uk}`); const h = await hash(senha);
    if (!u || u.senha !== h) throw new Error('Usuário/e-mail ou senha incorretos.');
    await startSession(uk, h);
  } catch (e) { err.textContent = e.message.startsWith('Firebase') ? 'Erro de conexão. Tente novamente.' : e.message; }
  btn.disabled = false;
};

async function startSession(key, h) {
  const u = await db(DB_USERS, `usuarios/${key}`);
  me = { key, ...u, biblioteca: toArr(u.biblioteca), espera: toArr(u.espera) };
  if (u.config) { cfg = { ...DEF, ...u.config }; localStorage.setItem('egs_cfg', JSON.stringify(cfg)); applyConfig(); }
  sort = cfg.ordem;
  localStorage.setItem('egs_session', JSON.stringify({ key, h }));
  $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#u-avatar').textContent = me.usuario[0].toUpperCase(); $('#u-name').textContent = me.usuario;
  $('#view').innerHTML = '<div class="loading"><div class="spin"></div>Carregando loja...</div>';
  await loadAll(); updateBadges();
  me.biblioteca.forEach(id => { if (!(libIdx[id] || {})[me.key]) { (libIdx[id] = libIdx[id] || {})[me.key] = true; db(DB_USERS, `bibliotecas/${id}/${me.key}`, 'PUT', true).catch(() => {}); } });
  if (!location.hash || location.hash === '#/') location.hash = cfg.inicio === 'biblioteca' ? '#/biblioteca' : cfg.inicio === 'espera' ? '#/espera' : '#/'; else route();
  if (cfg.avisarEspera) { const ok = me.espera.map(byId).filter(g => g && available(g)); if (ok.length) setTimeout(() => toast(`🎮 ${ok[0].nome}${ok.length > 1 ? ` e mais ${ok.length - 1}` : ''} da sua lista de espera já ${ok.length > 1 ? 'estão disponíveis' : 'está disponível'}!`), 900); }
}
function logout() { localStorage.removeItem('egs_session'); location.hash = ''; location.reload(); }
async function restore() {
  try {
    const s = JSON.parse(localStorage.getItem('egs_session') || 'null'); if (!s) return;
    const u = await db(DB_USERS, `usuarios/${s.key}`);
    if (u && u.senha === s.h) await startSession(s.key, s.h); else localStorage.removeItem('egs_session');
  } catch (e) { console.warn(e); }
}

/* ─── Biblioteca / espera ─── */
async function setLibrary(id, add) {
  const had = me.biblioteca.includes(id); if (had === add) return;
  me.biblioteca = add ? [...me.biblioteca, id] : me.biblioteca.filter(x => x !== id);
  if (add) (libIdx[id] = libIdx[id] || {})[me.key] = true; else if (libIdx[id]) delete libIdx[id][me.key];
  try { await db(DB_USERS, `usuarios/${me.key}/biblioteca`, 'PUT', me.biblioteca); await db(DB_USERS, `bibliotecas/${id}/${me.key}`, add ? 'PUT' : 'DELETE', add ? true : undefined); }
  catch { toast('Erro ao salvar na conta.', true); }
}
async function toggleList(field, id) {
  tick();
  if (field === 'biblioteca') { const add = !me.biblioteca.includes(id); await setLibrary(id, add); toast(add ? 'Adicionado à biblioteca' : 'Removido da biblioteca'); }
  else {
    const had = me.espera.includes(id); me.espera = had ? me.espera.filter(x => x !== id) : [...me.espera, id];
    try { await db(DB_USERS, `usuarios/${me.key}/espera`, 'PUT', me.espera); toast(had ? 'Removido da lista de espera' : 'Adicionado à lista de espera'); } catch { toast('Erro ao salvar na conta.', true); }
  }
  updateBadges(); route(true);
}
function updateBadges() { const n = me ? me.espera.length : 0, p = $('#wish-count'); p.textContent = n; p.classList.toggle('hidden', !n); }

/* ─── Download (somente desktop) ─── */
async function baixar(id) {
  const g = byId(id); if (!g) return;
  if (isMobile()) return toast('Downloads só estão disponíveis no computador.', true);
  if (!available(g)) return toast('Este jogo ainda não está disponível.', true);
  if (ageNum(g.classificacao) > ageOf(me)) return toast(`Classificação ${ageNum(g.classificacao)}+ acima da idade da sua conta.`, true);
  if (cfg.confirmarDl && !confirm(`Baixar "${g.nome}"${g.peso ? ' (' + g.peso + ')' : ''}?`)) return;
  const m = g.link.match(/pixeldrain\.com\/(?:u|l)\/([A-Za-z0-9]+)/);
  if (m) { const a = document.createElement('a'); a.href = `https://pixeldrain.com/api/file/${m[1]}?download`; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
  else if (cfg.novaAba) window.open(g.link, '_blank', 'noopener'); else location.href = g.link;
  toast('Download iniciado: ' + g.nome);
  if (cfg.autoBiblioteca && !me.biblioteca.includes(id)) { await setLibrary(id, true); route(true); }
}

/* ─── Avaliações ─── */
async function sendReview(id) {
  const txt = ($('#rv-text').value || '').trim().slice(0, 500);
  if (!draft.nota) return toast('Escolha de 1 a 5 estrelas.', true);
  const r = { nota: draft.nota, texto: txt, usuario: cfg.anonimo ? 'Anônimo' : me.usuario, data: new Date().toISOString() };
  try { await db(DB_USERS, `avaliacoes/${id}/${me.key}`, 'PUT', r); (reviews[id] = reviews[id] || {})[me.key] = r; toast('Avaliação publicada!'); route(true); }
  catch { toast('Não foi possível publicar.', true); }
}
async function delReview(id) {
  if (!confirm('Excluir sua avaliação?')) return;
  try { await db(DB_USERS, `avaliacoes/${id}/${me.key}`, 'DELETE'); if (reviews[id]) delete reviews[id][me.key]; draft = { nota: 0 }; toast('Avaliação removida'); route(true); } catch { toast('Erro ao remover.', true); }
}

/* ─── Componentes ─── */
const sorters = { padrao: () => 0, nome: (a, b) => a.nome.localeCompare(b.nome), nota: (a, b) => rate(b.id).avg - rate(a.id).avg, popular: (a, b) => libCount(b.id) - libCount(a.id), preco: (a, b) => priceNum(a) - priceNum(b), recentes: (a, b) => (b.lancamento || '').localeCompare(a.lancamento || '') };
const card = (g, i = 0) => { const r = rate(g.id); return `<article class="card" style="--i:${Math.min(i, 14)}" data-go="${g.id}"><div class="cover">${coverHtml(g)}<div class="tl">${!available(g) ? '<span class="tag soon">Em breve</span>' : ''}${me.biblioteca.includes(g.id) ? '<span class="tag lib">Na biblioteca</span>' : ''}</div>${cfg.mostrarNota && r.n ? `<span class="rt">★ ${r.avg.toFixed(1)}</span>` : ''}</div>
<div class="card-b"><h3>${esc(g.nome)}</h3><span class="dev">${esc(g.produtora || '—')}</span><div class="card-f">${cfg.mostrarPreco ? priceHtml(g) : '<span></span>'}${cfg.mostrarClass ? `<span class="age ${ageCls(g.classificacao)}">${ageTxt(g.classificacao)}</span>` : ''}</div></div></article>`; };
const grid = list => `<div class="grid">${list.map(card).join('')}</div>`;
const empty = (t, s, btn = true) => `<div class="empty"><div class="eico">🎮</div><h3>${t}</h3><p>${s}</p>${btn ? '<a class="btn btn-primary" href="#/">Explorar a loja</a>' : ''}</div>`;
const matches = g => { const q = query.toLowerCase(); return !q || [g.nome, g.produtora, g.descricao, g.genero.join(' ')].some(x => x.toLowerCase().includes(q)); };
const thumb = g => g.capa ? `<img src="${esc(g.capa)}" alt="">` : `<div class="ph">${esc(g.nome[0])}</div>`;

/* ─── Páginas ─── */
function pageStore() {
  const vis = visible();
  if (query) { const r = vis.filter(matches).sort(sorters[sort]); return `<h1 class="ph-title">Resultados para “${esc(query)}”</h1><p class="ph-sub">${r.length} jogo(s) encontrado(s)</p>${r.length ? grid(r) : empty('Nada encontrado', 'Tente outro nome, gênero ou produtora.', false)}`; }
  if (!vis.length) return empty('Nenhum jogo por aqui', 'Cadastre jogos pelo admin.html ou ajuste os filtros nas configurações.', false);
  const avail = vis.filter(available), soon = vis.filter(g => !available(g));
  const feat = [...avail, ...soon].filter(g => g.banner || g.capa).slice(0, 5); let h = '';
  if (feat.length) h += `<section class="hero"><div class="hero-main">${feat.map((g, i) => `<div class="hero-slide ${i ? '' : 'on'}" data-go="${g.id}">${heroImg(g)}<div class="hero-info"><span class="tag ${available(g) ? '' : 'soon'}">${available(g) ? 'Em destaque' : 'Em breve'}</span><h2>${esc(g.nome)}</h2><p>${esc(g.descricao)}</p><div class="hero-act"><span class="btn btn-primary">Ver detalhes</span>${priceHtml(g)}${rate(g.id).n ? `<span class="rtline">${stars(rate(g.id).avg)}</span>` : ''}</div></div></div>`).join('')}</div>
  <div class="hero-list">${feat.map((g, i) => `<div class="hero-item ${i ? '' : 'on'}" data-hero="${i}">${thumb(g)}<span>${esc(g.nome)}</span></div>`).join('')}</div></section>`;
  const genres = [...new Set(vis.flatMap(g => g.genero))].sort();
  h += `<div class="toolbar"><div class="chips">${[['all', 'Todos'], ['avail', 'Disponíveis'], ['soon', 'Em breve'], ['free', 'Grátis']].map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
  <div class="selects">${genres.length ? `<select data-sel="genre"><option value="">Todos os gêneros</option>${genres.map(x => `<option ${genre === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}
  <select data-sel="sort">${[['padrao', 'Ordem padrão'], ['nome', 'Nome (A-Z)'], ['nota', 'Mais bem avaliados'], ['popular', 'Mais populares'], ['recentes', 'Mais recentes'], ['preco', 'Menor preço']].map(([k, l]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>`;
  const gf = l => l.filter(g => !genre || g.genero.includes(genre)).sort(sorters[sort]);
  if (filter === 'all') {
    const a = gf(avail), s = gf(soon);
    if (a.length) h += `<section class="sec"><div class="sec-h"><h2>Disponíveis agora</h2><span class="cnt">${a.length}</span></div>${grid(a)}</section>`;
    if (s.length) h += `<section class="sec"><div class="sec-h"><h2>Em breve</h2><span class="cnt">${s.length}</span></div>${grid(s)}</section>`;
    if (!a.length && !s.length) h += empty('Nada por aqui', 'Nenhum jogo nesse gênero.', false);
  } else { const l = gf(filter === 'avail' ? avail : filter === 'soon' ? soon : avail.filter(isFree)); h += l.length ? grid(l) : empty('Nada por aqui', 'Nenhum jogo nesta categoria.', false); }
  setTimeout(startHero, 0); return h;
}
function startHero() {
  const slides = document.querySelectorAll('.hero-slide'); if (slides.length < 2) return; heroIdx = 0;
  const go = i => { heroIdx = i; slides.forEach((s, k) => s.classList.toggle('on', k === i)); document.querySelectorAll('.hero-item').forEach((s, k) => s.classList.toggle('on', k === i)); };
  document.querySelectorAll('.hero-item').forEach(el => el.onclick = () => { go(+el.dataset.hero); });
  if (cfg.heroAuto) heroTimer = setInterval(() => go((heroIdx + 1) % slides.length), cfg.heroVel * 1000); else document.querySelector('.hero')?.classList.add('noauto');
}

function pageGame(id) {
  const g = byId(id); if (!g) return empty('Jogo não encontrado', 'Ele pode ter sido removido.');
  const av = available(g), mobile = isMobile(), inLib = me.biblioteca.includes(id), inWish = me.espera.includes(id), blocked = ageNum(g.classificacao) > ageOf(me);
  const R = rate(id), mine = (reviews[id] || {})[me.key], nLib = libCount(id);
  if (draft.id !== id) draft = { id, nota: mine ? mine.nota : 0 };
  let act = '';
  if (av) {
    if (!mobile) act += `<button class="btn btn-primary btn-block btn-lg ${blocked ? 'off' : ''}" data-dl="${id}">⬇ Baixar jogo</button>`;
    act += `<button class="btn btn-block ${inLib ? 'btn-on' : ''}" data-lib="${id}">${inLib ? '✓ Na biblioteca' : '+ Adicionar à biblioteca'}</button>`;
    if (!mobile && blocked) act += `<p class="note warn">Classificação ${ageNum(g.classificacao)}+ acima da idade da sua conta.</p>`;
    if (mobile) act += '<p class="note">Downloads estão disponíveis apenas no computador.</p>';
  } else act += `<button class="btn btn-block off" disabled>Em breve</button><button class="btn btn-primary btn-block ${inWish ? 'btn-on' : ''}" data-wish="${id}">${inWish ? '✓ Na lista de espera' : '+ Adicionar à lista de espera'}</button><p class="note">Este jogo ainda não tem link de download.</p>`;
  const row = (a, b) => b ? `<div class="info-row"><span>${a}</span><span>${b}</span></div>` : '';
  const similar = visible().filter(x => x.id !== id && x.genero.some(t => g.genero.includes(t))).slice(0, 5);
  const revs = revList(id);
  return `<button class="back" onclick="history.back()">‹ Voltar</button>
  <div class="gp-banner">${heroImg(g)}</div>
  <div class="gp-head"><div class="gp-cover">${coverHtml(g)}</div><div class="gp-tit"><div class="gp-tags">${g.genero.map(t => `<span class="gtag">${esc(t)}</span>`).join('')}</div><h1>${esc(g.nome)}</h1>
  <div class="gp-meta"><span>${esc(g.produtora || '—')}</span><span class="age ${ageCls(g.classificacao)}">${ageTxt(g.classificacao)}</span>${R.n ? `<span class="rtline">${stars(R.avg)} <b>${R.avg.toFixed(1)}</b> <small>(${R.n})</small></span>` : '<span>Sem avaliações</span>'}${av ? '' : '<span class="tag soon">Em breve</span>'}</div></div></div>
  <div class="gp-body"><div class="gp-main">
    <div class="box"><h3>Sobre este jogo</h3><p class="desc">${esc(g.descricao) || 'Sem descrição.'}</p></div>
    ${g.requisitos ? `<div class="box"><h3>Requisitos do sistema</h3><p class="desc">${esc(g.requisitos)}</p></div>` : ''}
    <div class="box" id="reviews"><h3>Avaliações e comentários</h3>
      <div class="rsum"><div class="rbig"><b>${R.n ? R.avg.toFixed(1) : '—'}</b>${stars(R.avg)}<small>${R.n} avaliação(ões)</small></div>
      <div class="rbars">${[5, 4, 3, 2, 1].map(n => `<div class="rbar"><span>${n}★</span><i><u style="width:${R.n ? R.dist[n - 1] / R.n * 100 : 0}%"></u></i><em>${R.dist[n - 1]}</em></div>`).join('')}</div></div>
      <div class="rform"><div class="rform-h">${mine ? 'Editar sua avaliação' : 'Deixe sua avaliação'}</div>
      <div class="starpick" id="starpick">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" class="${n <= draft.nota ? 'on' : ''}">★</button>`).join('')}</div>
      <textarea id="rv-text" maxlength="500" rows="3" placeholder="Conte o que achou do jogo (opcional, até 500 caracteres)">${esc(mine ? mine.texto : '')}</textarea>
      <div class="rform-f"><small id="rv-cnt">${(mine ? mine.texto : '').length}/500</small><div>${mine ? `<button class="btn btn-sm btn-danger" data-act="rev-del" data-id="${id}">Excluir</button> ` : ''}<button class="btn btn-sm btn-primary" data-act="rev-send" data-id="${id}">${mine ? 'Atualizar' : 'Publicar'}</button></div></div></div>
      <div class="rlist">${revs.length ? revs.map((r, i) => `<div class="rev" style="--i:${Math.min(i, 8)}"><span class="avatar sm">${esc((r.usuario || '?')[0].toUpperCase())}</span><div class="rev-b"><div class="rev-h"><b>${esc(r.usuario)}</b>${stars(r.nota)}<small>${fmtDate(r.data)}</small></div>${r.texto ? `<p>${esc(r.texto)}</p>` : ''}</div></div>`).join('') : '<p class="muted">Ainda não há avaliações. Seja o primeiro!</p>'}</div>
    </div>
    ${similar.length ? `<div class="sec"><div class="sec-h"><h2>Jogos parecidos</h2></div>${grid(similar)}</div>` : ''}
  </div>
  <aside class="side"><div class="box buy"><div class="big ${!av ? 'soon' : isFree(g) ? 'free' : ''}">${av ? priceTxt(g) : 'Em breve'}</div><div class="btns">${act}</div>
    <div class="pstats"><div><b>${nLib}</b><span>${nLib === 1 ? 'pessoa tem' : 'pessoas têm'} na biblioteca</span></div><div><b>${R.n}</b><span>avaliações</span></div></div></div>
  <div class="box"><h3>Informações</h3>${row('Produtora', esc(g.produtora || '—'))}${row('Lançamento', fmtDate(g.lancamento) !== '—' ? fmtDate(g.lancamento) : '')}${row('Gêneros', esc(g.genero.join(', ')))}${row('Idiomas', esc(g.idiomas))}${row('Versão', esc(g.versao))}${row('Peso', esc(g.peso || '—'))}
  ${row('Classificação', ageNum(g.classificacao) ? ageNum(g.classificacao) + '+ anos' : 'Livre')}${row('Valor', priceTxt(g))}${row('ID', '#' + esc(g.id))}</div></aside></div>`;
}

const rowGame = (g, acts) => `<div class="row"><div data-go="${g.id}">${thumb(g)}</div><div class="grow" data-go="${g.id}"><h3>${esc(g.nome)}</h3><div class="dev">${esc(g.produtora || '—')} · ${esc(g.peso || '—')}${rate(g.id).n ? ` · ★ ${rate(g.id).avg.toFixed(1)}` : ''}</div></div><div class="acts">${acts}</div></div>`;
function pageLibrary() {
  const l = me.biblioteca.map(byId).filter(Boolean), mobile = isMobile();
  return `<h1 class="ph-title">Biblioteca</h1><p class="ph-sub">${l.length} jogo(s) na sua conta</p>` + (l.length ? l.map(g => rowGame(g, `${available(g) ? (mobile ? '' : `<button class="btn btn-primary btn-sm" data-dl="${g.id}">⬇ Baixar</button>`) : '<span class="tag soon">Em breve</span>'}<button class="btn btn-sm btn-danger" data-lib="${g.id}">Remover</button>`)).join('') : empty('Sua biblioteca está vazia', 'Adicione jogos pela página de cada jogo.'));
}
function pageWish() {
  const l = me.espera.map(byId).filter(Boolean);
  return `<h1 class="ph-title">Lista de espera</h1><p class="ph-sub">Jogos que você quer acompanhar</p>` + (l.length ? l.map(g => rowGame(g, `${available(g) ? '<span class="tag lib">Disponível!</span>' : '<span class="tag soon">Em breve</span>'}<button class="btn btn-sm btn-danger" data-wish="${g.id}">Remover</button>`)).join('') : empty('Nenhum jogo na lista de espera', 'Jogos “em breve” podem ser adicionados aqui.'));
}
function pageAccount() {
  const nrev = Object.values(reviews).filter(o => o && o[me.key]).length;
  return `<div class="acc"><h1 class="ph-title">Minha conta</h1><p class="ph-sub">Informações do seu perfil</p>
  <div class="box"><div class="acc-top"><span class="avatar xl">${esc(me.usuario[0].toUpperCase())}</span><div><h2>${esc(me.usuario)}</h2><span class="muted">${esc(me.email)}</span></div></div>
  <div class="stats"><div class="stat"><b>${me.biblioteca.length}</b><span>Biblioteca</span></div><div class="stat"><b>${me.espera.length}</b><span>Em espera</span></div><div class="stat"><b>${nrev}</b><span>Avaliações</span></div></div>
  <div class="info-row"><span>Usuário</span><span>${esc(me.usuario)}</span></div><div class="info-row"><span>E-mail</span><span>${esc(me.email)}</span></div>
  <div class="info-row"><span>Nascimento</span><span>${me.nascimento ? fmtDate(me.nascimento) : '—'}</span></div><div class="info-row"><span>Idade</span><span>${ageOf(me)} anos</span></div>
  <div class="info-row"><span>Membro desde</span><span>${fmtDate(me.criadoEm)}</span></div>
  ${isMobile() ? '<p class="note" style="margin-top:14px">Downloads estão disponíveis apenas no computador.</p>' : ''}
  <div class="btns" style="margin-top:18px"><a class="btn btn-block" href="#/config">⚙ Configurações</a><button class="btn btn-danger btn-block" onclick="logout()">Sair da conta</button></div></div></div>`;
}

/* ─── Configurações ─── */
const SEG = (k, l, d, v) => ({ k, l, d, type: 'seg', v }), TOG = (k, l, d) => ({ k, l, d, type: 'tog' });
const SCHEMA = [
  { t: 'Aparência', i: '🎨', o: [
    SEG('tema', 'Tema', 'Cores gerais da loja', [['escuro', 'Escuro'], ['meianoite', 'Meia-noite'], ['amoled', 'AMOLED'], ['claro', 'Claro']]),
    { k: 'cor', l: 'Cor de destaque', d: 'Botões, brilhos e estrelas', type: 'color', v: [['azul', '#2f7bff'], ['verde', '#10b981'], ['ciano', '#06b6d4'], ['rosa', '#ec4899'], ['laranja', '#f59e0b'], ['vermelho', '#ef4444']] },
    SEG('fonte', 'Tamanho do texto', 'Aumente para ler melhor', [['pequena', 'Pequeno'], ['normal', 'Normal'], ['grande', 'Grande']]),
    SEG('raio', 'Bordas', 'Arredondamento dos elementos', [['reto', 'Retas'], ['medio', 'Médias'], ['redondo', 'Redondas']]),
    SEG('densidade', 'Densidade', 'Espaçamento da interface', [['compacto', 'Compacta'], ['confortavel', 'Confortável']]),
    SEG('colunas', 'Tamanho dos cards', 'Quantidade de jogos por linha', [['grande', 'Grandes'], ['auto', 'Automático'], ['pequeno', 'Pequenos']]),
    TOG('anim', 'Animações', 'Transições e efeitos de movimento'), TOG('fundo', 'Fundo com brilho', 'Luzes suaves no fundo da loja')] },
  { t: 'Loja', i: '🛒', o: [
    SEG('ordem', 'Ordenação padrão', 'Como os jogos aparecem', [['padrao', 'Padrão'], ['nome', 'A-Z'], ['nota', 'Nota'], ['popular', 'Popular'], ['recentes', 'Novos']]),
    SEG('inicio', 'Página inicial', 'Onde abrir ao entrar', [['loja', 'Loja'], ['biblioteca', 'Biblioteca'], ['espera', 'Espera']]),
    TOG('heroAuto', 'Carrossel automático', 'Troca os destaques sozinho'),
    SEG('heroVel', 'Velocidade do carrossel', 'Segundos por destaque', [[4, '4s'], [6, '6s'], [10, '10s']]),
    TOG('mostrarNota', 'Mostrar nota nos cards', 'Estrelas médias nas capas'), TOG('mostrarClass', 'Mostrar classificação', 'Selo de idade nos cards'), TOG('mostrarPreco', 'Mostrar preço', 'Valor nos cards'),
    TOG('ocultarAcima', 'Ocultar jogos acima da minha idade', 'Esconde classificações maiores que a sua idade'), TOG('ocultarBreve', 'Ocultar jogos “em breve”', 'Mostra só jogos disponíveis')] },
  { t: 'Downloads (computador)', i: '⬇', o: [
    TOG('confirmarDl', 'Confirmar antes de baixar', 'Pergunta antes de iniciar'), TOG('autoBiblioteca', 'Adicionar à biblioteca ao baixar', 'Salva o jogo na conta automaticamente'), TOG('novaAba', 'Abrir links externos em nova aba', 'Para hosts que não são Pixeldrain')] },
  { t: 'Notificações e som', i: '🔔', o: [TOG('avisarEspera', 'Avisar jogos da lista de espera', 'Aviso ao entrar quando um jogo for liberado'), TOG('sons', 'Sons de clique', 'Pequeno som ao usar botões')] },
  { t: 'Privacidade', i: '🔒', o: [TOG('anonimo', 'Comentar como anônimo', 'Seu usuário não aparece nas suas avaliações novas')] }
];
function pageSettings() {
  const ctl = o => o.type === 'tog' ? `<label class="sw"><input type="checkbox" data-tg="${o.k}" ${cfg[o.k] ? 'checked' : ''}><i></i></label>`
    : o.type === 'color' ? `<div class="colors">${o.v.map(([k, c]) => `<button class="cdot ${cfg[o.k] === k ? 'on' : ''}" style="--c:${c}" data-cfg="${o.k}" data-val="${k}" title="${k}"></button>`).join('')}</div>`
    : `<div class="seg">${o.v.map(([k, l]) => `<button class="${String(cfg[o.k]) === String(k) ? 'on' : ''}" data-cfg="${o.k}" data-val="${k}">${l}</button>`).join('')}</div>`;
  return `<h1 class="ph-title">⚙ Configurações</h1><p class="ph-sub">Personalize a loja. As opções são salvas na sua conta.</p><div class="cfg">
  ${SCHEMA.filter(s => !(isMobile() && s.i === '⬇')).map(s => `<section class="box cfg-s"><h3><span>${s.i}</span>${s.t}</h3>${s.o.map(o => `<div class="cfg-r"><div><b>${o.l}</b><small>${o.d}</small></div>${ctl(o)}</div>`).join('')}</section>`).join('')}
  <section class="box cfg-s"><h3><span>👤</span>Conta</h3>
   <div class="cfg-r col"><div><b>Data de nascimento</b><small>Define quais jogos você pode baixar (idade atual: ${ageOf(me)} anos)</small></div><div class="inl"><input type="date" id="cf-birth" value="${esc(me.nascimento || '')}" max="${new Date().toISOString().slice(0, 10)}"><button class="btn btn-sm" data-act="birth">Salvar</button></div></div>
   <div class="cfg-r col"><div><b>Alterar senha</b><small>Mínimo de 6 caracteres</small></div><div class="inl"><input type="password" id="cf-p1" placeholder="Senha atual"><input type="password" id="cf-p2" placeholder="Nova senha"><button class="btn btn-sm" data-act="pass">Alterar</button></div></div>
  </section>
  <section class="box cfg-s"><h3><span>🧰</span>Dados e avançado</h3>
   <div class="cfg-r"><div><b>Exportar meus dados</b><small>Baixa um arquivo JSON com sua conta, biblioteca e avaliações</small></div><button class="btn btn-sm" data-act="export">Exportar</button></div>
   <div class="cfg-r"><div><b>Restaurar configurações</b><small>Volta tudo ao padrão da loja</small></div><button class="btn btn-sm" data-act="reset">Restaurar</button></div>
   <div class="cfg-r"><div><b>Atualizar catálogo</b><small>Recarrega jogos, notas e contagens</small></div><button class="btn btn-sm" data-act="reload">Atualizar</button></div>
   <div class="cfg-r"><div><b>Sair da conta</b><small>Encerra a sessão neste aparelho</small></div><button class="btn btn-sm" onclick="logout()">Sair</button></div>
   <div class="cfg-r"><div><b style="color:#ff7b7b">Excluir conta</b><small>Remove permanentemente conta, biblioteca e avaliações</small></div><button class="btn btn-sm btn-danger" data-act="delacc">Excluir</button></div></section></div>`;
}
async function doAct(a, id) {
  if (a === 'rev-send') return sendReview(id);
  if (a === 'rev-del') return delReview(id);
  if (a === 'reload') { toast('Atualizando...'); await loadAll(); updateBadges(); return route(true); }
  if (a === 'reset') { if (!confirm('Restaurar configurações padrão?')) return; cfg = { ...DEF }; saveCfg(); return route(true); }
  if (a === 'birth') { const v = $('#cf-birth').value, n = ageOf({ nascimento: v }); if (!v || isNaN(n) || n < 3 || n > 120) return toast('Data inválida.', true);
    try { await db(DB_USERS, `usuarios/${me.key}/nascimento`, 'PUT', v); me.nascimento = v; toast('Data de nascimento atualizada'); route(true); } catch { toast('Erro ao salvar.', true); } return; }
  if (a === 'pass') { const p1 = $('#cf-p1').value, p2 = $('#cf-p2').value; if (p2.length < 6) return toast('A nova senha precisa ter 6+ caracteres.', true);
    if (await hash(p1) !== me.senha) return toast('Senha atual incorreta.', true);
    const h = await hash(p2); try { await db(DB_USERS, `usuarios/${me.key}/senha`, 'PUT', h); me.senha = h; localStorage.setItem('egs_session', JSON.stringify({ key: me.key, h })); $('#cf-p1').value = $('#cf-p2').value = ''; toast('Senha alterada!'); } catch { toast('Erro ao salvar.', true); } return; }
  if (a === 'export') { const { senha, ...pub } = me; const mine = {}; Object.keys(reviews).forEach(k => { if (reviews[k]?.[me.key]) mine[k] = reviews[k][me.key]; });
    const b = new Blob([JSON.stringify({ conta: pub, avaliacoes: mine, configuracoes: cfg }, null, 2)], { type: 'application/json' }); const l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = `evolution-${me.key}.json`; l.click(); return; }
  if (a === 'delacc') { const p = prompt('Digite sua senha para excluir a conta:'); if (!p) return; if (await hash(p) !== me.senha) return toast('Senha incorreta.', true); if (!confirm('Isso é permanente. Excluir a conta?')) return;
    const jobs = [db(DB_USERS, `usuarios/${me.key}`, 'DELETE'), db(DB_USERS, `emails/${emailKey(me.email)}`, 'DELETE')];
    games.forEach(g => jobs.push(db(DB_USERS, `bibliotecas/${g.id}/${me.key}`, 'DELETE'), db(DB_USERS, `avaliacoes/${g.id}/${me.key}`, 'DELETE'))); await Promise.allSettled(jobs); localStorage.removeItem('egs_cfg'); logout(); }
}

/* ─── Roteamento ─── */
function route(keep) {
  if (!me) return;
  const [, p = '', arg] = (location.hash || '#/').replace('#', '').split('/');
  const r = p === 'jogo' ? 'game' : p === 'biblioteca' ? 'library' : p === 'espera' ? 'wish' : p === 'conta' ? 'account' : p === 'config' ? 'settings' : 'store';
  document.querySelectorAll('[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === r));
  const y = scrollY, v = $('#view'); clearInterval(heroTimer);
  const typing = document.activeElement && ['TEXTAREA', 'INPUT'].includes(document.activeElement.tagName) && v.contains(document.activeElement);
  v.innerHTML = r === 'game' ? pageGame(arg) : r === 'library' ? pageLibrary() : r === 'wish' ? pageWish() : r === 'account' ? pageAccount() : r === 'settings' ? pageSettings() : pageStore();
  if (keep === true) { scrollTo(0, y); v.classList.remove('page-in'); } else { scrollTo(0, 0); v.classList.remove('page-in'); void v.offsetWidth; v.classList.add('page-in'); }
}
window.addEventListener('hashchange', () => route());
window.addEventListener('resize', (() => { let m = null, t; return () => { clearTimeout(t); t = setTimeout(() => { if (me && m !== isMobile()) { m = isMobile(); route(true); } }, 200); }; })());

document.addEventListener('click', e => {
  if (e.target.closest('button,a,.card,.row')) tick();
  const t = e.target.closest('[data-go],[data-dl],[data-lib],[data-wish],[data-filter],[data-cfg],[data-star],[data-act]'); if (!t) return; const d = t.dataset;
  if (d.dl) return baixar(d.dl);
  if (d.lib) return toggleList('biblioteca', d.lib);
  if (d.wish) return toggleList('espera', d.wish);
  if (d.filter) { filter = d.filter; return route(true); }
  if (d.act) return doAct(d.act, d.id);
  if (d.star) { draft.nota = +d.star; document.querySelectorAll('#starpick button').forEach(b => b.classList.toggle('on', +b.dataset.star <= draft.nota)); return; }
  if (d.cfg) { const raw = d.val; cfg[d.cfg] = /^\d+$/.test(raw) ? +raw : raw; if (d.cfg === 'ordem') sort = raw; saveCfg(); return route(true); }
  if (d.go) location.hash = '#/jogo/' + d.go;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.tg) { cfg[t.dataset.tg] = t.checked; saveCfg(); if (['ocultarAcima', 'ocultarBreve'].includes(t.dataset.tg)) toast('Configuração salva'); return; }
  if (t.dataset.sel === 'genre') { genre = t.value; route(true); } if (t.dataset.sel === 'sort') { sort = t.value; route(true); }
});
document.addEventListener('input', e => { if (e.target.id === 'rv-text') $('#rv-cnt').textContent = e.target.value.length + '/500'; });
$('#q').addEventListener('input', e => { query = e.target.value.trim(); if (location.hash && location.hash !== '#/') location.hash = '#/'; else route(true); });
restore();
