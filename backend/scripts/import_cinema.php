<?php
/**
 * Importer per la programmazione cinematografica (Fômm Quell 2.0)
 * Legge il file JSON generato dallo scraper Python ed importa film e proiezioni nel database MySQL.
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Questo script puo essere eseguito soltanto dalla riga di comando.');
}

require_once __DIR__ . '/../config/db.php';

$jsonPath = __DIR__ . '/../../assets/cinema_events.json';

echo "=== FOMM QUELL 2.0: IMPORTATORE CINEMA ===\n";
echo "Lettura file JSON da: " . $jsonPath . "\n";

if (!file_exists($jsonPath)) {
    die("Errore: Il file JSON 'assets/cinema_events.json' non esiste. Avvia prima lo scraper Python.\n");
}

$jsonData = file_get_contents($jsonPath);
$screenings = json_decode($jsonData, true);

if (!is_array($screenings)) {
    die("Errore: Formato file JSON non valido.\n");
}

echo "Trovate " . count($screenings) . " proiezioni nel file.\n";

$db = getDB();

$stats = [
    'parsed' => 0,
    'new_realta' => 0,
    'new_luoghi' => 0,
    'new_films' => 0,
    'new_projections' => 0,
    'duplicates_skipped' => 0,
    'errors' => []
];

foreach ($screenings as $scr) {
    $stats['parsed']++;

    $title = trim($scr['title'] ?? '');
    $dateStr = trim($scr['date'] ?? '');
    $timeStr = trim($scr['time'] ?? '');
    $locationRaw = trim($scr['location'] ?? '');
    $link = trim($scr['link'] ?? '');
    $lat = isset($scr['latitude']) ? (float)$scr['latitude'] : 44.69820000;
    $lng = isset($scr['longitude']) ? (float)$scr['longitude'] : 10.63000000;
    $img = trim($scr['img'] ?? '');
    $desc = trim($scr['desc'] ?? 'Proiezione cinematografica.');

    if (empty($title) || empty($dateStr) || empty($locationRaw)) {
        $stats['errors'][] = "Record " . $stats['parsed'] . ": Dati incompleti.";
        continue;
    }

    // A. Pulisce il nome del cinema (es. "Al Corso (Reggio Emilia)" -> "Al Corso")
    $cinemaName = trim(preg_replace('/\s*\(.*?\)/', '', $locationRaw));

    // B. Formatta la data da DD/MM/YYYY a YYYY-MM-DD
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

        // 1. Cerca o crea la Realtà (il Cinema)
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
            $stats['new_realta']++;
        }

        // 2. Cerca o crea il Luogo fisico
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
            $stats['new_luoghi']++;
        }

        // 3. Cerca o crea il Film nel Catalogo
        $stmtFilm = $db->prepare("SELECT id FROM cinema_film WHERE titolo = ? LIMIT 1");
        $stmtFilm->execute([$title]);
        $film = $stmtFilm->fetch();
        $filmId = null;

        if ($film) {
            $filmId = $film['id'];
            // Aggiorna l'url della locandina o descrizione se prima mancavano
            if (!empty($img)) {
                $db->prepare("UPDATE cinema_film SET locandina = ? WHERE id = ?")->execute([$img, $filmId]);
            }
        } else {
            $insFilm = $db->prepare("INSERT INTO cinema_film (titolo, descrizione, locandina) VALUES (?, ?, ?)");
            $insFilm->execute([$title, $desc, $img]);
            $filmId = $db->lastInsertId();
            $stats['new_films']++;
        }

        // 4. Verifica se la proiezione specifica esiste già (evento con stesso film, data, ora e luogo)
        $stmtCheck = $db->prepare("
            SELECT e.id FROM eventi e
            INNER JOIN evento_cinema ec ON e.id = ec.evento_id
            WHERE ec.cinema_film_id = ? AND e.data = ? AND (e.ora_inizio = ? OR (e.ora_inizio IS NULL AND ? IS NULL)) AND e.luogo_id = ?
        ");
        $stmtCheck->execute([$filmId, $formattedDate, $timeVal, $timeVal, $luogoId]);
        if ($stmtCheck->fetch()) {
            $db->rollBack();
            $stats['duplicates_skipped']++;
            continue; // Già importato
        }

        // 5. Inserimento dell'evento
        $insEvento = $db->prepare("
            INSERT INTO eventi (titolo, descrizione, data, ora_inizio, realta_id, luogo_id, tipo_evento, stato, created_by, published_at, info_generiche)
            VALUES (?, ?, ?, ?, ?, ?, 'cinema', 'published', 1, CURRENT_TIMESTAMP, ?)
        ");
        $insEvento->execute([
            $title, $desc, $formattedDate, $timeVal, $realtaId, $luogoId, $infoGeneriche
        ]);
        $eventoId = $db->lastInsertId();

        // 6. Collega alla categoria "Spettacolo" (id 3, neon ciano)
        $db->prepare("INSERT INTO evento_categorie (evento_id, categoria_id) VALUES (?, 3)")->execute([$eventoId]);

        // 7. Collega all'evento_cinema (Proiezioni)
        $insProj = $db->prepare("
            INSERT INTO evento_cinema (evento_id, cinema_film_id, ticket_url)
            VALUES (?, ?, ?)
        ");
        $insProj->execute([$eventoId, $filmId, $link]);

        $db->commit();
        $stats['new_projections']++;

    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        $stats['errors'][] = "Errore durante l'importazione di '{$title}': " . $e->getMessage();
    }
}

echo "\n=== REPORT IMPORTAZIONE COMPLETATO ===\n";
echo "Proiezioni elaborate: " . $stats['parsed'] . "\n";
echo "Nuove realtà create: " . $stats['new_realta'] . "\n";
echo "Nuovi luoghi creati: " . $stats['new_luoghi'] . "\n";
echo "Nuovi film nel catalogo: " . $stats['new_films'] . "\n";
echo "Nuove proiezioni inserite: " . $stats['new_projections'] . "\n";
echo "Proiezioni duplicate saltate: " . $stats['duplicates_skipped'] . "\n";

if (count($stats['errors']) > 0) {
    echo "\nErrori riscontrati (" . count($stats['errors']) . "):\n";
    foreach ($stats['errors'] as $error) {
        echo " - " . $error . "\n";
    }
} else {
    echo "\nNessun errore riscontrato durante la sincronizzazione.\n";
}
echo "======================================\n";
