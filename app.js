/* ==========================================================================
   EVENTS DATABASE
   ========================================================================== */
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed
let currentMode = 'evento'; // 'evento', 'cinema', 'teatro'
let currentCategory = 'all'; // Categoria ID ('1', '2', etc.) o 'all'
let ALL_EVENTS_DATA = []; // Memorizza la lista piatta degli eventi del mese corrente

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

// Genera il link Instagram
function getInstagramLink(venueTag, tags) {
  let tag = (venueTag || '').trim();
  if (!tag && tags) {
    const match = tags.match(/@[a-zA-Z0-9_.]+/);
    if (match) tag = match[0];
  }
  if (tag) {
    if (tag.startsWith('http://') || tag.startsWith('https://')) return tag;
    if (tag.startsWith('@')) tag = tag.substring(1).trim();
    if (tag && !tag.includes(' ') && !tag.includes('/')) {
      return `https://instagram.com/${tag}`;
    }
  }
  return 'https://instagram.com/fommquell';
}

// Funzione AJAX per caricare gli eventi del mese dal database MySQL
async function loadMonthEvents(year, month) {
  let url = `backend/api/get_events.php?year=${year}&month=${month + 1}&mode=${currentMode}`;
  if (currentCategory !== 'all') {
    url += `&category_id=${currentCategory}`;
  }
  try {
    const response = await fetch(url);
    const json = await response.json();
    return json.success ? json.data : [];
  } catch (err) {
    console.error("Errore fetch eventi mensili:", err);
    return [];
  }
}

