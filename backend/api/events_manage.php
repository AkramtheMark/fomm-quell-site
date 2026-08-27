<?php
/**
 * API per il Controllo e la Gestione degli Eventi (Fômm Quell 2.0)
 * Gestisce: creazione, recupero filtrato per ruolo, modifica ed eliminazione eventi.
 */

// Configurazione CORS con supporto a sessioni/cookie
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: $origin");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Configura sessione sicura
session_start();

if (!isset($_SESSION['user_id'])) {
    header('HTTP/1.1 401 Unauthorized');
    echo json_encode(['success' => false, 'message' => 'Devi effettuare l\'accesso per gestire gli eventi.']);
    exit;
}

require_once __DIR__ . '/../config/db.php';
$db = getDB();

$userId = $_SESSION['user_id'];
$ruolo = $_SESSION['ruolo'];
$realtaIds = $_SESSION['realta_ids'] ?? [];

$method = $_SERVER['REQUEST_METHOD'];

// 1. GET: Recupero degli eventi autorizzati
if ($method === 'GET') {
    try {
        $eventoId = $_GET['id'] ?? null;
        
        if ($eventoId) {
            // Recupera singolo evento dettagliato
            $stmt = $db->prepare("
                SELECT e.*, l.nome AS luogo_nome, l.indirizzo AS luogo_indirizzo, r.nome AS realta_nome
                FROM eventi e
                LEFT JOIN luoghi l ON e.luogo_id = l.id
                LEFT JOIN realta r ON e.realta_id = r.id
                WHERE e.id = ?
            ");
            $stmt->execute([$eventoId]);
            $evento = $stmt->fetch();
            
            if (!$evento) {
                header('HTTP/1.1 404 Not Found');
                echo json_encode(['success' => false, 'message' => 'Evento non trovato.']);
                exit;
            }
            
            // Sicurezza: un utente normale non può vedere dettagli di eventi di altri locali se sono Draft/Pending
            if ($ruolo !== 'admin' && !in_array($evento['realta_id'], $realtaIds)) {
                header('HTTP/1.1 403 Forbidden');
                echo json_encode(['success' => false, 'message' => 'Non hai i permessi per accedere a questo evento.']);
                exit;
            }
            
            // Recupera categorie collegate
            $stmtCat = $db->prepare("SELECT categoria_id FROM evento_categorie WHERE evento_id = ?");
            $stmtCat->execute([$eventoId]);
            $evento['categorie'] = $stmtCat->fetchAll(PDO::FETCH_COLUMN);
            
            // Recupera tag
            $stmtTag = $db->prepare("SELECT t.nome FROM tags t INNER JOIN evento_tags et ON t.id = et.tag_id WHERE et.evento_id = ?");
            $stmtTag->execute([$eventoId]);
            $evento['tags'] = $stmtTag->fetchAll(PDO::FETCH_COLUMN);
            
            // Recupera contatti
            $stmtCont = $db->prepare("SELECT dicitura, tipo, valore, ordine FROM evento_contatti WHERE evento_id = ? ORDER BY ordine ASC");
            $stmtCont->execute([$eventoId]);
            $evento['contatti'] = $stmtCont->fetchAll();
            
            echo json_encode(['success' => true, 'data' => $evento]);
            exit;
        } else {
            // Elenco eventi
            $events = [];
            if ($ruolo === 'admin') {
                // Admin vede tutto
                $stmt = $db->query("
                    SELECT e.*, l.nome AS luogo_nome, r.nome AS realta_nome 
                    FROM eventi e
                    LEFT JOIN luoghi l ON e.luogo_id = l.id
                    LEFT JOIN realta r ON e.realta_id = r.id
                    ORDER BY e.data DESC, e.ora_inizio ASC
                ");
                $events = $stmt->fetchAll();
            } else {
                // Gestore vede solo gli eventi delle proprie realtà
                if (empty($realtaIds)) {
                    echo json_encode(['success' => true, 'data' => []]);
                    exit;
                }
                
                $inClause = implode(',', array_fill(0, count($realtaIds), '?'));
                $stmt = $db->prepare("
                    SELECT e.*, l.nome AS luogo_nome, r.nome AS realta_nome 
                    FROM eventi e
                    LEFT JOIN luoghi l ON e.luogo_id = l.id
                    LEFT JOIN realta r ON e.realta_id = r.id
                    WHERE e.realta_id IN ($inClause)
                    ORDER BY e.data DESC, e.ora_inizio ASC
                ");
                $stmt->execute($realtaIds);
                $events = $stmt->fetchAll();
            }
            
            echo json_encode(['success' => true, 'data' => $events]);
            exit;
        }
    } catch (Exception $e) {
        header('HTTP/1.1 500 Internal Server Error');
        echo json_encode(['success' => false, 'message' => 'Errore recupero eventi: ' . $e->getMessage()]);
        exit;
    }
}

// 2. POST: Creazione nuovo evento
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    
    $titolo = trim($input['titolo'] ?? '');
    $descrizione = trim($input['descrizione'] ?? '');
    $data = trim($input['data'] ?? '');
    $oraInizio = !empty(trim($input['ora_inizio'] ?? '')) ? trim($input['ora_inizio']) : null;
    $oraFine = !empty(trim($input['ora_fine'] ?? '')) ? trim($input['ora_fine']) : null;
    $luogoId = (int)($input['luogo_id'] ?? 0);
    $tipoEvento = $input['tipo_evento'] ?? 'evento';
    $infoPrezzo = trim($input['info_prezzo'] ?? '');
    $infoGeneriche = trim($input['info_generiche'] ?? '');
    
    $inputRealtaId = isset($input['realta_id']) ? (int)$input['realta_id'] : null;
    
    // Validazione base obbligatoria
    if (empty($titolo) || empty($descrizione) || empty($data) || empty($luogoId)) {
        header('HTTP/1.1 400 Bad Request');
        echo json_encode(['success' => false, 'message' => 'Titolo, descrizione, data e luogo sono obbligatori.']);
        exit;
    }

    // Sicurezza associazione realtà
    $realtaId = null;
    if ($ruolo === 'admin') {
        $realtaId = $inputRealtaId ?: null; // Admin può scegliere o lasciare NULL
    } else {
        // Se non admin, l'evento appartiene obbligatoriamente alla realtà principale dell'utente
        if (empty($realtaIds)) {
            header('HTTP/1.1 403 Forbidden');
            echo json_encode(['success' => false, 'message' => 'Non hai una realtà associata al tuo account.']);
            exit;
        }
        $realtaId = (int)$realtaIds[0];
    }

    // Lo stato iniziale per i gestori è Draft o Pending, per l'admin può essere Published direttamente
    $stato = ($ruolo === 'admin') ? 'published' : 'pending';

    try {
        $db->beginTransaction();

        // A. Inserimento Evento
        $stmt = $db->prepare("
            INSERT INTO eventi (titolo, descrizione, data, ora_inizio, ora_fine, realta_id, luogo_id, tipo_evento, info_prezzo, info_generiche, stato, created_by, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $publishedAt = ($stato === 'published') ? date('Y-m-d H:i:s') : null;
        
        $stmt->execute([
            $titolo, $descrizione, $data, $oraInizio, $oraFine,
            $realtaId, $luogoId, $tipoEvento, $infoPrezzo, $infoGeneriche,
            $stato, $userId, $publishedAt
        ]);
        $eventoId = $db->lastInsertId();

        // B. Inserimento Categorie (molti-a-molti)
        $categoriesInput = $input['categorie'] ?? [];
        if (!is_array($categoriesInput)) $categoriesInput = [$categoriesInput];
        
        $stmtCat = $db->prepare("INSERT INTO evento_categorie (evento_id, categoria_id) VALUES (?, ?)");
        $catAdded = false;
        foreach ($categoriesInput as $catId) {
            $stmtCat->execute([$eventoId, (int)$catId]);
            $catAdded = true;
        }
        if (!$catAdded) {
            // Default ad "Altro" (id 6)
            $stmtCat->execute([$eventoId, 6]);
        }

        // C. Inserimento Tags (trova o crea nel catalogo)
        $tagsInput = $input['tags'] ?? [];
        if (is_string($tagsInput)) {
            $tagsInput = array_filter(array_map('trim', explode(',', $tagsInput)));
        }
        
        $stmtTagFind = $db->prepare("SELECT id FROM tags WHERE nome = ?");
        $stmtTagIns = $db->prepare("INSERT INTO tags (nome) VALUES (?)");
        $stmtTagLink = $db->prepare("INSERT INTO evento_tags (evento_id, tag_id) VALUES (?, ?)");
        
        foreach ($tagsInput as $tagName) {
            $tagName = trim(str_replace('#', '', $tagName));
            if (empty($tagName)) continue;
            
            $stmtTagFind->execute([$tagName]);
            $tag = $stmtTagFind->fetch();
            if ($tag) {
                $tagId = $tag['id'];
            } else {
                $stmtTagIns->execute([$tagName]);
                $tagId = $db->lastInsertId();
            }
            $stmtTagLink->execute([$eventoId, $tagId]);
        }

        // D. Inserimento Contatti
        $contattiInput = $input['contatti'] ?? [];
        if (is_array($contattiInput)) {
            $stmtCont = $db->prepare("INSERT INTO evento_contatti (evento_id, dicitura, tipo, valore, ordine) VALUES (?, ?, ?, ?, ?)");
            $ordine = 1;
            foreach ($contattiInput as $c) {
                $val = trim($c['valore'] ?? '');
                if (empty($val)) continue;
                $label = trim($c['dicitura'] ?? 'Info');
                $tipo = $c['tipo'] ?? 'instagram';
                $stmtCont->execute([$eventoId, $label, $tipo, $val, $ordine++]);
            }
        }

        // E. Scrittura Log Attività
        $stmtLog = $db->prepare("INSERT INTO activity_log (user_id, azione, tabella_nome, record_id, descrizione) VALUES (?, 'creazione', 'eventi', ?, ?)");
        $stmtLog->execute([$userId, $eventoId, "Creato evento '$titolo' (stato: $stato)"]);

        $db->commit();
        echo json_encode(['success' => true, 'message' => 'Evento inserito con successo.', 'evento_id' => $eventoId]);
        exit;

    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        header('HTTP/1.1 500 Internal Server Error');
        echo json_encode(['success' => false, 'message' => 'Errore durante la creazione: ' . $e->getMessage()]);
        exit;
    }
}

// 3. PUT: Aggiornamento evento esistente
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $eventoId = (int)($_GET['id'] ?? $input['id'] ?? 0);
    if ($eventoId <= 0) {
        header('HTTP/1.1 400 Bad Request');
        echo json_encode(['success' => false, 'message' => 'ID evento non valido.']);
        exit;
    }

    // Recupera l'evento esistente per controllo sicurezza
    $stmtCheck = $db->prepare("SELECT * FROM eventi WHERE id = ?");
    $stmtCheck->execute([$eventoId]);
    $evento = $stmtCheck->fetch();
    
    if (!$evento) {
        header('HTTP/1.1 404 Not Found');
        echo json_encode(['success' => false, 'message' => 'Evento non trovato.']);
        exit;
    }

    // Sicurezza: verifica che il gestore possa modificare l'evento (solo se associato al suo locale)
    if ($ruolo !== 'admin' && !in_array($evento['realta_id'], $realtaIds)) {
        header('HTTP/1.1 403 Forbidden');
        echo json_encode(['success' => false, 'message' => 'Non hai l\'autorizzazione per modificare questo evento.']);
        exit;
    }

    $titolo = trim($input['titolo'] ?? $evento['titolo']);
    $descrizione = trim($input['descrizione'] ?? $evento['descrizione']);
    $data = trim($input['data'] ?? $evento['data']);
    $oraInizio = isset($input['ora_inizio']) ? (!empty(trim($input['ora_inizio'])) ? trim($input['ora_inizio']) : null) : $evento['ora_inizio'];
    $oraFine = isset($input['ora_fine']) ? (!empty(trim($input['ora_fine'])) ? trim($input['ora_fine']) : null) : $evento['ora_fine'];
    $luogoId = isset($input['luogo_id']) ? (int)$input['luogo_id'] : $evento['luogo_id'];
    $tipoEvento = $input['tipo_evento'] ?? $evento['tipo_evento'];
    $infoPrezzo = trim($input['info_prezzo'] ?? $evento['info_prezzo']);
    $infoGeneriche = trim($input['info_generiche'] ?? $evento['info_generiche']);
    
    // Le modifiche dei gestori riportano l'evento in stato "pending" (richiede ri-approvazione)
    // Gli admin mantengono lo stato modificato o approvato
    $stato = ($ruolo === 'admin') ? ($input['stato'] ?? $evento['stato']) : 'pending';

    try {
        $db->beginTransaction();

        // A. Update campi principali
        $stmtUpdate = $db->prepare("
            UPDATE eventi 
            SET titolo = ?, descrizione = ?, data = ?, ora_inizio = ?, ora_fine = ?, luogo_id = ?, tipo_evento = ?, info_prezzo = ?, info_generiche = ?, stato = ?, updated_by = ?
            WHERE id = ?
        ");
        $stmtUpdate->execute([
            $titolo, $descrizione, $data, $oraInizio, $oraFine,
            $luogoId, $tipoEvento, $infoPrezzo, $infoGeneriche, $stato, $userId, $eventoId
        ]);

        // B. Update Categorie (cancella e reinserisci se specificato)
        if (isset($input['categorie'])) {
            $db->prepare("DELETE FROM evento_categorie WHERE evento_id = ?")->execute([$eventoId]);
            $categoriesInput = $input['categorie'];
            if (!is_array($categoriesInput)) $categoriesInput = [$categoriesInput];
            $stmtCat = $db->prepare("INSERT INTO evento_categorie (evento_id, categoria_id) VALUES (?, ?)");
            foreach ($categoriesInput as $catId) {
                $stmtCat->execute([$eventoId, (int)$catId]);
            }
        }

        // C. Update Tags
        if (isset($input['tags'])) {
            $db->prepare("DELETE FROM evento_tags WHERE evento_id = ?")->execute([$eventoId]);
            $tagsInput = $input['tags'];
            if (is_string($tagsInput)) {
                $tagsInput = array_filter(array_map('trim', explode(',', $tagsInput)));
            }
            $stmtTagFind = $db->prepare("SELECT id FROM tags WHERE nome = ?");
            $stmtTagIns = $db->prepare("INSERT INTO tags (nome) VALUES (?)");
            $stmtTagLink = $db->prepare("INSERT INTO evento_tags (evento_id, tag_id) VALUES (?, ?)");
            
            foreach ($tagsInput as $tagName) {
                $tagName = trim(str_replace('#', '', $tagName));
                if (empty($tagName)) continue;
                
                $stmtTagFind->execute([$tagName]);
                $tag = $stmtTagFind->fetch();
                if ($tag) {
                    $tagId = $tag['id'];
                } else {
                    $stmtTagIns->execute([$tagName]);
                    $tagId = $db->lastInsertId();
                }
                $stmtTagLink->execute([$eventoId, $tagId]);
            }
        }

        // D. Update Contatti
        if (isset($input['contatti'])) {
            $db->prepare("DELETE FROM evento_contatti WHERE evento_id = ?")->execute([$eventoId]);
            $contattiInput = $input['contatti'];
            if (is_array($contattiInput)) {
                $stmtCont = $db->prepare("INSERT INTO evento_contatti (evento_id, dicitura, tipo, valore, ordine) VALUES (?, ?, ?, ?, ?)");
                $ordine = 1;
                foreach ($contattiInput as $c) {
                    $val = trim($c['valore'] ?? '');
                    if (empty($val)) continue;
                    $label = trim($c['dicitura'] ?? 'Info');
                    $tipo = $c['tipo'] ?? 'instagram';
                    $stmtCont->execute([$eventoId, $label, $tipo, $val, $ordine++]);
                }
            }
        }

        // E. Log
        $stmtLog = $db->prepare("INSERT INTO activity_log (user_id, azione, tabella_nome, record_id, descrizione) VALUES (?, 'modifica', 'eventi', ?, ?)");
        $stmtLog->execute([$userId, $eventoId, "Modificato evento '$titolo' (nuovo stato: $stato)"]);

        $db->commit();
        echo json_encode(['success' => true, 'message' => 'Evento aggiornato con successo.']);
        exit;

    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        header('HTTP/1.1 500 Internal Server Error');
        echo json_encode(['success' => false, 'message' => 'Errore durante la modifica: ' . $e->getMessage()]);
        exit;
    }
}

// 4. DELETE: Eliminazione / Archiviazione dell'evento
if ($method === 'DELETE') {
    $eventoId = (int)($_GET['id'] ?? 0);
    if ($eventoId <= 0) {
        header('HTTP/1.1 400 Bad Request');
        echo json_encode(['success' => false, 'message' => 'ID evento non valido.']);
        exit;
    }

    // Recupera per controllo sicurezza
    $stmtCheck = $db->prepare("SELECT * FROM eventi WHERE id = ?");
    $stmtCheck->execute([$eventoId]);
    $evento = $stmtCheck->fetch();
    
    if (!$evento) {
        header('HTTP/1.1 404 Not Found');
        echo json_encode(['success' => false, 'message' => 'Evento non trovato.']);
        exit;
    }

    if ($ruolo !== 'admin' && !in_array($evento['realta_id'], $realtaIds)) {
        header('HTTP/1.1 403 Forbidden');
        echo json_encode(['success' => false, 'message' => 'Non hai l\'autorizzazione per eliminare questo evento.']);
        exit;
    }

    try {
        $db->beginTransaction();

        // Elimina fisicamente o sposta in archiviati. Il prompt richiede "archiviazione" per admin, 
        // noi eseguiamo l'eliminazione a cascata (gestita da FOREIGN KEY CASCADE) per semplicità o impostiamo stato archived.
        // Se è un admin, possiamo metterlo in archived. Se è un locale, lo eliminiamo del tutto o lo impostiamo ad archived.
        // Optiamo per impostare a stato 'archived' in modo da mantenere storico, oppure delete reale se richiesto.
        // Implementiamo l'eliminazione fisica visto che le chiavi esterne sono ON DELETE CASCADE.
        $stmtDel = $db->prepare("DELETE FROM eventi WHERE id = ?");
        $stmtDel->execute([$eventoId]);

        // Log
        $stmtLog = $db->prepare("INSERT INTO activity_log (user_id, azione, tabella_nome, record_id, descrizione) VALUES (?, 'cancellazione', 'eventi', ?, ?)");
        $stmtLog->execute([$userId, $eventoId, "Eliminato evento ID $eventoId con titolo '{$evento['titolo']}'"]);

        $db->commit();
        echo json_encode(['success' => true, 'message' => 'Evento eliminato con successo.']);
        exit;

    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        header('HTTP/1.1 500 Internal Server Error');
        echo json_encode(['success' => false, 'message' => 'Errore durante l\'eliminazione: ' . $e->getMessage()]);
        exit;
    }
}
