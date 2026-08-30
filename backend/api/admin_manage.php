<?php
/**
 * API di Amministrazione Fômm Quell (Fômm Quell 2.0)
 * Riservata esclusivamente agli utenti con ruolo 'admin'.
 * Gestisce: approvazione/rifiuto eventi e realtà, gestione utenti, log di sistema.
 */

// Questa API è usata solo dalla stessa origine del sito.
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Configura sessione sicura
session_start();

// Verifica autenticazione e ruolo amministratore
if (!isset($_SESSION['user_id']) || $_SESSION['ruolo'] !== 'admin') {
    header('HTTP/1.1 403 Forbidden');
    echo json_encode(['success' => false, 'message' => 'Accesso negato. Questa sezione è riservata agli amministratori.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    $csrfToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals($_SESSION['csrf_token'] ?? '', $csrfToken)) {
        header('HTTP/1.1 403 Forbidden');
        echo json_encode(['success' => false, 'message' => 'Richiesta non valida. Aggiorna la pagina e riprova.']);
        exit;
    }
}

require_once __DIR__ . '/../config/db.php';
$db = getDB();

$adminId = $_SESSION['user_id'];
$action = $_GET['action'] ?? 'list';

try {
    if ($action === 'approve_event') {
        // Approva evento e lo rende pubblicato
        $input = json_decode(file_get_contents('php://input'), true);
        $eventoId = (int)($input['evento_id'] ?? $_POST['evento_id'] ?? 0);
        
        if ($eventoId <= 0) {
            header('HTTP/1.1 400 Bad Request');
            echo json_encode(['success' => false, 'message' => 'ID evento non valido.']);
            exit;
        }

        $stmt = $db->prepare("UPDATE eventi SET stato = 'published', published_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$eventoId]);

        // Scrivi log attività
        $log = $db->prepare("INSERT INTO activity_log (user_id, azione, tabella_nome, record_id, descrizione) VALUES (?, 'approvazione', 'eventi', ?, ?)");
        $log->execute([$adminId, $eventoId, "Approvato e pubblicato evento ID $eventoId"]);

        echo json_encode(['success' => true, 'message' => 'Evento approvato e pubblicato con successo.']);
        exit;

    } elseif ($action === 'reject_event') {
        // Rifiuta evento e specifica eventuale motivazione
        $input = json_decode(file_get_contents('php://input'), true);
        $eventoId = (int)($input['evento_id'] ?? $_POST['evento_id'] ?? 0);
        $motivo = trim($input['motivo'] ?? $_POST['motivo'] ?? '');

        if ($eventoId <= 0) {
            header('HTTP/1.1 400 Bad Request');
            echo json_encode(['success' => false, 'message' => 'ID evento non valido.']);
            exit;
        }

        $stmt = $db->prepare("UPDATE eventi SET stato = 'rejected', motivo_rifiuto = ? WHERE id = ?");
        $stmt->execute([$motivo, $eventoId]);

        // Scrivi log
        $log = $db->prepare("INSERT INTO activity_log (user_id, azione, tabella_nome, record_id, descrizione) VALUES (?, 'rifiuto', 'eventi', ?, ?)");
        $log->execute([$adminId, $eventoId, "Rifiutato evento ID $eventoId. Motivazione: $motivo"]);

        echo json_encode(['success' => true, 'message' => 'Evento rifiutato con successo.']);
        exit;

    } elseif ($action === 'approve_realta') {
        // Approva la registrazione di una nuova realtà (diventa attiva e sblocca il login dei gestori)
        $input = json_decode(file_get_contents('php://input'), true);
        $realtaId = (int)($input['realta_id'] ?? $_POST['realta_id'] ?? 0);

        if ($realtaId <= 0) {
            header('HTTP/1.1 400 Bad Request');
            echo json_encode(['success' => false, 'message' => 'ID realtà non valido.']);
            exit;
        }

        $stmt = $db->prepare("UPDATE realta SET attiva = 1, stato = 'approved', motivo_rifiuto = NULL, approved_at = CURRENT_TIMESTAMP, approved_by = ? WHERE id = ?");
        $stmt->execute([$adminId, $realtaId]);

        // Log
        $log = $db->prepare("INSERT INTO activity_log (user_id, azione, tabella_nome, record_id, descrizione) VALUES (?, 'approvazione', 'realta', ?, ?)");
        $log->execute([$adminId, $realtaId, "Approvata e attivata realtà partner ID $realtaId"]);

        echo json_encode(['success' => true, 'message' => 'Locale approvato ed abilitato all\'accesso con successo.']);
        exit;

    } elseif ($action === 'reject_realta') {
        // Rifiuta realtà senza eliminare dati o storico.
        $input = json_decode(file_get_contents('php://input'), true);
        $realtaId = (int)($input['realta_id'] ?? $_POST['realta_id'] ?? 0);
        $motivo = trim($input['motivo'] ?? $_POST['motivo'] ?? '');

        if ($realtaId <= 0) {
            header('HTTP/1.1 400 Bad Request');
            echo json_encode(['success' => false, 'message' => 'ID realtà non valido.']);
            exit;
        }

        $stmt = $db->prepare("UPDATE realta SET attiva = 0, stato = 'rejected', motivo_rifiuto = ?, approved_at = NULL, approved_by = NULL WHERE id = ?");
        $stmt->execute([$motivo, $realtaId]);

        $log = $db->prepare("INSERT INTO activity_log (user_id, azione, tabella_nome, record_id, descrizione) VALUES (?, 'rifiuto', 'realta', ?, ?)");
        $log->execute([$adminId, $realtaId, "Rifiutata realtà ID $realtaId. Motivazione: $motivo"]);
        echo json_encode(['success' => true, 'message' => 'Registrazione realtà rifiutata e conservata nello storico.']);
        exit;

    } elseif ($action === 'list_pending_realta') {
        // Elenca realtà in attesa di approvazione
        $stmt = $db->query("SELECT * FROM realta WHERE stato = 'pending' ORDER BY created_at DESC");
        $pending = $stmt->fetchAll();
        echo json_encode(['success' => true, 'data' => $pending]);
        exit;

    } elseif ($action === 'list_users') {
        // Elenca tutti gli utenti registrati
        $stmt = $db->query("SELECT id, nome, cognome, email, ruolo, attivo, created_at FROM users ORDER BY ruolo ASC, cognome ASC");
        $usersList = $stmt->fetchAll();
        echo json_encode(['success' => true, 'data' => $usersList]);
        exit;

    } elseif ($action === 'toggle_user') {
        // Attiva o disattiva un account utente
        $input = json_decode(file_get_contents('php://input'), true);
        $targetUserId = (int)($input['user_id'] ?? $_POST['user_id'] ?? 0);
        $attivo = (int)($input['attivo'] ?? $_POST['attivo'] ?? 0);

        if ($targetUserId <= 0) {
            header('HTTP/1.1 400 Bad Request');
            echo json_encode(['success' => false, 'message' => 'ID utente non valido.']);
            exit;
        }

        if ($targetUserId === $adminId) {
            header('HTTP/1.1 403 Forbidden');
            echo json_encode(['success' => false, 'message' => 'Non puoi disattivare il tuo stesso account amministratore.']);
            exit;
        }

        $stmt = $db->prepare("UPDATE users SET attivo = ? WHERE id = ?");
        $stmt->execute([$attivo, $targetUserId]);

        $log = $db->prepare("INSERT INTO activity_log (user_id, azione, tabella_nome, record_id, descrizione) VALUES (?, 'modifica', 'users', ?, ?)");
        $statoTesto = $attivo ? 'attivato' : 'disattivato';
        $log->execute([$adminId, $targetUserId, "Account utente ID $targetUserId impostato come $statoTesto"]);

        echo json_encode(['success' => true, 'message' => "Stato utente aggiornato con successo a '$statoTesto'."]);
        exit;

    } elseif ($action === 'list_logs') {
        // Elenca i log di attività amministrativa
        $stmt = $db->query("
            SELECT al.*, CONCAT(u.nome, ' ', u.cognome) AS operatore_nome, u.email AS operatore_email
            FROM activity_log al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT 200
        ");
        $logs = $stmt->fetchAll();
        echo json_encode(['success' => true, 'data' => $logs]);
        exit;

    } elseif ($action === 'run_cinema_import') {
        // Avvia l'importazione cinema programmata o manuale
        // Esegue l'importazione leggendo il file JSON locale ed inserendo i dati nel DB
        $jsonPath = __DIR__ . '/../../assets/cinema_events.json';

        if (!file_exists($jsonPath)) {
            header('HTTP/1.1 404 Not Found');
            echo json_encode(['success' => false, 'message' => 'File cinema_events.json non trovato in assets/']);
            exit;
        }

        $jsonData = file_get_contents($jsonPath);
        $screenings = json_decode($jsonData, true);

        if (!is_array($screenings)) {
            header('HTTP/1.1 400 Bad Request');
            echo json_encode(['success' => false, 'message' => 'Formato JSON non valido.']);
            exit;
        }

        $importStats = [
            'parsed' => 0,
            'new_realta' => 0,
            'new_luoghi' => 0,
            'new_films' => 0,
            'new_projections' => 0,
            'duplicates_skipped' => 0
        ];

        foreach ($screenings as $scr) {
            $importStats['parsed']++;

            $title = trim($scr['title'] ?? '');
            $dateStr = trim($scr['date'] ?? '');
            $timeStr = trim($scr['time'] ?? '');
            $locationRaw = trim($scr['location'] ?? '');
            $link = trim($scr['link'] ?? '');
            $lat = isset($scr['latitude']) ? (float)$scr['latitude'] : 44.69820000;
            $lng = isset($scr['longitude']) ? (float)$scr['longitude'] : 10.63000000;
            $img = trim($scr['img'] ?? '');
            $desc = trim($scr['desc'] ?? 'Proiezione cinematografica.');

            if (empty($title) || empty($dateStr) || empty($locationRaw)) continue;

            $cinemaName = trim(preg_replace('/\s*\(.*?\)/', '', $locationRaw));

            $dateParts = explode('/', $dateStr);
            if (count($dateParts) === 3) {
                $formattedDate = "{$dateParts[2]}-{$dateParts[1]}-{$dateParts[0]}";
            } else {
                $formattedDate = date('Y-m-d', strtotime($dateStr));
            }

            // Valida orario
            $timeVal = null;
            $infoGeneriche = null;
            if (preg_match('/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/', $timeStr)) {
                $timeVal = $timeStr;
                if (strlen($timeVal) === 5) {
                    $timeVal .= ":00";
                }
            } else {
                $infoGeneriche = $timeStr; // Salva la dicitura testuale come info generiche
            }

            try {
                $db->beginTransaction();

                // 1. Cerca o crea la Realtà
                $stmtRealta = $db->prepare("SELECT id FROM realta WHERE nome = ? LIMIT 1");
                $stmtRealta->execute([$cinemaName]);
                $realta = $stmtRealta->fetch();
                $realtaId = null;

                if ($realta) {
                    $realtaId = $realta['id'];
                } else {
                    $insRealta = $db->prepare("INSERT INTO realta (nome, tipologia, attiva, stato, approved_at, approved_by) VALUES (?, 'cinema', 1, 'approved', CURRENT_TIMESTAMP, ?)");
                    $insRealta->execute([$cinemaName, $adminId]);
                    $realtaId = $db->lastInsertId();
                    $importStats['new_realta']++;
                }

                // 2. Cerca o crea il Luogo
                $stmtLuogo = $db->prepare("SELECT id FROM luoghi WHERE nome = ? LIMIT 1");
                $stmtLuogo->execute([$cinemaName]);
                $luogo = $stmtLuogo->fetch();
                $luogoId = null;

                if ($luogo) {
                    $luogoId = $luogo['id'];
                } else {
                    $insLuogo = $db->prepare("INSERT INTO luoghi (nome, indirizzo, citta, latitudine, longitudine, attivo) VALUES (?, ?, ?, ?, ?, 1)");
                    $insLuogo->execute([$cinemaName, $cinemaName, 'Reggio Emilia', $lat, $lng]);
                    $luogoId = $db->lastInsertId();
                    $importStats['new_luoghi']++;
                }

                // 3. Cerca o crea il Film
                $stmtFilm = $db->prepare("SELECT id FROM cinema_film WHERE titolo = ? LIMIT 1");
                $stmtFilm->execute([$title]);
                $film = $stmtFilm->fetch();
                $filmId = null;

                if ($film) {
                    $filmId = $film['id'];
                    if (!empty($img)) {
                        $db->prepare("UPDATE cinema_film SET locandina = ? WHERE id = ?")->execute([$img, $filmId]);
                    }
                } else {
                    $insFilm = $db->prepare("INSERT INTO cinema_film (titolo, descrizione, locandina) VALUES (?, ?, ?)");
                    $insFilm->execute([$title, $desc, $img]);
                    $filmId = $db->lastInsertId();
                    $importStats['new_films']++;
                }

                // 4. Verifica se la proiezione specifica esiste già
                $stmtCheck = $db->prepare("
                    SELECT e.id FROM eventi e
                    INNER JOIN evento_cinema ec ON e.id = ec.evento_id
                    WHERE ec.cinema_film_id = ? AND e.data = ? AND (e.ora_inizio = ? OR (e.ora_inizio IS NULL AND ? IS NULL)) AND e.luogo_id = ?
                ");
                $stmtCheck->execute([$filmId, $formattedDate, $timeVal, $timeVal, $luogoId]);
                if ($stmtCheck->fetch()) {
                    $db->rollBack();
                    $importStats['duplicates_skipped']++;
                    continue;
                }

                // 5. Inserimento evento
                $insEvento = $db->prepare("
                    INSERT INTO eventi (titolo, descrizione, data, ora_inizio, realta_id, luogo_id, tipo_evento, stato, created_by, published_at, info_generiche)
                    VALUES (?, ?, ?, ?, ?, ?, 'cinema', 'published', 1, CURRENT_TIMESTAMP, ?)
                ");
                $insEvento->execute([
                    $title, $desc, $formattedDate, $timeVal, $realtaId, $luogoId, $infoGeneriche
                ]);
                $eventoId = $db->lastInsertId();

                // 6. Collega alla categoria "Spettacolo"
                $db->prepare("INSERT INTO evento_categorie (evento_id, categoria_id) VALUES (?, 3)")->execute([$eventoId]);

                // 7. Collega all'evento_cinema
                $insProj = $db->prepare("
                    INSERT INTO evento_cinema (evento_id, cinema_film_id, ticket_url)
                    VALUES (?, ?, ?)
                ");
                $insProj->execute([$eventoId, $filmId, $link]);

                $db->commit();
                $importStats['new_projections']++;

            } catch (Exception $e) {
                if ($db->inTransaction()) $db->rollBack();
            }
        }

        // Log attività
        $log = $db->prepare("INSERT INTO activity_log (user_id, azione, tabella_nome, descrizione) VALUES (?, 'importazione', 'cinema_film', ?)");
        $logStr = "Avviata importazione cinema manuale. Proiezioni lette: {$importStats['parsed']}, Nuove proiezioni: {$importStats['new_projections']}, Duplicate: {$importStats['duplicates_skipped']}";
        $log->execute([$adminId, $logStr]);

        echo json_encode(['success' => true, 'data' => $importStats, 'message' => 'Importazione completata con successo.']);
        exit;

    } else {
        header('HTTP/1.1 400 Bad Request');
        echo json_encode(['success' => false, 'message' => 'Azione amministrativa non specificata o sconosciuta.']);
        exit;
    }

} catch (Exception $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode(['success' => false, 'message' => 'Si è verificato un errore durante l\'operazione: ' . $e->getMessage()]);
    exit;
}
