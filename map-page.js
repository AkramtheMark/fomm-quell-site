/* ==========================================================================
   INTERACTIVE MAP PAGE LOGIC - FÔMM QUELL
   ========================================================================== */
let ALL_EVENTS_DATA = [];  // Tutti gli eventi totali scaricati
let EVENTS_DATA = [];      // Eventi della settimana corrente selezionata
let currentWeekOffset = 0; // Settimana visualizzata rispetto ad oggi (0 = corrente, ecc.)
let currentCategory = 'all'; // Categoria di filtro attiva
let OMINI_LIST = { part1: [], part2: [], part3: [] }; // Lista dinamica omini da omini_list.json
let REMOTE_VENUE_COORDINATES = {}; // Mappatura locale -> coordinate scaricata dal secondo foglio

// GID della scheda "coordinate" nel tuo Google Sheet.
const GOOGLE_SHEET_LOCALI_GID = '223441192';

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

// Normalizza stringhe rimuovendo accenti, punteggiatura e spazi multipli
function normalizeString(str, removeSpaces = false) {
  if (!str) return '';
  let res = str.toLowerCase().trim();
  res = res.replace(/&/g, 'e');
  
  // Rimpiazzo accenti
  const accents = {
    'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a',
    'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
    'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
    'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
    'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
    'ç': 'c', 'ñ': 'n'
  };
  for (const char in accents) {
    res = res.replaceAll(char, accents[char]);
  }
  
  // Rimuove punteggiatura e caratteri speciali
  res = res.replace(/[^a-z0-9\s]/g, '');
  
  // Normalizza gli spazi
  res = res.replace(/\s+/g, ' ').trim();
  
  if (removeSpaces) {
    res = res.replace(/\s/g, '');
  }
  
  return res;
}

// Verifica se c'è corrispondenza tra il locale dell'evento e il nome in archivio
function checkVenueMatch(venue, location, key) {
  const vSp = normalizeString(venue, false);
  const vNs = normalizeString(venue, true);
  
  const kSp = normalizeString(key, false);
  const kNs = normalizeString(key, true);
  
  // 1. Corrispondenza esatta senza spazi (es: "reggianestreetpark" === "reggianestreetpark")
  if (vNs === kNs && vNs) return true;
  
  // 2. Sotto-stringa contenuta (con spazi, min 5 caratteri per evitare falsi positivi)
  if (kSp.length >= 5 && vSp.includes(kSp)) return true;
  if (vSp.length >= 5 && kSp.includes(vSp)) return true;
  
  // 3. Controlla anche l'indirizzo combinato (locale + località)
  const addrSp = normalizeString(`${venue} ${location}`, false);
  if (kSp.length >= 5 && addrSp.includes(kSp)) return true;
  
  return false;
}

