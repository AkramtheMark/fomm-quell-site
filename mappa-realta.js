(() => {
  const notice = document.getElementById('notice');
  const map = L.map('realta-map').setView([44.6982, 10.6312], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const safe = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  fetch('backend/api/get_realta_map.php').then(response => response.json()).then(result => {
    if (!result.success) throw new Error(result.message);
    const points = [];
    result.data.forEach(item => {
      const lat = Number(item.latitudine), lng = Number(item.longitudine); if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const detail = `<strong>${safe(item.nome)}</strong><br>${safe(item.tipologia || 'Realtà')} · ${safe(item.luogo_nome)}<br>${Number(item.eventi_pubblicati)} eventi pubblicati`;
      L.marker([lat, lng]).addTo(map).bindPopup(detail); points.push([lat, lng]);
    });
    notice.textContent = points.length ? `${points.length} punti attivi sulla mappa.` : 'Non ci sono ancora realtà con eventi pubblicati e geolocalizzati.';
    if (points.length) map.fitBounds(points, { padding: [35, 35], maxZoom: 14 });
  }).catch(error => { notice.textContent = error.message || 'Impossibile caricare la mappa.'; });
})();
