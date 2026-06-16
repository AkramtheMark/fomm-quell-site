/* ==========================================================================
   INTERACTIVE MAP PAGE LOGIC - FÔMM QUELL
   ========================================================================== */
let ALL_EVENTS_DATA = [];  // Tutti gli eventi totali scaricati
let EVENTS_DATA = [];      // Eventi della settimana corrente selezionata
let currentWeekOffset = 0; // Settimana visualizzata rispetto ad oggi (0 = corrente, ecc.)
let currentCategory = 'all'; // Categoria di filtro attiva

let mapInstance = null;
let markersGroup = null;

// Database Coordinate comuni di Reggio Emilia e dintorni (Latitudine, Longitudine)
const VENUE_COORDINATES = {
  "piazza prampolini": [44.6982, 10.6312],
  "piazza fontanesi": [44.6961, 10.6300],
  "teatro valli": [44.7001, 10.6311],
  "piazza della vittoria": [44.7001, 10.6311],
  "chiostri di san pietro": [44.6984, 10.6358],
  "piazza san prospero": [44.6976, 10.6323],
  "reggia di rivalta": [44.6677, 10.5925],
  "parco secchia": [44.5900, 10.7300],
  "yggdrasill viking pub": [44.5772, 10.3734],
  "rossena di canossa": [44.5772, 10.3734],
  "rossena": [44.5772, 10.3734],
  "casalgrande": [44.5900, 10.7300],
  "rivalta": [44.6677, 10.5925],
  "centro storico": [44.6982, 10.6312]
};

// Funzione per ottenere le coordinate con piccolo offset casuale se il luogo non è noto
function getEventCoordinates(venue, address) {
  const vName = (venue || '').toLowerCase();
  const aName = (address || '').toLowerCase();
  
  for (const key in VENUE_COORDINATES) {
    if (vName.includes(key) || aName.includes(key)) {
      // Piccolo offset casuale (jitter) per non sovrapporre pin nello stesso identico luogo
      const jitterLat = (Math.random() - 0.5) * 0.0003;
      const jitterLng = (Math.random() - 0.5) * 0.0003;
      const coords = VENUE_COORDINATES[key];
      return [coords[0] + jitterLat, coords[1] + jitterLng];
    }
  }
  
  // Fallback: Centro di Reggio Emilia con jitter più ampio per sparpagliarli
  const jitterLat = (Math.random() - 0.5) * 0.012;
  const jitterLng = (Math.random() - 0.5) * 0.012;
  return [44.6982 + jitterLat, 10.6312 + jitterLng];
}