// Renderizza il calendario mensile a griglia brutalista
async function renderMonthlyCalendar() {
  const daysGrid = document.getElementById("calendar-days-grid");
  const monthDisplay = document.getElementById("month-display-range");
  if (!daysGrid) return;

  daysGrid.innerHTML = `
    <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: var(--color-card-bg); color: var(--color-cream); font-family: var(--font-body); font-weight: 700;">
      [ CARICAMENTO CALENDARIO... ]
    </div>
  `;

  // Aggiorna l'intestazione con il nome del mese
  const monthNames = [
    "GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", 
    "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"
  ];
  if (monthDisplay) {
    monthDisplay.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  }

  // Recupera gli eventi dal database
  let events = await loadMonthEvents(currentYear, currentMonth);

  // Applica filtro client-side per cinema specifico se presente nel dropdown
  if (currentMode === 'cinema') {
    const cinemaSelect = document.getElementById("cinema-select");
    if (cinemaSelect && cinemaSelect.value !== 'all') {
      events = events.filter(ev => ev.realta_nome === cinemaSelect.value);
    }
  }

  ALL_EVENTS_DATA = events;

  // Raggruppa eventi per giorno
  const eventsByDay = {};
  events.forEach(ev => {
    const dayNum = parseInt(ev.data.split('-')[2], 10);
    if (!eventsByDay[dayNum]) {
      eventsByDay[dayNum] = [];
    }
    eventsByDay[dayNum].push(ev);
  });

  daysGrid.innerHTML = "";

  // Calcola parametri della griglia del mese
  const firstDay = new Date(currentYear, currentMonth, 1);
  const firstDayIndex = firstDay.getDay(); // 0 = Domenica, 1 = Lunedì...
  const startPadding = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();

  const totalCells = 42; // Griglia 6 righe x 7 giorni

  for (let i = 1; i <= totalCells; i++) {
    const cellIdx = i - startPadding;
    let cellDay, cellMonth, cellYear, isCurrentMonth = false;

    if (cellIdx <= 0) {
      // Giorno del mese precedente
      cellDay = prevMonthDays + cellIdx;
      cellMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      cellYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    } else if (cellIdx > daysInMonth) {
      // Giorno del mese successivo
      cellDay = cellIdx - daysInMonth;
      cellMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      cellYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    } else {
      // Giorno del mese corrente
      cellDay = cellIdx;
      cellMonth = currentMonth;
      cellYear = currentYear;
      isCurrentMonth = true;
    }

    const card = document.createElement("div");
    card.className = "calendar-day-card";
    if (!isCurrentMonth) {
      card.className += " other-month";
    }

    const isToday = isCurrentMonth && 
                    cellDay === todayDay && 
                    cellMonth === todayMonth && 
                    cellYear === todayYear;
    if (isToday) {
      card.className += " today";
    }

    // Numero del giorno
    card.innerHTML = `<div class="calendar-day-number">${cellDay}</div>`;

    // Aggiungi pallini colorati per le categorie degli eventi del giorno
    if (isCurrentMonth && eventsByDay[cellDay]) {
      const addedCats = {};
      const dotsContainer = document.createElement("div");
      dotsContainer.className = "calendar-day-dots";

      eventsByDay[cellDay].forEach(ev => {
        (ev.categorie || []).forEach(cat => {
          if (!addedCats[cat.id]) {
            addedCats[cat.id] = true;
            const dot = document.createElement("span");
            dot.className = "category-dot";
            dot.style.backgroundColor = cat.colore;
            dot.title = cat.nome;
            dotsContainer.appendChild(dot);
          }
        });
      });

      if (dotsContainer.children.length > 0) {
        card.appendChild(dotsContainer);
      }
    }

    // Click: Naviga alla pagina del giorno mantenendo la modalità attiva
    card.addEventListener("click", () => {
      const padDay = String(cellDay).padStart(2, '0');
      const padMonth = String(cellMonth + 1).padStart(2, '0');
      const dateStr = `${cellYear}-${padMonth}-${padDay}`;
      window.location.href = `giorno.html?date=${dateStr}&mode=${currentMode}`;
    });

    daysGrid.appendChild(card);
  }
};
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

  const filterBtns = document.querySelectorAll(".filter-wrapper .filter-btn");
  const cinemaSelect = document.getElementById("cinema-select");
  if (cinemaSelect) {
    cinemaSelect.addEventListener("change", () => {
      renderMonthlyCalendar();
    });
  }

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

  // Esegue il caricamento iniziale del calendario mensile
  renderMonthlyCalendar();

  // Configura i pulsanti per lo switch del mese
  const prevMonthBtn = document.getElementById("prev-month-btn");
  const nextMonthBtn = document.getElementById("next-month-btn");

  if (prevMonthBtn) {
    prevMonthBtn.addEventListener("click", () => {
      if (currentMonth === 0) {
        currentMonth = 11;
        currentYear--;
      } else {
        currentMonth--;
      }
      renderMonthlyCalendar();
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener("click", () => {
      if (currentMonth === 11) {
        currentMonth = 0;
        currentYear++;
      } else {
        currentMonth++;
      }
      renderMonthlyCalendar();
    });
  }

  // Configura i pulsanti delle 3 modalità (EVENTI / CINEMA / TEATRO)
  const modeEventsBtn = document.getElementById("mode-events-btn");
  const modeCinemaBtn = document.getElementById("mode-cinema-btn");
  const modeTheaterBtn = document.getElementById("mode-theater-btn");
  const modeBtns = [modeEventsBtn, modeCinemaBtn, modeTheaterBtn];

  modeBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener("click", () => {
        modeBtns.forEach(b => { if (b) b.classList.remove("active"); });
        btn.classList.add("active");
        currentMode = btn.getAttribute("data-mode");

        // Mostra/Nascondi selettore cinema in base alla modalità
        const cinemaSelectContainer = document.getElementById("cinema-select-container");
        if (cinemaSelectContainer) {
          if (currentMode === "cinema") {
            cinemaSelectContainer.style.display = "flex";
          } else {
            cinemaSelectContainer.style.display = "none";
            if (cinemaSelect) cinemaSelect.value = "all";
          }
        }

        renderMonthlyCalendar();
      });
    }
  });

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

      renderMonthlyCalendar();
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
      
      // Find event for this location in the loaded monthly events
      const locationName = hotspot.getAttribute("data-location");
      const matchedEvents = ALL_EVENTS_DATA.filter(ev => 
        (ev.luogo_nome && ev.luogo_nome.toLowerCase().includes(locationName.toLowerCase())) || 
        (ev.luogo_indirizzo && ev.luogo_indirizzo.toLowerCase().includes(locationName.toLowerCase()))
      );
      
      // Update infobox
      mapInfoTitle.textContent = locationName;
      
      if (matchedEvents.length > 0) {
        let bodyHtml = `<p>Ci sono <strong>${matchedEvents.length} eventi</strong> questo mese in questa zona:</p><ul style="margin-top: 10px; padding-left: 20px;">`;
        matchedEvents.forEach(ev => {
          // format date from YYYY-MM-DD to friendly
          const d = ev.data.split('-');
          const friendlyDate = `${d[2]}/${d[1]}`;
          bodyHtml += `<li style="margin-bottom: 5px;"><strong>${friendlyDate}:</strong> ${ev.title}</li>`;
        });
        bodyHtml += `</ul><p class="event-address">📍 ${matchedEvents[0].luogo_indirizzo || matchedEvents[0].luogo_nome}</p>`;
        
        mapInfoContent.innerHTML = bodyHtml;
        
        // Show footer button and set target
        mapInfoFooter.style.display = "block";
        mapInfoAction.onclick = () => {
          // Scroll to agenda
          document.getElementById("agenda").scrollIntoView({ behavior: "smooth" });
        };
      } else {
        mapInfoContent.innerHTML = `<p>Nessun evento programmato in questa zona per questo mese.</p><p>Hai qualcosa da proporre? <a href="#segnala" style="color: var(--color-pink); font-weight: 700;">Segnala la tua data</a>!</p>`;
        mapInfoFooter.style.display = "none";
      }
    });
  });

  // Set up custom cursor events
  initCustomCursor();

  // Set up theme switcher
  initThemeSwitcher();

  // Initialize Venue Authentication Portal
  initVenueAuth();
}

