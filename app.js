/* ==========================================================================
   EVENTS DATABASE
   ========================================================================== */
let ALL_EVENTS_DATA = [];  // Memorizza tutti gli eventi totali scaricati
let EVENTS_DATA = [];      // Memorizza solo gli eventi della settimana corrente visualizzata
let currentWeekOffset = 0; // Settimana visualizzata rispetto ad oggi (0 = corrente, 1 = prossima, ecc.)
let currentCategory = 'all'; // Categoria di filtro attiva
let currentPage = 0;       // Pagina corrente dell'agenda
const EVENTS_PER_PAGE = 6; // Numero di eventi visualizzati per pagina

// Helper per ottenere le date di una determinata settimana rispetto a quella corrente (offset in settimane)
function getWeekDates(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay();
  // Calcola la differenza per ottenere il Lunedì di questa settimana
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  
  const monday = new Date(now);
  monday.setDate(diff + (offsetWeeks * 7));
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { monday, sunday };
}

// Helper per parsare la data in formato "DD/MM/YYYY" o ISO "YYYY-MM-DD"
function parseDateStr(str) {
  if (!str) return null;
  str = str.trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
  } else if (str.includes('-')) {
    const dObj = new Date(str);
    if (!isNaN(dObj.getTime())) return dObj;
  }
  return null;
}

// Parser CSV robusto scritto in Vanilla JS (gestisce virgole, apici e ritorni a capo nei campi)
function parseCSV(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push("");
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') {
        i++;
      }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  return lines;
}
// Helper per eseguire fetch con un timeout personalizzato (in millisecondi) per evitare blocchi infiniti
async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 5000 } = options; // Default 5 secondi
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Helper per scaricare il CSV del Google Sheet provando diversi proxy CORS in sequenza
async function fetchCSVWithFallback(sheetUrl) {
  const proxies = [
    // 1. Direct fetch (standard)
    sheetUrl,
    // 2. corsproxy.io (consigliato con query parameter)
    `https://corsproxy.io/?url=${encodeURIComponent(sheetUrl)}`,
    // 3. corsproxy.io (url diretto come path)
    `https://corsproxy.io/${sheetUrl}`,
    // 4. allorigins.win (proxy CORS standard, restituisce dati grezzi)
    `https://api.allorigins.win/raw?url=${encodeURIComponent(sheetUrl)}`
  ];

  for (const proxyUrl of proxies) {
    try {
      console.log(`Tentativo di download eventi da: ${proxyUrl}`);
      // Timeout di 4 secondi per ciascun proxy per passare rapidamente al successivo in caso di blocco/lentezza
      const response = await fetchWithTimeout(proxyUrl, { timeout: 4000 });
      if (!response.ok) {
        console.warn(`Risposta non OK da ${proxyUrl}: status ${response.status}`);
        continue;
      }
      const text = await response.text();
      const cleanText = text.trim();
      
      // Verifica se la risposta è un CSV valido e non codice HTML (es. pagine di errore o landing page)
      if (cleanText && !cleanText.startsWith('<') && (cleanText.includes('startTime') || cleanText.includes('typeMusic') || cleanText.includes('checked,date'))) {
        console.log(`Download completato con successo da: ${proxyUrl}`);
        return cleanText;
      } else {
        console.warn(`Risposta da ${proxyUrl} ignorata: non sembra un CSV valido (lunghezza: ${cleanText.length})`);
      }
    } catch (e) {
      console.warn(`Errore durante il fetch da ${proxyUrl}:`, e.message);
    }
  }
  throw new Error("Tutti i tentativi di caricamento tramite proxy CORS sono falliti.");
}