// Genera un Marker Leaflet personalizzato brutalista contenente un omino singolo dal folder Omini_Singoli
function getOminiIcon(eventIndex, category) {
  // Sceglie ciclicamente uno dei 102 omini disponibili
  const charIdx = (eventIndex % 102) + 1;
  // Sceglie la parte (1=top, 2=middle, 3=bottom) in base alla categoria
  let part = 1;
  if (category === 'musica') part = 1;
  else if (category === 'spettacolo') part = 2;
  else part = 3;
  
  const iconUrl = `assets/Omini_Singoli/Character_${charIdx}_${part}.png`;
  
  return L.divIcon({
    className: 'custom-omino-marker',
    html: `<div class="omino-marker-wrapper ${category}-border">
             <img src="${iconUrl}" alt="Omino pin">
           </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    popupAnchor: [0, -44]
  });
}

/* ==========================================================================
   DATE HELPERS
   ========================================================================== */
function getWeekDates(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  
  const monday = new Date(now);
  monday.setDate(diff + (offsetWeeks * 7));
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { monday, sunday };
}

function parseDateStr(str) {
  if (!str) return null;
  str = str.trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
  } else if (str.includes('-')) {
    const dObj = new Date(str);
    if (!isNaN(dObj.getTime())) return dObj;
  }
  return null;
}

function parseCSV(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') { row[row.length - 1] += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      row.push("");
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== "") lines.push(row);
  return lines;
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 5000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function fetchCSVWithFallback(sheetUrl) {
  const proxies = [
    sheetUrl,
    `https://corsproxy.io/?url=${encodeURIComponent(sheetUrl)}`,
    `https://corsproxy.io/${sheetUrl}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(sheetUrl)}`
  ];
  for (const proxyUrl of proxies) {
    try {
      const response = await fetchWithTimeout(proxyUrl, { timeout: 4000 });
      if (!response.ok) continue;
      const text = await response.text();
      const cleanText = text.trim();
      if (cleanText && !cleanText.startsWith('<') && (cleanText.includes('startTime') || cleanText.includes('typeMusic') || cleanText.includes('checked,date'))) {
        return cleanText;
      }
    } catch (e) {
      console.warn(`Errore fetch proxy: ${proxyUrl}`, e.message);
    }
  }
  throw new Error("Proxy falliti");
}

/* ==========================================================================
   LOAD DATA
   ========================================================================== */
async function loadDynamicEvents() {
  const googleSheetCsvUrl = 'https://docs.google.com/spreadsheets/d/1jbfVbD7aE-KMvggHzAKLUE90oHCimOfAz4faFMhVAUU/export?format=csv&gid=0';
  let rawEventsData = null;

  try {
    const csvText = await fetchCSVWithFallback(googleSheetCsvUrl);
    const csvRows = parseCSV(csvText);

    if (csvRows && csvRows.length > 3) {
      const eventsList = [];
      const monthNames = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

      for (let i = 3; i < csvRows.length; i++) {
        const row = csvRows[i];
        if (row.length < 5) continue;
        const checked = (row[0] || '').trim();
        if (checked !== 'OK' && checked !== 'FQ') continue;

        const dateStr = (row[1] || '').trim();
        const dateObj = parseDateStr(dateStr);
        if (!dateObj) continue;

        const title = (row[4] || '').trim();
        const descText = (row[5] || '').trim();
        const price = (row[6] || '').trim();
        const info = (row[7] || '').trim();
        const venue = (row[12] || '').trim();
        const location = (row[14] || '').trim();
        
        let category = 'altro';
        if ((row[17] || '').trim().toUpperCase() === 'TRUE') category = 'musica';
        else if ((row[19] || '').trim().toUpperCase() === 'TRUE') category = 'spettacolo';
        else if ((row[18] || '').trim().toUpperCase() === 'TRUE') category = 'cultura';
        else if ((row[20] || '').trim().toUpperCase() === 'TRUE') category = 'arte';
        else if ((row[21] || '').trim().toUpperCase() === 'TRUE') category = 'lab';

        const day = dateObj.getDate();
        const month = monthNames[dateObj.getMonth()];

        let desc = descText;
        let infoParts = [];
        if (price) infoParts.push(`Prezzo: ${price}`);
        if (info) infoParts.push(`Info: ${info}`);
        if (infoParts.length > 0) desc += `\n\n${infoParts.join(' • ')}`;

        eventsList.push({
          id: `sheet-ev-${i}`,
          title: title || 'Senza Titolo',
          category: category,
          dateObj: dateObj,
          date: dateStr,
          day: day,
          month: month,
          time: (row[2] || 'Ora da definire').trim(),
          location: venue || location || 'Reggio Emilia',
          address: `${venue}${venue && location ? ', ' : ''}${location}`,
          desc: desc,
          link: 'https://instagram.com/fommquell'
        });
      }
      rawEventsData = eventsList;
    }
  } catch (error) {
    console.warn("Caricamento remoto fallito, provo fallback locale dati_eventi.json:", error.message);
  }

  if (!rawEventsData) {
    try {
      const response = await fetchWithTimeout('dati_eventi.json', { timeout: 3000 });
      if (response.ok) {
        const localData = await response.json();
        const monthNames = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
        
        rawEventsData = localData.map((ev, index) => {
          const dateObj = parseDateStr(ev.Data);
          let category = 'altro';
          const tipologia = (ev.Tipologia || '').toLowerCase();
          if (tipologia.includes('musica')) category = 'musica';
          else if (tipologia.includes('spettacolo')) category = 'spettacolo';
          else if (tipologia.includes('cultura')) category = 'cultura';
          else if (tipologia.includes('arte')) category = 'arte';
          else if (tipologia.includes('lab')) category = 'lab';

          return {
            id: ev.id || `local-ev-${index}`,
            title: ev.Titolo || 'Senza Titolo',
            category: category,
            dateObj: dateObj,
            date: ev.Data || 'Data da definire',
            day: dateObj ? dateObj.getDate() : 15,
            month: dateObj ? monthNames[dateObj.getMonth()] : 'GIU',
            time: ev.Ora || 'Ora da definire',
            location: (ev.Luogo || '').split(',')[0].trim() || 'Reggio Emilia',
            address: ev.Luogo || 'Reggio Emilia',
            desc: ev.Descrizione || '',
            link: ev.Link || 'https://instagram.com/fommquell'
          };
        });
      }
    } catch (e) {
      console.warn("Caricamento fallback fallito:", e.message);
    }
  }

  if (rawEventsData && rawEventsData.length > 0) {
    ALL_EVENTS_DATA = rawEventsData;
  } else {
    // Eventi statici dimostrativi se tutto fallisce
    ALL_EVENTS_DATA = [
      {
        id: "mock-1",
        title: "READING PARTY REGGIO EMILIA",
        category: "cultura",
        dateObj: new Date(),
        date: "Oggi",
        day: new Date().getDate(),
        month: "GIU",
        time: "18:00",
        location: "Piazza Fontanesi",
        address: "Piazza Fontanesi, Reggio Emilia",
        desc: "Reading party all'aperto nel cuore della piazza.",
        link: "https://instagram.com/fommquell"
      },
      {
        id: "mock-2",
        title: "TORTELLATA DI SAN GIOVANNI",
        category: "spettacolo",
        dateObj: new Date(new Date().setDate(new Date().getDate() + 2)),
        date: "Fra 2 giorni",
        day: new Date(new Date().setDate(new Date().getDate() + 2)).getDate(),
        month: "GIU",
        time: "20:00",
        location: "Piazza Prampolini",
        address: "Piazza Prampolini, Reggio Emilia",
        desc: "La tradizionale tortellata di San Giovanni in piazza.",
        link: "https://instagram.com/fommquell"
      }
    ];
  }

  ALL_EVENTS_DATA.sort((a, b) => (a.dateObj || 0) - (b.dateObj || 0));
  currentWeekOffset = findFirstWeekWithEvents();
}

function findFirstWeekWithEvents() {
  const { monday: curMonday } = getWeekDates(0);
  const upcomingEvents = ALL_EVENTS_DATA.filter(ev => ev.dateObj && ev.dateObj >= curMonday);
  if (upcomingEvents.length === 0) return 0;
  const firstEvent = upcomingEvents[0];
  const diffWeeks = Math.floor((firstEvent.dateObj - curMonday) / (1000 * 60 * 60 * 24 * 7));
  return Math.max(0, diffWeeks);
}

function updateWeekEvents() {
  const { monday, sunday } = getWeekDates(currentWeekOffset);
  EVENTS_DATA = ALL_EVENTS_DATA.filter(ev => ev.dateObj && ev.dateObj >= monday && ev.dateObj <= sunday);
  
  const weekDisplay = document.getElementById("week-display-range");
  if (weekDisplay) {
    const options = { day: 'numeric', month: 'long' };
    weekDisplay.textContent = `DAL ${monday.toLocaleDateString('it-IT', options).toUpperCase()} AL ${sunday.toLocaleDateString('it-IT', options).toUpperCase()}`;
  }
}

/* ==========================================================================
   RENDER MAP & EVENTS
   ========================================================================== */
function renderMapEvents(filter = "all") {
  if (!mapInstance || !markersGroup) return;

  // Cancella i marker esistenti
  markersGroup.clearLayers();
  
  const eventsContainer = document.getElementById("map-events-container");
  if (eventsContainer) eventsContainer.innerHTML = "";

  const filteredEvents = filter === 'all' 
    ? EVENTS_DATA 
    : EVENTS_DATA.filter(ev => ev.category === filter);

  if (filteredEvents.length === 0) {
    if (eventsContainer) {
      eventsContainer.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; border: 2px dashed var(--color-gray); border-radius: var(--border-radius);">
          <p style="font-size: 0.85rem; color: var(--color-gray);">Nessun evento per questa settimana in questa categoria.</p>
        </div>
      `;
    }
    return;
  }

  filteredEvents.forEach((event, index) => {
    const coords = getEventCoordinates(event.location, event.address);
    
    // Icona personalizzata omino
    const icon = getOminiIcon(index, event.category);
    
    // Popup brutalista
    const popupHtml = `
      <div class="popup-title">${event.title}</div>
      <div class="popup-meta">📍 ${event.location} • ${event.time}</div>
      <div class="popup-desc">${event.desc.length > 90 ? event.desc.substring(0, 90) + '...' : event.desc}</div>
      <a href="${event.link}" target="_blank" class="popup-btn">DETTAGLI EVENTO</a>
    `;

    // Crea marker
    const marker = L.marker(coords, { icon: icon }).bindPopup(popupHtml);
    markersGroup.addLayer(marker);

    // Aggiungi all'elenco della sidebar
    if (eventsContainer) {
      const item = document.createElement("div");
      item.className = "map-event-item";
      item.innerHTML = `
        <div class="map-event-meta">${event.date} - Ore ${event.time}</div>
        <h4>${event.title}</h4>
        <div class="map-event-loc">📍 ${event.location}</div>
      `;
      
      item.addEventListener("click", () => {
        // Zoom e focus sul marker al click della sidebar
        mapInstance.setView(coords, 14, { animate: true });
        marker.openPopup();
      });

      eventsContainer.appendChild(item);
    }
  });

  // Re-inizializza cursor hover states per gli elementi dinamici della sidebar
  initCustomCursorHoverStates();
}

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
function initMapPage() {
  // 1. Inizializzazione Mappa centrata su Reggio Emilia
  mapInstance = L.map('leaflet-map', {
    scrollWheelZoom: false, // previene scroll trap
    twoFingerDrag: true,    // consente scorrimento a due dita su mobile
    zoomControl: false      // disattiviamo il default per metterne uno brutalista
  }).setView([44.6982, 10.6312], 13);

  // Aggiunge pulsanti zoom personalizzati brutalisti
  L.control.zoom({
    position: 'topright'
  }).addTo(mapInstance);

  // Carica i tileset scuri di CartoDB (Dark Matter)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(mapInstance);

  markersGroup = L.layerGroup().addTo(mapInstance);

  // 2. Binding pulsanti settimana
  const prevWeekBtn = document.getElementById("prev-week-btn");
  const nextWeekBtn = document.getElementById("next-week-btn");

  if (prevWeekBtn) {
    prevWeekBtn.addEventListener("click", () => {
      currentWeekOffset--;
      updateWeekEvents();
      renderMapEvents(currentCategory);
    });
  }

  if (nextWeekBtn) {
    nextWeekBtn.addEventListener("click", () => {
      currentWeekOffset++;
      updateWeekEvents();
      renderMapEvents(currentCategory);
    });
  }

  // 3. Binding filtri categoria
  const filterBtns = document.querySelectorAll(".filter-wrapper .filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      filterBtns.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      const filterValue = e.target.getAttribute("data-filter");
      currentCategory = filterValue;
      renderMapEvents(filterValue);
    });
  });

  // 4. Carica eventi e renderizza
  loadDynamicEvents().then(() => {
    updateWeekEvents();
    renderMapEvents("all");
    
    // Zoom ottimale per racchiudere i marker se presenti
    if (markersGroup.getLayers().length > 0) {
      const bounds = L.featureGroup(markersGroup.getLayers()).getBounds();
      mapInstance.fitBounds(bounds, { padding: [40, 40] });
    }
  });

  // Inizializza il cursore personalizzato
  initCustomCursor();
}

/* ==========================================================================
   CUSTOM CURSOR
   ========================================================================== */
function initCustomCursor() {
  const cursor = document.querySelector(".custom-cursor");
  if (!cursor) return;

  document.body.classList.add("has-custom-cursor");

  document.addEventListener("mousemove", (e) => {
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";
  });

  document.addEventListener("mousedown", () => {
    cursor.style.width = "12px";
    cursor.style.height = "12px";
    cursor.style.backgroundColor = "var(--color-pink)";
  });

  document.addEventListener("mouseup", () => {
    cursor.style.width = "20px";
    cursor.style.height = "20px";
    cursor.style.backgroundColor = "transparent";
  });

  initCustomCursorHoverStates();
}

function initCustomCursorHoverStates() {
  const cursor = document.querySelector(".custom-cursor");
  if (!cursor) return;

  const hoverableElements = document.querySelectorAll(
    "a, button, select, input, textarea, .map-event-item, .leaflet-interactive, .filter-btn, .week-nav-btn"
  );

  hoverableElements.forEach(el => {
    el.addEventListener("mouseenter", () => {
      cursor.style.width = "40px";
      cursor.style.height = "40px";
      cursor.style.backgroundColor = "rgba(255, 46, 147, 0.15)";
      cursor.style.borderColor = "var(--color-pink)";
    });

    el.addEventListener("mouseleave", () => {
      cursor.style.width = "20px";
      cursor.style.height = "20px";
      cursor.style.backgroundColor = "transparent";
      cursor.style.borderColor = "var(--color-pink)";
    });
  });
}

// Avvio dell'app sicuro
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMapPage);
} else {
  initMapPage();
}
