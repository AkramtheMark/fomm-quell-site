(() => {
  let csrfToken = '';
  const notice = document.getElementById('notice');
  const setNotice = message => { notice.textContent = message || ''; };
  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}) },
      ...options
    });
    const payload = await response.json();
    if (!response.ok || payload.success === false) throw new Error(payload.message || 'Operazione non riuscita.');
    return payload;
  };
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
  const date = value => value ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : 'Data non indicata';
  const actionButton = (label, className, handler) => { const button = el('button', label, `portal-btn ${className || ''}`); button.type = 'button'; button.addEventListener('click', handler); return button; };

  async function runAdminAction(action, data) {
    const result = await request(`backend/api/admin_manage.php?action=${action}`, { method: 'POST', body: JSON.stringify(data) });
    setNotice(result.message);
    await loadLists();
  }
  function renderRealta(items) {
    const root = document.getElementById('realta-list'); root.replaceChildren();
    if (!items.length) { root.append(el('p', 'Nessuna realtà da verificare.', 'portal-empty')); return; }
    items.forEach(item => {
      const card = el('article', '', 'portal-item'); card.append(el('h3', item.nome));
      card.append(el('p', [item.tipologia, item.email, item.created_at ? `Richiesta: ${date(item.created_at.slice(0, 10))}` : ''].filter(Boolean).join(' · '), 'portal-meta'));
      const actions = el('div', '', 'portal-actions');
      actions.append(actionButton('APPROVA', '', async () => { try { await runAdminAction('approve_realta', { realta_id: item.id }); } catch (error) { setNotice(error.message); } }));
      actions.append(actionButton('RESPINGI', 'danger', async () => { const motivo = window.prompt('Motivazione (facoltativa):'); if (motivo === null) return; try { await runAdminAction('reject_realta', { realta_id: item.id, motivo }); } catch (error) { setNotice(error.message); } }));
      card.append(actions); root.append(card);
    });
  }
  function renderEvents(items) {
    const root = document.getElementById('events-list'); root.replaceChildren();
    if (!items.length) { root.append(el('p', 'Nessun evento da verificare.', 'portal-empty')); return; }
    items.forEach(item => {
      const card = el('article', '', 'portal-item'); card.append(el('h3', item.titolo));
      card.append(el('p', `${date(item.data)} · ${item.realta_nome || 'Senza realtà'} · ${item.luogo_nome || 'Luogo non indicato'}`, 'portal-meta'));
      const actions = el('div', '', 'portal-actions');
      actions.append(actionButton('PUBBLICA', '', async () => { try { await runAdminAction('approve_event', { evento_id: item.id }); } catch (error) { setNotice(error.message); } }));
      actions.append(actionButton('RESPINGI', 'danger', async () => { const motivo = window.prompt('Motivazione (facoltativa):'); if (motivo === null) return; try { await runAdminAction('reject_event', { evento_id: item.id, motivo }); } catch (error) { setNotice(error.message); } }));
      card.append(actions); root.append(card);
    });
  }
  function renderUsers(items) {
    const root = document.getElementById('users-list'); root.replaceChildren();
    if (!items.length) { root.append(el('p', 'Nessun account disponibile.', 'portal-empty')); return; }
    items.slice(0, 30).forEach(item => {
      const card = el('article', '', 'portal-item'); card.append(el('h3', `${item.nome} ${item.cognome}`));
      card.append(el('p', `${item.email} · ${item.ruolo} · ${Number(item.attivo) ? 'attivo' : 'disattivato'}`, 'portal-meta'));
      if (item.ruolo !== 'admin') {
        card.append(actionButton(Number(item.attivo) ? 'DISATTIVA' : 'RIATTIVA', Number(item.attivo) ? 'danger' : '', async () => { try { await runAdminAction('toggle_user', { user_id: item.id, attivo: Number(item.attivo) ? 0 : 1 }); } catch (error) { setNotice(error.message); } }));
      }
      root.append(card);
    });
  }
  function renderLogs(items) {
    const root = document.getElementById('logs-list'); root.replaceChildren();
    if (!items.length) { root.append(el('p', 'Nessuna attività registrata.', 'portal-empty')); return; }
    items.slice(0, 15).forEach(item => {
      const card = el('article', '', 'portal-item'); card.append(el('h3', item.azione || 'Attività'));
      card.append(el('p', `${item.descrizione || ''}${item.operatore_nome ? ` · ${item.operatore_nome}` : ''}`, 'portal-meta')); root.append(card);
    });
  }
  async function loadLists() {
    try {
      const [realta, events, users, logs] = await Promise.all([request('backend/api/admin_manage.php?action=list_pending_realta'), request('backend/api/events_manage.php'), request('backend/api/admin_manage.php?action=list_users'), request('backend/api/admin_manage.php?action=list_logs')]);
      renderRealta(realta.data || []); renderEvents((events.data || []).filter(event => event.stato === 'pending'));
      renderUsers(users.data || []); renderLogs(logs.data || []);
    } catch (error) { setNotice(error.message); }
  }
  async function start() {
    try {
      const auth = await request('backend/api/auth.php?action=check');
      if (!auth.logged_in || auth.user.ruolo !== 'admin') { window.location.replace('index.html#segnala'); return; }
      csrfToken = auth.csrf_token || '';
      document.getElementById('admin-welcome').textContent = `Accesso amministratore: ${auth.user.nome} ${auth.user.cognome}`;
      document.getElementById('logout').addEventListener('click', async () => { await request('backend/api/auth.php?action=logout', { method: 'POST' }); window.location.replace('index.html'); });
      await loadLists();
    } catch (error) { setNotice(error.message); }
  }
  start();
})();