// Avvio dell'app sicuro (garantisce l'esecuzione anche se DOMContentLoaded è già scattato)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

// I dettagli degli eventi e il modale non sono più necessari in homepage, sono gestiti in giorno.html.

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

/* ==========================================================================
   THEME SWITCHER
   ========================================================================== */
function initThemeSwitcher() {
  const themeToggle = document.getElementById("theme-toggle");
  if (!themeToggle) return;

  const currentTheme = localStorage.getItem("theme") || "dark";
  
  const applyTheme = (theme) => {
    if (theme === "light") {
      document.documentElement.classList.add("light-theme");
      document.body.classList.add("light-theme");
      themeToggle.querySelector(".theme-icon").textContent = "☀️";
      themeToggle.querySelector(".theme-text").textContent = "LIGHT";
    } else {
      document.documentElement.classList.remove("light-theme");
      document.body.classList.remove("light-theme");
      themeToggle.querySelector(".theme-icon").textContent = "🌙";
      themeToggle.querySelector(".theme-text").textContent = "MIDNIGHT";
    }
  };

  applyTheme(currentTheme);

  themeToggle.addEventListener("click", () => {
    const isCurrentlyLight = document.body.classList.contains("light-theme");
    const newTheme = isCurrentlyLight ? "dark" : "light";
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  });
}

/* ==========================================================================
   VENUE AUTHENTICATION & PORTAL LOGIC
   ========================================================================== */
