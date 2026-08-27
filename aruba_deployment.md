# 🚀 GUIDA ALL'INSTALLAZIONE E DEPLOY - FÔMM QUELL 2.0 (ARUBA & LOCAL XAMPP)

Questa guida illustra passo-passo come configurare l'ambiente di sviluppo locale su **XAMPP** e come pubblicare l'applicazione in produzione sull'hosting **Aruba**.

---

## 💻 1. SVILUPPO LOCALE (XAMPP)

Per avviare il progetto sul proprio computer locale, segui questi passaggi:

### Passaggio 1.1: Installazione del Database
1. Avvia **XAMPP Control Panel** e attiva i moduli **Apache** e **MySQL**.
2. Apri il browser all'indirizzo [http://localhost/phpmyadmin](http://localhost/phpmyadmin).
3. Crea un nuovo database nominato **`fomm_quell`** con codifica **`utf8mb4_general_ci`**.
4. Clicca sul database appena creato, seleziona la scheda **Importa** e seleziona il file:
   `backend/database/schema.sql` (questo creerà la struttura delle tabelle).
5. Successivamente, importa nello stesso modo il file dei dati iniziali:
   `backend/database/seed.sql` (questo inserirà categorie, tag, luoghi fisici ed utenti di test).

### Passaggio 1.2: Configurazione Credenziali
1. Entra nella cartella `backend/config/`.
2. Copia il file `config.json.example` rinominandolo in **`config.json`**.
3. Il file configurerà in automatico l'accesso locale di default:
   * **Host:** `localhost`
   * **DB Name:** `fomm_quell`
   * **User:** `root`
   * **Password:** *(vuota)*

### Passaggio 1.3: Avvio
1. Copia l'intera cartella del progetto `fomm-quell-site` all'interno della cartella `htdocs` di XAMPP (es: `C:\xampp\htdocs\fomm-quell-site`).
2. Apri il browser ed accedi a [http://localhost/fomm-quell-site](http://localhost/fomm-quell-site).

---

## ☁️ 2. DEPLOY IN PRODUZIONE (ARUBA)

Quando il progetto è pronto per essere pubblicato online su Aruba, segui questa procedura:

### Passaggio 2.1: Configurazione Database su Aruba
1. Accedi al tuo pannello MySQL di Aruba ([https://mysql.aruba.it](https://mysql.aruba.it)) usando le credenziali fornite da Aruba.
2. Scegli uno dei database disponibili (es: `Sp_1234567_1`) e accedi a phpMyAdmin.
3. Importa in sequenza i file:
   1. `backend/database/schema.sql`
   2. `backend/database/seed.sql`

### Passaggio 2.2: Configurazione File di Connessione
1. Nella cartella locale `backend/config/`, crea o modifica il file **`config.json`** inserendo le credenziali reali del database Aruba:
   ```json
   {
     "db_host": "62.149.150.xx", 
     "db_name": "Sp_1234567_1",
     "db_user": "Sp_1234567",
     "db_pass": "latuapasswordmysql",
     "db_port": "3306"
   }
   ```
   *(Nota: l'IP dell'host database è fornito all'interno delle email di attivazione MySQL di Aruba).*

### Passaggio 2.3: Caricamento File via FTP
1. Connetti il tuo client FTP (es. FileZilla) allo spazio web Aruba.
2. Carica l'intero contenuto della cartella `fomm-quell-site` all'interno della cartella principale (solitamente la radice `www.nomedominio.it` o `public_html`).
3. **⚠️ IMPORTANTE:** Assicurati che il file `backend/config/config.json` sia caricato correttamente online, ma che **NON** venga mai caricato su repository pubblici di GitHub (il file è già inserito nel `.gitignore` locale per sicurezza).

---

## 🔄 3. MIGRAZIONE DATI STORICI (DA GOOGLE SHEETS)

Per importare tutti gli eventi precedentemente salvati nel Google Sheets originale all'interno del nuovo database MySQL, avvia lo script di migrazione:
* **Da browser:** Accedi all'indirizzo [http://www.nomedominio.it/backend/scripts/migrate_sheets.php?token=FOMMQUELL2026](http://www.nomedominio.it/backend/scripts/migrate_sheets.php?token=FOMMQUELL2026) (in locale: [http://localhost/fomm-quell-site/backend/scripts/migrate_sheets.php?token=FOMMQUELL2026](http://localhost/fomm-quell-site/backend/scripts/migrate_sheets.php?token=FOMMQUELL2026)).
* **Da riga di comando (CLI):** Esegui:
  ```bash
  php backend/scripts/migrate_sheets.php
  ```

Lo script stamperà un report a schermo mostrando il numero di eventi migrati, i luoghi creati ed eventuali errori riscontrati.

---

## 🎬 4. AGGIORNAMENTO AUTOMATICO CINEMA (CRON JOB)

Per fare in modo che la programmazione dei cinema si aggiorni da sola ogni giorno:

### Passaggio 4.1: Avvio dello Scraper Python
1. Lo scraper `scripts/scrape_cinemas.py` deve girare una volta al giorno per scaricare i film aggiornati e salvarli in `assets/cinema_events.json`.
2. Se il tuo piano hosting di Aruba supporta script Python in background, puoi configurarlo; in alternativa, mantieni attiva l'attuale **GitHub Action** (`.github/workflows/cinema_sync.yml`) che esegue lo scraper sul server GitHub ed effettua il commit automatico del file JSON `cinema_events.json` aggiornato all'una di notte.

### Passaggio 4.2: Sincronizzazione nel Database (Cron Job Aruba)
Una volta che il file JSON è aggiornato, le nuove proiezioni devono essere inserite nelle tabelle MySQL.
1. Accedi al pannello di controllo di Aruba e vai alla sezione **Pianificazione Attività (Cron Job / Operazioni Pianificate)**.
2. Aggiungi un'operazione pianificata giornaliera (ad esempio alle 02:00 di notte, dopo l'esecuzione dello scraper Python).
3. Imposta come comando da eseguire l'URL del file PHP di importazione, inserendo il token di sicurezza segreto:
   `https://www.nomedominio.it/backend/scripts/import_cinema.php?token=FOMMQUELL2026`
4. Il sistema sincronizzerà autonomamente i nuovi film all'interno delle tabelle relazionali senza duplicarli.

---

## 🔒 5. SICUREZZA E MANUTENZIONE

* **Cambio Password Admin:** I dati di default del seed creano l'utente amministratore `admin@fommquell.it` con password `fommquelladmin`. **Si raccomanda caldamente di cambiare questa password o l'email subito dopo il primo avvio** inserendo una password personalizzata sicura.
* **Generazione Password Cifrate:** Se hai bisogno di creare nuovi utenti direttamente da database, puoi generare l'hash bcrypt corretto da inserire nella colonna `password_hash` eseguendo da terminale:
  ```bash
  php backend/scripts/generate_hash.php tuapassword
  ```
