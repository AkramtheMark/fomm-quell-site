(() => {
  let csrfToken = '';
  const notice = document.getElementById('notice');
  const setNotice = message => { notice.textContent = message || ''; };
  const request = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}) }, ...options });
    const payload = await response.json();
    if (!response.ok || payload.success === false) throw new Error(payload.message || 'Operazione non riuscita.');
    return payload;
  };
  const statusLabel = status => ({ pending: 'In attesa', published: 'Pubblicato', rejected: 'Respinto', draft: 'Bozza' }[status] || status);
  function renderEvents(events) {
    const root = document.getElementById('events-list'); root.replaceChildren();
    if (!events.length) { const empty = document.createElement('p'); empty.className = 'portal-empty'; empty.textContent = 'Non hai ancora inviato eventi.'; root.append(empty); return; }
    events.forEach(event => {
      const card = document.createElement('article'); card.className = 'portal-item';
      const title = document.createElement('h3'); title.textContent = event.titolo; card.append(title);
      const meta = document.createElement('p'); meta.className = 'portal-meta'; meta.textContent = `${event.data || ''}${event.ora_inizio ? ` · ${event.ora_inizio.slice(0, 5)}` : ''} · ${event.luogo_nome || 'Luogo'}`; card.append(meta);
      const status = document.createElement('span'); status.className = `status status-${event.stato}`; status.textContent = statusLabel(event.stato); card.append(status);
      if (event.stato === 'rejected' && event.motivo_rifiuto) { const reason = document.createElement('p'); reason.className = 'portal-meta'; reason.textContent = `Nota: ${event.motivo_rifiuto}`; card.append(reason); }
      root.append(card);
    });
  }
  const fillSelect = (id, items, placeholder, label) => {
    const select = document.getElementById(id); select.replaceChildren(new Option(placeholder, ''));
    items.forEach(item => select.add(new Option(label(item), item.id)));
  };
  async function loadEvents() { const result = await request('backend/api/events_manage.php'); renderEvents(result.data || []); }
  async function start() {
    try {
      const auth = await request('backend/api/auth.php?action=check');
      if (!auth.logged_in || auth.user.ruolo === 'admin') { window.location.replace(auth.logged_in ? 'admin.html' : 'index.html#segnala'); return; }
      csrfToken = auth.csrf_token || '';
      document.getElementById('realta-name').textContent = `Gestisci le proposte di ${auth.user.realta_nomi.join(', ')}.`;
      const [locations, categories] = await Promise.all([request('backend/api/get_locations.php'), request('backend/api/get_categories.php')]);
      fillSelect('luogo', locations.data || [], 'Scegli un luogo', item => `${item.nome}${item.citta ? ` — ${item.citta}` : ''}`);
      fillSelect('categoria', categories.data || [], 'Altro', item => `${item.icona || ''} ${item.nome}`);
      document.getElementById('logout').addEventListener('click', async () => { await request('backend/api/auth.php?action=logout', { method: 'POST' }); window.location.replace('index.html'); });
      document.getElementById('event-form').addEventListener('submit', async event => {
        event.preventDefault();
        const contact = document.getElementById('contatto').value.trim();
        const category = document.getElementById('categoria').value;
        try {
          const result = await request('backend/api/events_manage.php', { method: 'POST', body: JSON.stringify({ titolo: document.getElementById('titolo').value.trim(), descrizione: document.getElementById('descrizione').value.trim(), data: document.getElementById('data').value, ora_inizio: document.getElementById('ora').value, luogo_id: Number(document.getElementById('luogo').value), categorie: category ? [Number(category)] : [], tags: document.getElementById('tags').value, contatti: contact ? [{ dicitura: 'Info', tipo: 'link', valore: contact }] : [] }) });
          document.getElementById('event-form').reset(); setNotice(result.message + ' Sarà visibile pubblicamente dopo la verifica.'); await loadEvents();
        } catch (error) { setNotice(error.message); }
      });
      await loadEvents();
    } catch (error) { setNotice(error.message); }
  }
  start();
})();