// Funzione principale per caricare gli eventi in modo dinamico dal Google Sheet o dati_eventi.json
async function loadDynamicEvents() {
  const googleSheetCsvUrl = 'https://docs.google.com/spreadsheets/d/1jbfVbD7aE-KMvggHzAKLUE90oHCimOfAz4faFMhVAUU/export?format=csv&gid=0';
  let rawEventsData = null;
  let isFromGoogleSheet = false;

  // 1. Prova a scaricare dal Google Sheet con gestione automatica del CORS tramite proxy fallbacks
  try {
    console.log("Tentativo di download eventi in tempo reale da Google Sheet...");
    const csvText = await fetchCSVWithFallback(googleSheetCsvUrl);
    const csvRows = parseCSV(csvText);

    if (csvRows && csvRows.length > 3) {
      // Le righe 0, 1, 2 sono intestazioni o righe di configurazione nel foglio originale
      const eventsList = [];
      const monthNames = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

      for (let i = 3; i < csvRows.length; i++) {
        const row = csvRows[i];
        if (row.length < 5) continue;

        const checked = (row[0] || '').trim();
        // Carica solo eventi validati ("OK" o "FQ")
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
        // Mappatura tipologia booleana dal Google Sheet (colonne 17-22)
        let category = 'altro';
        if ((row[17] || '').trim().toUpperCase() === 'TRUE') {
          category = 'musica';
        } else if ((row[19] || '').trim().toUpperCase() === 'TRUE') {
          category = 'spettacolo';
        } else if ((row[18] || '').trim().toUpperCase() === 'TRUE') {
          category = 'cultura';
        } else if ((row[20] || '').trim().toUpperCase() === 'TRUE') {
          category = 'arte';
        } else if ((row[21] || '').trim().toUpperCase() === 'TRUE') {
          category = 'lab';
        } else if ((row[22] || '').trim().toUpperCase() === 'TRUE') {
          category = 'altro';
        }

        // Estrazione giorno e mese
        const day = dateObj.getDate();
        const month = monthNames[dateObj.getMonth()];

        // Mappa pin (coordsId) sulla mappa del centro storico di Reggio Emilia
        let coordsId = '';
        const fullLocationText = `${venue} ${location}`.toLowerCase();
        if (fullLocationText.includes('prampolini') || fullLocationText.includes('grande')) {
          coordsId = 'pin-prampolini';
        } else if (fullLocationText.includes('fontanesi')) {
          coordsId = 'pin-fontanesi';
        } else if (fullLocationText.includes('valli') || fullLocationText.includes('vittoria')) {
          coordsId = 'pin-valli';
        } else if (fullLocationText.includes('pietro')) {
          coordsId = 'pin-san-pietro';
        } else if (fullLocationText.includes('prospero')) {
          coordsId = 'pin-san-prospero';
        }

        // Descrizione formattata con Info e prezzi
        let desc = descText;
        let infoParts = [];
        if (price) infoParts.push(`Prezzo: ${price}`);
        if (info) infoParts.push(`Info: ${info}`);
        if (infoParts.length > 0) {
          desc += `\n\n${infoParts.join(' • ')}`;
        }

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
          link: 'https://instagram.com/fommquell',
          coordsId: coordsId
        });
      }

      rawEventsData = eventsList;
      isFromGoogleSheet = true;
      console.log(`Caricati con successo ${rawEventsData.length} eventi dal Google Sheet.`);
    }
  } catch (error) {
    console.warn("Caricamento diretto da Google Sheet fallito (CORS o rete):", error.message);
  }

  // 2. Se fallisce il Google Sheet, prova a caricare dati_eventi.json (generato da Python)
  if (!rawEventsData) {
    try {
      console.log("Tentativo di caricamento da file locale dati_eventi.json...");
      const response = await fetchWithTimeout('dati_eventi.json', { timeout: 3000 });
      if (response.ok) {
        const localData = await response.json();
        if (localData && localData.length > 0) {
          const monthNames = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
          
          rawEventsData = localData.map((ev, index) => {
            const dateObj = parseDateStr(ev.Data);
            const tipologia = (ev.Tipologia || '').toLowerCase();
            let category = 'altro';
            if (tipologia.includes('musica') || tipologia.includes('concert') || tipologia.includes('live')) {
              category = 'musica';
            } else if (tipologia.includes('spettacolo')) {
              category = 'spettacolo';
            } else if (tipologia.includes('cultura')) {
              category = 'cultura';
            } else if (tipologia.includes('arte')) {
              category = 'arte';
            } else if (tipologia.includes('lab')) {
              category = 'lab';
            } else if (tipologia.includes('altro')) {
              category = 'altro';
            }

            const day = dateObj ? dateObj.getDate() : 15;
            const month = dateObj ? monthNames[dateObj.getMonth()] : 'GIU';

            let coordsId = '';
            const luogoLower = (ev.Luogo || '').toLowerCase();
            if (luogoLower.includes('prampolini') || luogoLower.includes('grande')) {
              coordsId = 'pin-prampolini';
            } else if (luogoLower.includes('fontanesi')) {
              coordsId = 'pin-fontanesi';
            } else if (luogoLower.includes('valli') || luogoLower.includes('vittoria')) {
              coordsId = 'pin-valli';
            } else if (luogoLower.includes('pietro')) {
              coordsId = 'pin-san-pietro';
            } else if (luogoLower.includes('prospero')) {
              coordsId = 'pin-san-prospero';
            }

            let desc = ev.Descrizione || '';
            if (ev.Info) {
              desc += `\n\nInfo utili: ${ev.Info}`;
            }

            return {
              id: ev.id || `local-ev-${index}`,
              title: ev.Titolo || 'Senza Titolo',
              category: category,
              dateObj: dateObj,
              date: ev.Data || 'Data da definire',
              day: day,
              month: month,
              time: ev.Ora || 'Ora da definire',
              location: (ev.Luogo || '').split(',')[0].trim() || 'Reggio Emilia',
              address: ev.Luogo || 'Reggio Emilia',
              desc: desc,
              link: ev.Link || 'https://instagram.com/fommquell',
              coordsId: coordsId
            };
          });
          console.log(`Caricati ${rawEventsData.length} eventi dal file dati_eventi.json.`);
        }
      }
    } catch (e) {
      console.warn("Caricamento da dati_eventi.json fallito:", e.message);
    }
  }

  // 3. Se abbiamo dati validi (da Google Sheet o JSON), applichiamo il filtro temporale intelligente
  if (rawEventsData && rawEventsData.length > 0) {
    ALL_EVENTS_DATA = rawEventsData;
    isFromGoogleSheet = true;
  } else {
    console.log("Nessun dato dinamico disponibile. Uso del fallback statico di base.");
    // Inseriamo alcuni eventi dimostrativi nel caso in cui sia la chiamata API che il file JSON falliscano (es. apertura locale file://)
    ALL_EVENTS_DATA = [
      {
        id: "sheet-ev-mock1",
        title: "THE CLADDAGH IN CONCERTO",
        category: "musica",
        dateObj: new Date(2026, 5, 20),
        date: "20/06/2026",
        day: 20,
        month: "GIU",
        time: "21:00",
        location: "Yggdrasill Viking Pub",
        address: "Rossena di Canossa (RE)",
        desc: "Serata all'insegna della tradizione irlandese nel pub vichingo più famoso di Reggio Emilia.",
        link: "https://instagram.com/fommquell",
        coordsId: "pin-prampolini"
      },
      {
        id: "sheet-ev-mock2",
        title: "READING PARTY",
        category: "cultura",
        dateObj: new Date(2026, 5, 17),
        date: "17/06/2026",
        day: 17,
        month: "GIU",
        time: "10:00",
        location: "Reggia di Rivalta",
        address: "Reggia di Rivalta, Reggio Emilia",
        desc: "Una mattinata di lettura all'aperto all'interno del festival di @hbt_re.",
        link: "https://instagram.com/fommquell",
        coordsId: "pin-san-pietro"
      },
      {
        id: "sheet-ev-mock3",
        title: "HABITAT GARDEN",
        category: "spettacolo",
        dateObj: new Date(2026, 5, 19),
        date: "19/06/2026",
        day: 19,
        month: "GIU",
        time: "18:00",
        location: "Parco Secchia",
        address: "Casalgrande (RE)",
        desc: "Lives set e djset all'aperto nel verde.",
        link: "https://instagram.com/fommquell",
        coordsId: "pin-fontanesi"
      }
    ];
  }

  // Ordina per data tutti gli eventi caricati
  ALL_EVENTS_DATA.sort((a, b) => (a.dateObj || 0) - (b.dateObj || 0));

  // UX Intelligente: se la settimana corrente (offset 0) non ha eventi,
  // scopriamo automaticamente la prima settimana futura con eventi per non mostrare il sito vuoto.
  currentWeekOffset = findFirstWeekWithEvents();
}

