/**
 * Logica per la visualizzazione giornaliera degli eventi di Fômm Quell 2.0
 */

document.addEventListener("DOMContentLoaded", () => {
  // Configurazione dei parametri dall'URL
  const params = new URLSearchParams(window.location.search);
  let currentDateStr = params.get("date") || getTodayDateStr();
  let currentMode = params.get("mode") || "evento"; // 'evento', 'cinema', 'teatro'

  // Elementi UI
  const dayDisplayTitle = document.getElementById("day-display-title");
  const dayEventsContainer = document.getElementById("day-events-container");
  const prevDayBtn = document.getElementById("prev-day-btn");
  const nextDayBtn = document.getElementById("next-day-btn");
  const themeToggle = document.getElementById("theme-toggle");

  const modeEventsBtn = document.getElementById("mode-events-btn");
  const modeCinemaBtn = document.getElementById("mode-cinema-btn");
  const modeTheaterBtn = document.getElementById("mode-theater-btn");

  // Inizializza i bottoni della modalità
  updateModeButtonsUI();

  // Inizializza e carica il tema
  initTheme();

  // Carica gli eventi per il giorno selezionato
  fetchDayEvents();

  // Configura i gestori dei bottoni delle modalità
  [modeEventsBtn, modeCinemaBtn, modeTheaterBtn].forEach(btn => {
    if (btn) {
      btn.addEventListener("click", () => {
        currentMode = btn.getAttribute("data-mode");
        updateModeButtonsUI();
        updateURLParams();
        fetchDayEvents();
      });
    }
  });

  // Configura i gestori per la navigazione dei giorni
  if (prevDayBtn) {
    prevDayBtn.addEventListener("click", () => {
      shiftDate(-1);
    });
  }

  if (nextDayBtn) {
    nextDayBtn.addEventListener("click", () => {
      shiftDate(1);
    });
  }

  // --- Funzioni Helper ---

  function getTodayDateStr() {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  function shiftDate(days) {
    const dateObj = new Date(currentDateStr);
    dateObj.setDate(dateObj.getDate() + days);
    currentDateStr = dateObj.toISOString().split('T')[0];
    updateURLParams();
    fetchDayEvents();
  }

  function updateURLParams() {
    const newURL = `${window.location.pathname}?date=${currentDateStr}&mode=${currentMode}`;
    window.history.pushState({ path: newURL }, '', newURL);
  }

  function updateModeButtonsUI() {
    [modeEventsBtn, modeCinemaBtn, modeTheaterBtn].forEach(btn => {
      if (btn) {
        if (btn.getAttribute("data-mode") === currentMode) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      }
    });
  }

  // Traduce la data ISO nel formato discorsivo (es. "21 AGOSTO 2026")
  function formatFriendlyDate(dateStr) {
    const dateObj = new Date(dateStr);
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return dateObj.toLocaleDateString('it-IT', options).toUpperCase();
  }

  // Caricamento eventi tramite AJAX
  async function fetchDayEvents() {
    dayEventsContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem;">
        <p>Caricamento degli eventi del giorno in corso...</p>
        <div class="loading-spinner" style="width: 40px; height: 40px; border: 4px solid rgba(255, 46, 147, 0.2); border-top: 4px solid var(--color-pink); border-radius: 50%; margin: 10px auto; animation: spin 1s infinite linear;"></div>
      </div>
    `;

    // Aggiorna titolo visualizzato
    if (dayDisplayTitle) {
      dayDisplayTitle.textContent = formatFriendlyDate(currentDateStr);
    }

    const dateParts = currentDateStr.split("-");
    const year = dateParts[0];
    const month = parseInt(dateParts[1], 10);
    const day = parseInt(dateParts[2], 10);

    const apiUrl = `backend/api/get_events.php?year=${year}&month=${month}&day=${day}&mode=${currentMode}`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error("Errore risposta server.");
      const result = await response.json();

      if (result.success && result.data && result.data.length > 0) {
        renderEventsList(result.data);
      } else {
        renderEmptyState();
      }
    } catch (error) {
      console.error(error);
      dayEventsContainer.innerHTML = `
        <div class="no-events-fallback">
          <h3>ERRORE DI CARICAMENTO</h3>
          <p>Impossibile comunicare con il database degli eventi. Riprova più tardi.</p>
        </div>
      `;
    }
  }

  function renderEventsList(events) {
    dayEventsContainer.innerHTML = "";
    
    events.forEach(ev => {
      // Formatta orari
      let timeText = "Ora da definire";
      if (ev.ora_inizio) {
        timeText = ev.ora_inizio.substring(0, 5);
        if (ev.ora_fine) {
          timeText += ` - ${ev.ora_fine.substring(0, 5)}`;
        }
      }

      // Rileva luogo e realtà
      const luogoText = ev.luogo_nome || "Reggio Emilia";
      const realtaText = ev.realta_nome ? `Organizzato da: ${ev.realta_nome}` : "";

      // Mappa prezzi/info
      let metaInfo = [];
      if (ev.info_prezzo) metaInfo.push(`💰 ${ev.info_prezzo}`);
      if (ev.info_generiche) metaInfo.push(`ℹ️ ${ev.info_generiche}`);
      const metaInfoHtml = metaInfo.length > 0 ? `<div class="detail-meta-row">${metaInfo.map(m => `<span class="detail-meta-item">${m}</span>`).join('')}</div>` : "";

      // Mappa categorie badges
      const categoriesHtml = (ev.categorie || []).map(c => `
        <span class="category-tag" style="background-color: ${c.colore}; color: var(--color-dark); border-color: var(--color-dark); box-shadow: 2px 2px 0px var(--color-dark); font-size: 0.7rem; padding: 0.2rem 0.5rem; text-transform: uppercase; font-weight: 700; border-radius: var(--border-radius); border: 2px solid;">
          ${c.nome}
        </span>
      `).join(" ");

      // Mappa contatti
      const contactsHtml = (ev.contatti || []).map(c => {
        let icon = "🔗";
        if (c.tipo === "instagram") icon = "📸";
        if (c.tipo === "email") icon = "✉️";
        if (c.tipo === "cellulare") icon = "📞";
        
        let href = c.valore;
        if (c.tipo === "instagram" && !c.valore.startsWith("http")) {
          href = `https://instagram.com/${c.valore.replace("@", "")}`;
        } else if (c.tipo === "email" && !c.valore.startsWith("mailto")) {
          href = `mailto:${c.valore}`;
        } else if (c.tipo === "cellulare" && !c.valore.startsWith("tel")) {
          href = `tel:${c.valore.replace(/\s+/g, '')}`;
        }

        return `
          <a href="${href}" target="_blank" rel="noopener" class="contact-link-brutal">
            <span>${icon}</span>
            <span>${c.dicitura} ${c.valore}</span>
          </a>
        `;
      }).join("");

      const card = document.createElement("div");
      card.className = "detail-card";
      card.innerHTML = `
        <div class="detail-card-header">
          <h2 class="detail-card-title">${ev.titolo}</h2>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${categoriesHtml}
          </div>
        </div>
        <div class="detail-meta-row" style="margin-bottom: 0.8rem;">
          <span class="detail-meta-item">🕒 ${timeText}</span>
          <span class="detail-meta-item">📍 ${luogoText}</span>
        </div>
        ${realtaText ? `<p style="font-size: 0.85rem; font-weight: 700; color: var(--color-pink); margin-bottom: 1.2rem; text-transform: uppercase;">${realtaText}</p>` : ""}
        ${metaInfoHtml}
        <div class="detail-desc">${ev.descrizione}</div>
        ${contactsHtml ? `<div class="detail-contacts">${contactsHtml}</div>` : ""}
      `;
      dayEventsContainer.appendChild(card);
    });
  }

  function renderEmptyState() {
    const tipologiaTesto = currentMode === "cinema" ? "proiezioni cinematografiche" : (currentMode === "teatro" ? "spettacoli teatrali" : "eventi generali");
    dayEventsContainer.innerHTML = `
      <div class="no-events-fallback">
        <h3>NESSUN EVENTO IN PROGRAMMA</h3>
        <p>Non ci sono ${tipologiaTesto} segnalati per questa data.</p>
        <p style="margin-top: 1.5rem; font-size: 0.85rem; color: var(--color-gray);">Hai qualcosa da segnalare? <a href="index.html#segnala" style="color: var(--color-pink); font-weight: 700;">Inserisci la tua data</a>!</p>
      </div>
    `;
  }

  // --- Tema Switcher ---
  function initTheme() {
    if (!themeToggle) return;
    const currentTheme = localStorage.getItem("theme") || "dark";
    applyTheme(currentTheme);

    themeToggle.addEventListener("click", () => {
      const isCurrentlyLight = document.body.classList.contains("light-theme");
      const newTheme = isCurrentlyLight ? "dark" : "light";
      localStorage.setItem("theme", newTheme);
      applyTheme(newTheme);
    });
  }

  function applyTheme(theme) {
    const icon = themeToggle ? themeToggle.querySelector(".theme-icon") : null;
    const text = themeToggle ? themeToggle.querySelector(".theme-text") : null;

    if (theme === "light") {
      document.documentElement.classList.add("light-theme");
      document.body.classList.add("light-theme");
      if (icon) icon.textContent = "☀️";
      if (text) text.textContent = "LIGHT";
    } else {
      document.documentElement.classList.remove("light-theme");
      document.body.classList.remove("light-theme");
      if (icon) icon.textContent = "🌙";
      if (text) text.textContent = "MIDNIGHT";
    }
  }
});
