<?php
/**
 * API di Amministrazione Fômm Quell (Fômm Quell 2.0)
 * Riservata esclusivamente agli utenti con ruolo 'admin'.
 * Gestisce: approvazione/rifiuto eventi e realtà, gestione utenti, log di sistema.
 */

// Configurazione CORS con supporto a sessioni/cookie
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: $origin");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS");
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

        $stmt = $db->prepare("UPDATE realta SET attiva = 1 WHERE id = ?");
        $stmt->execute([$realtaId]);

        // Log
        $log = $db->prepare("INSERT INTO activity_log (user_id, azione, tabella_nome, record_id, descrizione) VALUES (?, 'approvazione', 'realta', ?, ?)");
        $log->execute([$adminId, $realtaId, "Approvata e attivata realtà partner ID $realtaId"]);

        echo json_encode(['success' => true, 'message' => 'Locale approvato ed abilitato all\'accesso con successo.']);
        exit;

    } elseif ($action === 'reject_realta') {
        // Rifiuta realtà (elimina registrazione)
        $input = json_decode(file_get_contents('php://input'), true);
        $realtaId = (int)($input['realta_id'] ?? $_POST['realta_id'] ?? 0);

        if ($realtaId <= 0) {
            header('HTTP/1.1 400 Bad Request');
            echo json_encode(['success' => false, 'message' => 'ID realtà non valido.']);
            exit;
        }

        $db->beginTransaction();
        
        // Rileva utenti associati per scriverlo nel log
        $stmtUsers = $db->prepare("SELECT user_id FROM realta_users WHERE realta_id = ?");
        $stmtUsers->execute([$realtaId]);
        $associatedUsers = $stmtUsers->fetchAll(PDO::FETCH_COLUMN);

        // Elimina realtà (le chiavi esterne elimineranno a cascata le associazioni realta_users e gli utenti se non più collegati)
        $db->prepare("DELETE FROM realta WHERE id = ?")->execute([$realtaId]);
        
        // Elimina utenti orfani collegati
        if (!empty($associatedUsers)) {
            $inClause = implode(',', array_fill(0, count($associatedUsers), '?'));
            $db->prepare("DELETE FROM users WHERE id IN ($inClause) AND ruolo = 'gestore'")->execute($associatedUsers);
        }

        $log = $db->prepare("INSERT INTO activity_log (user_id, azione, tabella_nome, record_id, descrizione) VALUES (?, 'rifiuto', 'realta', ?, ?)");
        $log->execute([$adminId, $realtaId, "Rifiutata ed eliminata realtà ID $realtaId (con i relativi account gestori orfani)"]);

        $db->commit();
        echo json_encode(['success' => true, 'message' => 'Registrazione realtà rifiutata ed eliminata dal sistema.']);
        exit;

    } elseif ($action === 'list_pending_realta') {
        // Elenca realtà in attesa di approvazione
        $stmt = $db->query("SELECT * FROM realta WHERE attiva = 0 ORDER BY created_at DESC");
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

            if (strlen($timeStr) === 5) $timeStr .= ":00";

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
                    $insRealta = $db->prepare("INSERT INTO realta (nome, tipologia, attiva) VALUES (?, 'cinema', 1)");
                    $insRealta->execute([$cinemaName]);
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
                    WHERE ec.cinema_film_id = ? AND e.data = ? AND e.ora_inizio = ? AND e.luogo_id = ?
                ");
                $stmtCheck->execute([$filmId, $formattedDate, $timeStr, $luogoId]);
                if ($stmtCheck->fetch()) {
                    $db->rollBack();
                    $importStats['duplicates_skipped']++;
                    continue;
                }

                // 5. Inserimento evento
                $insEvento = $db->prepare("
                    INSERT INTO eventi (titolo, descrizione, data, ora_inizio, realta_id, luogo_id, tipo_evento, stato, created_by, published_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'cinema', 'published', 1, CURRENT_TIMESTAMP)
                ");
                $insEvento->execute([
                    $title, $desc, $formattedDate, $timeStr, $realtaId, $luogoId
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