// Trova l'offset in settimane della prima settimana che contiene eventi a partire da quella corrente
function findFirstWeekWithEvents() {
  const { monday: curMonday } = getWeekDates(0);
  
  // Filtra eventi futuri o della settimana corrente
  const upcomingEvents = ALL_EVENTS_DATA.filter(ev => ev.dateObj && ev.dateObj >= curMonday);
  if (upcomingEvents.length === 0) {
    return 0; // Resta alla settimana corrente
  }
  
  // Calcola quante settimane dista il primo evento futuro rispetto al lunedì di questa settimana
  const firstEvent = upcomingEvents[0];
  const diffTime = firstEvent.dateObj - curMonday;
  const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
  return Math.max(0, diffWeeks);
}

// Filtra gli eventi per la settimana specificata da currentWeekOffset ed aggiorna la barra delle date
function updateWeekEvents() {
  const { monday, sunday } = getWeekDates(currentWeekOffset);
  
  // Filtra gli eventi totali per la settimana corrente
  EVENTS_DATA = ALL_EVENTS_DATA.filter(ev => {
    if (!ev.dateObj) return false;
    return ev.dateObj >= monday && ev.dateObj <= sunday;
  });

  // Aggiorna il testo visualizzato dell'agenda
  const weekDisplay = document.getElementById("week-display-range");
  if (weekDisplay) {
    const options = { day: 'numeric', month: 'long' };
    const monStr = monday.toLocaleDateString('it-IT', options);
    const sunStr = sunday.toLocaleDateString('it-IT', options);
    
    // Mostriamo anche l'anno se differisce dall'anno corrente
    weekDisplay.textContent = `DAL ${monStr.toUpperCase()} AL ${sunStr.toUpperCase()}`;
  }
}
/* ==========================================================================
   INITIALIZATION & SELECTORS
   ========================================================================== */