function initVenueAuth() {
  const authContainer = document.getElementById("auth-container");
  const loggedInContainer = document.getElementById("logged-in-container");
  const eventIframe = document.getElementById("event-iframe");
  const loggedVenueNameSpan = document.getElementById("logged-venue-name");
  
  const tabLoginBtn = document.getElementById("tab-login-btn");
  const tabRegisterBtn = document.getElementById("tab-register-btn");
  const panelLogin = document.getElementById("panel-login");
  const panelRegister = document.getElementById("panel-register");

  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const registerForm = document.getElementById("register-form");
  const registerError = document.getElementById("register-error");
  const registerSuccess = document.getElementById("register-success");
  const btnLogout = document.getElementById("btn-logout");

  // Pre-configured venues & keys
  const DEFAULT_VENUES = {
    "Fattoria Scalabrini": "mwxNps5vPitHGkf4",
    "Al Corso": "alcorso2026",
    "Rosebud": "rosebud2026",
    "Novecento": "novecento2026"
  };

  // Safe base64 encoding (supports UTF-8 strings like accented chars)
  function safeBtoa(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  // Load registered venues from localStorage (or init empty)
  function getStoredVenues() {
    const data = localStorage.getItem("fomm_quell_venues");
    return data ? JSON.parse(data) : {};
  }

  // Save a new venue to localStorage
  function storeVenue(name, key, password) {
    const venues = getStoredVenues();
    venues[name] = { key, password };
    localStorage.setItem("fomm_quell_venues", JSON.stringify(venues));
  }

  // Check login credentials
  function validateCredentials(name, keyOrPassword) {
    // 1. Check pre-configured defaults
    if (DEFAULT_VENUES[name] && DEFAULT_VENUES[name] === keyOrPassword) {
      return { name: name, key: DEFAULT_VENUES[name] };
    }
    // 2. Check localStorage custom registrations
    const venues = getStoredVenues();
    if (venues[name]) {
      if (venues[name].password === keyOrPassword || venues[name].key === keyOrPassword) {
        return { name: name, key: venues[name].key };
      }
    }
    return null;
  }

  // Build Apps Script iframe URL
  function loadIframeForVenue(name, key) {
    if (!eventIframe) return;
    const encodedName = safeBtoa(name);
    const scriptUrl = `https://script.google.com/macros/s/AKfycbzbVbGc_9-bA568AuKlewM3IQh05Z1QStAibCr8PWFqpICAD1I5FH1Xtpf8Can6iYqw/exec?action=form&op=${encodedName}&key=${key}&`;
    eventIframe.src = scriptUrl;
  }

  // Toggle visible UI state based on session
  function updateAuthState() {
    const session = localStorage.getItem("fomm_quell_logged_venue");
    if (session) {
      const user = JSON.parse(session);
      if (authContainer) authContainer.style.display = "none";
      if (loggedInContainer) loggedInContainer.style.display = "block";
      if (loggedVenueNameSpan) loggedVenueNameSpan.textContent = user.name;
      loadIframeForVenue(user.name, user.key);
    } else {
      if (authContainer) authContainer.style.display = "block";
      if (loggedInContainer) loggedInContainer.style.display = "none";
      if (eventIframe) eventIframe.src = "";
    }
  }

  // Tab switching
  if (tabLoginBtn && tabRegisterBtn && panelLogin && panelRegister) {
    tabLoginBtn.addEventListener("click", () => {
      tabLoginBtn.classList.add("active");
      tabRegisterBtn.classList.remove("active");
      panelLogin.style.display = "block";
      panelRegister.style.display = "none";
      if (loginError) loginError.style.display = "none";
    });

    tabRegisterBtn.addEventListener("click", () => {
      tabRegisterBtn.classList.add("active");
      tabLoginBtn.classList.remove("active");
      panelRegister.style.display = "block";
      panelLogin.style.display = "none";
      if (registerError) registerError.style.display = "none";
      if (registerSuccess) registerSuccess.style.display = "none";
    });
  }

  // Login handler
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("login-venue-name").value.trim();
      const keyOrPassword = document.getElementById("login-key").value.trim();

      const user = validateCredentials(name, keyOrPassword);
      if (user) {
        localStorage.setItem("fomm_quell_logged_venue", JSON.stringify(user));
        loginForm.reset();
        if (loginError) loginError.style.display = "none";
        updateAuthState();
      } else {
        if (loginError) {
          loginError.textContent = "Locale o chiave non validi. Controlla e riprova.";
          loginError.style.display = "block";
        }
      }
    });
  }

  // Register handler
  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("register-venue-name").value.trim();
      const email = document.getElementById("register-email").value.trim();
      const key = document.getElementById("register-key").value.trim();
      const password = document.getElementById("register-password").value.trim();
      const code = document.getElementById("activation-code").value.trim();

      // Check activation code
      if (code !== "FOMMQUELL2026") {
        if (registerError) {
          registerError.textContent = "Codice di attivazione non valido.";
          registerError.style.display = "block";
          if (registerSuccess) registerSuccess.style.display = "none";
        }
        return;
      }

      // Check if already exists
      if (DEFAULT_VENUES[name]) {
        if (registerError) {
          registerError.textContent = "Questo locale è pre-configurato. Accedi direttamente.";
          registerError.style.display = "block";
        }
        return;
      }

      storeVenue(name, key, password);
      
      if (registerError) registerError.style.display = "none";
      if (registerSuccess) {
        registerSuccess.textContent = "Registrazione completata! Accesso in corso...";
        registerSuccess.style.display = "block";
      }

      setTimeout(() => {
        const user = { name: name, key: key };
        localStorage.setItem("fomm_quell_logged_venue", JSON.stringify(user));
        registerForm.reset();
        if (registerSuccess) registerSuccess.style.display = "none";
        updateAuthState();
      }, 1500);
    });
  }

  // Logout handler
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      localStorage.removeItem("fomm_quell_logged_venue");
      updateAuthState();
    });
  }

  updateAuthState();
}