// Funzione per ottenere le coordinate con piccolo offset casuale se il luogo non è noto
function getEventCoordinates(venue, address) {
  // Riconosce la città estraendola dall'indirizzo o passando un valore di default
  const city = address && address.includes(',') ? address.split(',')[1].trim() : 'Reggio Emilia';
  
  // 1. Cerca nel database scaricato dinamicamente dalla seconda scheda "Locali"
  for (const key in REMOTE_VENUE_COORDINATES) {
    if (checkVenueMatch(venue, city, key)) {
      const jitterLat = (Math.random() - 0.5) * 0.0003;
      const jitterLng = (Math.random() - 0.5) * 0.0003;
      const coords = REMOTE_VENUE_COORDINATES[key];
      return [coords[0] + jitterLat, coords[1] + jitterLng];
    }
  }

  // 2. Cerca nel database statico cablato nel codice
  for (const key in VENUE_COORDINATES) {
    if (checkVenueMatch(venue, city, key)) {
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

// Genera un Marker Leaflet personalizzato contenente un omino singolo dal folder Omini_Singoli
function getOminiIcon(eventIndex, category) {
  let list = [];
  let part = 1;
  if (category === 'musica') {
    list = OMINI_LIST.part1;
    part = 1;
  } else if (category === 'spettacolo') {
    list = OMINI_LIST.part2;
    part = 2;
  } else {
    list = OMINI_LIST.part3;
    part = 3;
  }

  let iconUrl = '';
  if (list && list.length > 0) {
    const idx = eventIndex % list.length;
    iconUrl = `assets/Omini_Singoli/${list[idx]}`;
  } else {
    const charIdx = (eventIndex % 102) + 1;
    iconUrl = `assets/Omini_Singoli/Character_${charIdx}_${part}.png`;
  }

  // Dimensioni proporzionate (40px larghezza, 60px altezza)
  // Con ancora a [20, 60] affinché la base dell'icona (i piedi) poggi esattamente sulle coordinate
  return L.divIcon({
    className: 'custom-omino-marker',
    html: `<img src="${iconUrl}" class="omino-map-pin ${category}-accent" alt="Omino pin">`,
    iconSize: [40, 60],
    iconAnchor: [20, 60],
    popupAnchor: [0, -60]
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

async function fetchCSVWithFallback(sheetUrl, validationKeyword = 'checked,date') {
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
      
      const hasKeyword = cleanText.toLowerCase().includes(validationKeyword.toLowerCase());
      if (cleanText && !cleanText.startsWith('<') && hasKeyword) {
        return cleanText;
      }
    } catch (e) {
      console.warn(`Errore fetch proxy: ${proxyUrl}`, e.message);
    }
  }
  throw new Error("Proxy falliti per URL: " + sheetUrl);
}

/* ==========================================================================
   LOAD DATA
   ========================================================================== */
async function loadDynamicEvents() {
  const googleSheetCsvUrl = 'https://docs.google.com/spreadsheets/d/1jbfVbD7aE-KMvggHzAKLUE90oHCimOfAz4faFMhVAUU/export?format=csv&gid=0';
  let rawEventsData = null;

  try {
    const csvText = await fetchCSVWithFallback(googleSheetCsvUrl, 'checked,date');
    const csvRows = parseCSV(csvText);

    if (csvRows && csvRows.length > 3) {
      const eventsList = [];
      const monthNames = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

      // Map row 0 headers to their index dynamically
      const headers = csvRows[0].map(h => (h || '').trim().toLowerCase());
      const getColIdx = (name, fallback) => {
        const idx = headers.indexOf(name.toLowerCase());
        return idx !== -1 ? idx : fallback;
      };

      const idxChecked = getColIdx('checked', 0);
      const idxDate = getColIdx('date', 1);
      const idxTime = getColIdx('startTime', 2);
      const idxTitle = getColIdx('title', 4);
      const idxDesc = getColIdx('description', 5);
      const idxPrice = getColIdx('priceInfo', 6);
      const idxInfo = getColIdx('generalInfo', 7);
      const idxVenue = getColIdx('venue', 12);
      const idxLocation = getColIdx('location', 14);
      const idxMusic = getColIdx('typeMusic', 17);
      const idxCulture = getColIdx('typeCulture', 18);
      const idxShow = getColIdx('typeShow', 19);
      const idxArt = getColIdx('typeArt', 20);
      const idxWorkshop = getColIdx('typeWorkshop', 21);
      const idxLatitude = getColIdx('latitude', -1);
      const idxLongitude = getColIdx('longitude', -1);

      for (let i = 3; i < csvRows.length; i++) {
        const row = csvRows[i];
        if (row.length < 5) continue;
        
        const checked = (row[idxChecked] || '').trim();
        if (checked !== 'OK' && checked !== 'FQ') continue;

        const dateStr = (row[idxDate] || '').trim();
        const dateObj = parseDateStr(dateStr);
        if (!dateObj) continue;

        const title = (row[idxTitle] || '').trim();
        const descText = (row[idxDesc] || '').trim();
        const price = (row[idxPrice] || '').trim();
        const info = (row[idxInfo] || '').trim();
        const venue = (row[idxVenue] || '').trim();
        const location = (row[idxLocation] || '').trim();
        
        let category = 'altro';
        if (idxMusic !== -1 && (row[idxMusic] || '').trim().toUpperCase() === 'TRUE') category = 'musica';
        else if (idxShow !== -1 && (row[idxShow] || '').trim().toUpperCase() === 'TRUE') category = 'spettacolo';
        else if (idxCulture !== -1 && (row[idxCulture] || '').trim().toUpperCase() === 'TRUE') category = 'cultura';
        else if (idxArt !== -1 && (row[idxArt] || '').trim().toUpperCase() === 'TRUE') category = 'arte';
        else if (idxWorkshop !== -1 && (row[idxWorkshop] || '').trim().toUpperCase() === 'TRUE') category = 'lab';

        const day = dateObj.getDate();
        const month = monthNames[dateObj.getMonth()];

        let desc = descText;
        let infoParts = [];
        if (price) infoParts.push(`Prezzo: ${price}`);
        if (info) infoParts.push(`Info: ${info}`);
        if (infoParts.length > 0) desc += `\n\n${infoParts.join(' • ')}`;

        const eventObj = {
          id: `sheet-ev-${i}`,
          title: title || 'Senza Titolo',
          category: category,
          dateObj: dateObj,
          date: dateStr,
          day: day,
          month: month,
          time: (row[idxTime] || 'Ora da definire').trim(),
          location: venue || location || 'Reggio Emilia',
          address: `${venue}${venue && location ? ', ' : ''}${location}`,
          desc: desc,
          link: 'https://instagram.com/fommquell'
        };

        // Parse custom coordinates if present in Google Sheets
        if (idxLatitude !== -1 && idxLongitude !== -1) {
          const latVal = parseFloat((row[idxLatitude] || '').trim().replace(',', '.'));
          const lngVal = parseFloat((row[idxLongitude] || '').trim().replace(',', '.'));
          if (!isNaN(latVal) && !isNaN(lngVal)) {
            eventObj.lat = latVal;
            eventObj.lng = lngVal;
          }
        }

        eventsList.push(eventObj);
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

          const eventObj = {
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

          // Support coordinates in local fallback too
          const latVal = parseFloat((ev.Latitudine || ev.latitude || '').toString().trim().replace(',', '.'));
          const lngVal = parseFloat((ev.Longitudine || ev.longitude || '').toString().trim().replace(',', '.'));
          if (!isNaN(latVal) && !isNaN(lngVal)) {
            eventObj.lat = latVal;
            eventObj.lng = lngVal;
          }

          return eventObj;
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
    let coords = null;
    if (event.lat !== undefined && event.lng !== undefined) {
      coords = [event.lat, event.lng];
    } else {
      coords = getEventCoordinates(event.location, event.address);
    }
    
    // Icona personalizzata omino
    const icon = getOminiIcon(index, event.category);
    
    // URL per le indicazioni stradali su Google Maps
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${coords[0]},${coords[1]}`;
    
    // Popup brutalista con due pulsanti affiancati (con larghezza forzata a auto per evitare il width:100% del CSS)
    const popupHtml = `
      <div class="popup-title">${event.title}</div>
      <div class="popup-meta">📍 ${event.location} • ${event.time}</div>
      <div class="popup-desc">${event.desc.length > 90 ? event.desc.substring(0, 90) + '...' : event.desc}</div>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.8rem;">
        <a href="${event.link}" target="_blank" class="popup-btn" style="flex: 1; padding: 0.4rem 0.2rem; width: auto !important;">INFO</a>
        <a href="${directionsUrl}" target="_blank" class="popup-btn" style="flex: 1; padding: 0.4rem 0.2rem; background-color: var(--color-cream); color: var(--color-dark); box-shadow: 2px 2px 0px var(--color-pink); width: auto !important;">STRADA</a>
      </div>
    `;

    // Crea marker
    const marker = L.marker(coords, { icon: icon }).bindPopup(popupHtml);
    markersGroup.addLayer(marker);

    // Zoom massimo (livello 20) quando l'utente clicca direttamente sul marker dell'omino
    marker.on('click', () => {
      mapInstance.setView(coords, 20, { animate: true });
    });

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
        // Zoom e focus sul marker al click della sidebar (inquadramento ravvicinato massimo a livello 20)
        mapInstance.setView(coords, 20, { animate: true });
        marker.openPopup();
      });

      eventsContainer.appendChild(item);
    }
  });

  // Re-inizializza cursor hover states per gli elementi dinamici della sidebar
  initCustomCursorHoverStates();
}

/* ==========================================================================
   OMINI CATALOG & VENUES COORDINATES LOAD
   ========================================================================== */
async function loadOminiCatalog() {
  try {
    const res = await fetch('assets/omini_list.json');
    if (res.ok) {
      OMINI_LIST = await res.json();
    }
  } catch (e) {
    console.warn("Could not load assets/omini_list.json. Fallback to hardcoded sequence.", e);
  }
}

async function loadVenuesCoordinates() {
  const baseSheetUrl = 'https://docs.google.com/spreadsheets/d/1jbfVbD7aE-KMvggHzAKLUE90oHCimOfAz4faFMhVAUU/export?format=csv';
  const localesSheetUrl = `${baseSheetUrl}&gid=${GOOGLE_SHEET_LOCALI_GID}`;
  
  try {
    const csvText = await fetchCSVWithFallback(localesSheetUrl, 'coordinat');
    const csvRows = parseCSV(csvText);
    
    if (csvRows && csvRows.length > 1) {
      const headers = csvRows[0].map(h => (h || '').trim().toLowerCase());
      
      // Supporta sia "locale" sia "locale/realtà" o simili
      let idxLocale = headers.findIndex(h => h.includes('locale') || h.includes('realt'));
      if (idxLocale === -1) idxLocale = 0;
      
      // Supporta una colonna unica "coordinate" o due colonne separate
      const idxCoords = headers.findIndex(h => h.includes('coordinat'));
      const idxLat = headers.indexOf('latitude');
      const idxLng = headers.indexOf('longitude');
      
      for (let i = 1; i < csvRows.length; i++) {
        const row = csvRows[i];
        if (row.length <= idxLocale) continue;
        
        // Rimuove eventuali spazi bianchi e converte in minuscolo per confronto sicuro
        const localeName = (row[idxLocale] || '').trim().toLowerCase();
        if (!localeName) continue;
        
        let latVal = NaN;
        let lngVal = NaN;
        
        if (idxCoords !== -1 && row[idxCoords]) {
          const coordText = row[idxCoords].trim();
          if (coordText.includes(',')) {
            const parts = coordText.split(',');
            latVal = parseFloat(parts[0].trim());
            lngVal = parseFloat(parts[1].trim());
          }
        } else if (idxLat !== -1 && idxLng !== -1 && row[idxLat] && row[idxLng]) {
          latVal = parseFloat(row[idxLat].trim().replace(',', '.'));
          lngVal = parseFloat(row[idxLng].trim().replace(',', '.'));
        }
        
        if (!isNaN(latVal) && !isNaN(lngVal)) {
          REMOTE_VENUE_COORDINATES[localeName] = [latVal, lngVal];
        }
      }
    }
    console.log("Coordinate locali remote caricate:", Object.keys(REMOTE_VENUE_COORDINATES).length);
  } catch (e) {
    console.warn("Impossibile caricare coordinate remote dei locali. Uso fallback locali statici:", e.message);
  }
}

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
async function initMapPage() {
  // Carica il catalogo omini all'avvio
  await loadOminiCatalog();
  // Carica le coordinate della rubrica locali
  await loadVenuesCoordinates();

  // 1. Inizializzazione Mappa centrata su Reggio Emilia
  mapInstance = L.map('leaflet-map', {
    scrollWheelZoom: true,  // consente zoom con rotella
    dragging: true,         // consente trascinamento con un dito su mobile
    touchZoom: true,        // consente pinch-to-zoom
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