function initApp() {
  // Se il file viene aperto direttamente dal filesystem (protocollo file://), mostra un banner di avviso
  if (window.location.protocol === 'file:') {
    const banner = document.createElement('div');
    banner.style.cssText = 'background: var(--color-pink); color: var(--color-dark); text-align: center; padding: 12px 20px; font-weight: 700; font-size: 0.95rem; border-bottom: 3px solid var(--color-dark); position: relative; z-index: 10000; font-family: var(--font-body); display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;';
    banner.innerHTML = '<span>⚠️ Modalità Locale (file://) - I dati in tempo reale da Google Sheets sono bloccati dal browser.</span> <a href="#" style="text-decoration: underline; color: inherit; border: 2px solid var(--color-dark); padding: 2px 8px; border-radius: 4px; background: var(--color-cream); font-size: 0.85rem;" id="file-warning-link">Scopri come risolvere</a>';
    document.body.insertBefore(banner, document.body.firstChild);
    
    banner.querySelector('#file-warning-link').addEventListener('click', (e) => {
      e.preventDefault();
      alert("I browser moderni bloccano il caricamento di file esterni (CORS) quando i siti vengono aperti facendo doppio clic sul file (indirizzo file://).\n\nPer attivare il sincronismo in tempo reale con il tuo Excel:\n\n1. Carica la cartella gratuitamente su Netlify Drop (app.netlify.com/drop) trascinandola col mouse: il sito sarà online e funzionante in 10 secondi!\n\n2. Oppure avvia un server web locale (es. installando l'estensione 'Live Server' su VS Code e cliccando su 'Go Live').");
    });
  }

  const eventsContainer = document.getElementById("events-container");
  const filterBtns = document.querySelectorAll(".filter-wrapper .filter-btn");
  const modal = document.getElementById("event-modal");
  const modalClose = document.getElementById("modal-close-btn");
  const eventForm = document.getElementById("event-form");
  const formSuccess = document.getElementById("form-success");
  const resetFormBtn = document.getElementById("reset-form-btn");
  const menuToggle = document.querySelector(".menu-toggle");
  const mainNav = document.querySelector(".main-nav");
  const mapHotspots = document.querySelectorAll(".map-hotspot");
  const mapInfoTitle = document.getElementById("infobox-title");
  const mapInfoContent = document.getElementById("infobox-content");
  const mapInfoFooter = document.getElementById("infobox-footer");
  const mapInfoAction = document.getElementById("infobox-action");

  // Prova a caricare gli eventi dinamici ed effettua il render iniziale
  loadDynamicEvents().then(() => {
    updateWeekEvents();
    renderEvents("all");
  });

  // Set up week switcher and page controls
  const prevWeekBtn = document.getElementById("prev-week-btn");
  const nextWeekBtn = document.getElementById("next-week-btn");
  const prevPageBtn = document.getElementById("prev-page-btn");
  const nextPageBtn = document.getElementById("next-page-btn");

  if (prevWeekBtn) {
    prevWeekBtn.addEventListener("click", () => {
      currentWeekOffset--;
      currentPage = 0;
      updateWeekEvents();
      renderEvents(currentCategory);
    });
  }

  if (nextWeekBtn) {
    nextWeekBtn.addEventListener("click", () => {
      currentWeekOffset++;
      currentPage = 0;
      updateWeekEvents();
      renderEvents(currentCategory);
    });
  }

  if (prevPageBtn) {
    prevPageBtn.addEventListener("click", () => {
      if (currentPage > 0) {
        currentPage--;
        renderEvents(currentCategory);
        document.getElementById("agenda").scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener("click", () => {
      currentPage++;
      renderEvents(currentCategory);
      document.getElementById("agenda").scrollIntoView({ behavior: "smooth" });
    });
  }

  // Set up mobile nav toggle
  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
      mainNav.classList.toggle("active");
      menuToggle.classList.toggle("open");
      // Animate hamburger lines
      const bars = menuToggle.querySelectorAll(".bar");
      if (mainNav.classList.contains("active")) {
        bars[0].style.transform = "rotate(45deg) translate(6px, 6px)";
        bars[1].style.opacity = "0";
        bars[2].style.transform = "rotate(-45deg) translate(6px, -6px)";
      } else {
        bars[0].style.transform = "none";
        bars[1].style.opacity = "1";
        bars[2].style.transform = "none";
      }
    });

    // Close menu when clicking nav links
    const navLinks = document.querySelectorAll(".nav-link");
    navLinks.forEach(link => {
      link.addEventListener("click", () => {
        mainNav.classList.remove("active");
        const bars = menuToggle.querySelectorAll(".bar");
        bars[0].style.transform = "none";
        bars[1].style.opacity = "1";
        bars[2].style.transform = "none";
      });
    });
  }

  // Set up event filters
  filterBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      // Remove active from other buttons
      filterBtns.forEach(b => b.classList.remove("active"));
      // Add active to current
      e.target.classList.add("active");
      // Filter category
      const filterValue = e.target.getAttribute("data-filter");
      currentCategory = filterValue;
      currentPage = 0;
      renderEvents(filterValue);
    });
  });

  // Set up Modal closing events
  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }
  
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("active")) {
      closeModal();
    }
  });

  // Set up Form submission
  if (eventForm) {
    eventForm.addEventListener("submit", (e) => {
      e.preventDefault();
      
      // Basic submit animation
      const submitBtn = eventForm.querySelector(".btn-submit");
      const originalText = submitBtn.textContent;
      submitBtn.textContent = "INVIANDO...";
      submitBtn.disabled = true;

      setTimeout(() => {
        // Hide form and show success card
        eventForm.style.display = "none";
        formSuccess.classList.add("active");
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }, 1200);
    });
  }

  if (resetFormBtn && eventForm && formSuccess) {
    resetFormBtn.addEventListener("click", () => {
      eventForm.reset();
      eventForm.style.display = "flex";
      formSuccess.classList.remove("active");
    });
  }

  // Set up Interactive Map
  mapHotspots.forEach(hotspot => {
    hotspot.addEventListener("click", () => {
      // Remove active class from all hotspots
      mapHotspots.forEach(h => h.classList.remove("active"));
      
      // Add active class to clicked
      hotspot.classList.add("active");
      
      // Find event for this location
      const locationName = hotspot.getAttribute("data-location");
      const matchedEvents = EVENTS_DATA.filter(ev => ev.location.includes(locationName) || ev.coordsId === hotspot.id);
      
      // Update infobox
      mapInfoTitle.textContent = locationName;
      
      if (matchedEvents.length > 0) {
        let bodyHtml = `<p>Ci sono <strong>${matchedEvents.length} eventi</strong> programmati in questa zona:</p><ul style="margin-top: 10px; padding-left: 20px;">`;
        matchedEvents.forEach(ev => {
          bodyHtml += `<li style="margin-bottom: 5px;"><strong>${ev.date}:</strong> ${ev.title}</li>`;
        });
        bodyHtml += `</ul><p class="event-address">📍 ${matchedEvents[0].address}</p>`;
        
        mapInfoContent.innerHTML = bodyHtml;
        
        // Show footer button and set target
        mapInfoFooter.style.display = "block";
        mapInfoAction.onclick = () => {
          // Scroll to agenda
          document.getElementById("agenda").scrollIntoView({ behavior: "smooth" });
          // Highlight category or select the first matching event card
          const firstEv = matchedEvents[0];
          setTimeout(() => {
            const cardEl = document.getElementById(`card-${firstEv.id}`);
            if (cardEl) {
              cardEl.style.transform = "scale(1.05) translateY(-10px)";
              cardEl.querySelector(".event-card-inner").style.borderColor = "var(--color-pink)";
              cardEl.querySelector(".event-card-inner").style.boxShadow = "var(--shadow-brutal-pink)";
              setTimeout(() => {
                cardEl.style.transform = "none";
              }, 2000);
            }
          }, 800);
        };
      } else {
        mapInfoContent.innerHTML = `<p>Nessun evento programmato in questa zona per questa settimana.</p><p>Hai qualcosa da proporre? <a href="#segnala" style="color: var(--color-pink); font-weight: 700;">Segnala la tua data</a>!</p>`;
        mapInfoFooter.style.display = "none";
      }
    });
  });

  // Set up custom cursor events
  initCustomCursor();
}

// Avvio dell'app sicuro (garantisce l'esecuzione anche se DOMContentLoaded è già scattato)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

/* ==========================================================================
   RENDER EVENTS FUNCTIONS
   ========================================================================== */
function renderEvents(filter = "all") {
  const eventsContainer = document.getElementById("events-container");
  if (!eventsContainer) return;

  eventsContainer.innerHTML = "";
  currentCategory = filter;

  const filteredEvents = filter === "all" 
    ? EVENTS_DATA 
    : EVENTS_DATA.filter(ev => ev.category === filter);

  const totalEvents = filteredEvents.length;
  const totalPages = Math.ceil(totalEvents / EVENTS_PER_PAGE);

  // Bounds check currentPage
  if (currentPage >= totalPages) {
    currentPage = Math.max(0, totalPages - 1);
  }
  if (currentPage < 0) {
    currentPage = 0;
  }

  if (totalEvents === 0) {
    eventsContainer.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; border: var(--border-width) solid var(--color-cream); border-radius: var(--border-radius); background: var(--color-card-bg);">
        <p style="font-size: 1.2rem; margin-bottom: 1rem;">Nessun evento in programma in questa categoria per questa settimana.</p>
        <a href="#segnala" class="btn btn-primary btn-sm">SEGNALA TU UN EVENTO</a>
      </div>
    `;
    updatePaginationControls(0, 0);
    return;
  }

  // Get current page events slice
  const startIndex = currentPage * EVENTS_PER_PAGE;
  const pageEvents = filteredEvents.slice(startIndex, startIndex + EVENTS_PER_PAGE);

  pageEvents.forEach(event => {
    const card = document.createElement("article");
    card.className = "event-card";
    card.id = `card-${event.id}`;
    card.setAttribute("data-category", event.category);

    const categoryText = event.category.toUpperCase();
    const bgClass = `${event.category}-bg`;

    card.innerHTML = `
      <div class="event-card-inner">
        <div class="event-date-badge">
          <span class="day">${event.day}</span>
          <span class="month">${event.month}</span>
        </div>
        <div class="event-image-placeholder ${bgClass}">
          <span class="category-tag">${categoryText}</span>
        </div>
        <div class="event-info">
          <h3 class="event-title">${event.title}</h3>
          <p class="event-location">📍 ${event.location}</p>
          <p class="event-desc">${event.desc}</p>
          <button class="btn-detail" data-id="${event.id}">VEDI DETTAGLI</button>
        </div>
      </div>
    `;

    eventsContainer.appendChild(card);
    
    // Add hover sound/cursor effects locally
    const btnDetail = card.querySelector(".btn-detail");
    btnDetail.addEventListener("click", () => openEventDetail(event.id));
  });

  // Render pagination controls
  updatePaginationControls(totalEvents, totalPages);

  // Re-attach listeners for custom cursor on new dynamic elements
  initCustomCursorHoverStates();
}

// Helper per aggiornare e disegnare i controlli di paginazione brutalisti
function updatePaginationControls(totalEvents, totalPages) {
  const controls = document.getElementById("carousel-controls");
  const dotsContainer = document.getElementById("carousel-dots");
  const prevBtn = document.getElementById("prev-page-btn");
  const nextBtn = document.getElementById("next-page-btn");

  if (!controls || !dotsContainer || !prevBtn || !nextBtn) return;

  if (totalPages <= 1) {
    controls.style.display = "none";
    return;
  }

  controls.style.display = "flex";

  // Abilita/Disabilita pulsanti di navigazione pagine
  prevBtn.disabled = (currentPage === 0);
  nextBtn.disabled = (currentPage === totalPages - 1);

  // Genera pallini indicatori (dots)
  dotsContainer.innerHTML = "";
  for (let i = 0; i < totalPages; i++) {
    const dot = document.createElement("button");
    dot.className = `carousel-dot${i === currentPage ? " active" : ""}`;
    dot.setAttribute("aria-label", `Vai alla pagina ${i + 1}`);
    dot.addEventListener("click", () => {
      currentPage = i;
      renderEvents(currentCategory);
      document.getElementById("agenda").scrollIntoView({ behavior: "smooth" });
    });
    dotsContainer.appendChild(dot);
  }
}

/* ==========================================================================
   MODAL CONTROLS
   ========================================================================== */
function openEventDetail(id) {
  const event = ALL_EVENTS_DATA.find(ev => ev.id === id);
  if (!event) return;

  const modal = document.getElementById("event-modal");
  const mCategory = document.getElementById("modal-category");
  const mTitle = document.getElementById("modal-title");
  const mDate = document.getElementById("modal-date");
  const mLoc = document.getElementById("modal-location");
  const mDesc = document.getElementById("modal-desc");
  const mLink = document.getElementById("modal-link");

  mCategory.textContent = event.category.toUpperCase();
  mCategory.className = `modal-category ${event.category}-category`;
  mTitle.textContent = event.title;
  mDate.textContent = `${event.date} - Ore ${event.time}`;
  mLoc.textContent = event.address;
  mDesc.textContent = event.desc;
  mLink.href = event.link;

  // Set colors based on category dynamically
  let accentColor = "#EF48A0"; // default musica
  if (event.category === "spettacolo") accentColor = "#9CF726";
  if (event.category === "cultura") accentColor = "#20C6C1";
  if (event.category === "arte") accentColor = "#9260F4";
  if (event.category === "lab") accentColor = "#EFD933";
  if (event.category === "altro") accentColor = "#F47621";
  
  modal.style.setProperty("--color-modal-accent", accentColor);

  modal.classList.add("active");
  document.body.style.overflow = "hidden"; // Prevent background scroll
}

function closeModal() {
  const modal = document.getElementById("event-modal");
  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = ""; // Enable scroll
  }
}

/* ==========================================================================
   CUSTOM CURSOR
   ========================================================================== */
function initCustomCursor() {
  const cursor = document.querySelector(".custom-cursor");
  if (!cursor) return;

  // Aggiungi la classe al body per nascondere il cursore nativo su desktop
  document.body.classList.add("has-custom-cursor");

  document.addEventListener("mousemove", (e) => {
    // Keep cursor positioned centered
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
    "a, button, select, input, textarea, .map-hotspot, .btn-detail, .filter-btn"
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


