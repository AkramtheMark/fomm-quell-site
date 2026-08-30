<?php
/**
 * Script di Migrazione dati da Google Sheets a database MySQL Fômm Quell 2.0.
 * Eseguibile esclusivamente da riga di comando (CLI).
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Questo script puo essere eseguito soltanto dalla riga di comando.');
}

require_once __DIR__ . '/../config/db.php';

$googleSheetCsvUrl = 'https://docs.google.com/spreadsheets/d/1jbfVbD7aE-KMvggHzAKLUE90oHCimOfAz4faFMhVAUU/export?format=csv&gid=0';

echo "=== FOMM QUELL 2.0: INIZIO MIGRAZIONE DA GOOGLE SHEETS ===\n";
echo "Scaricamento dati in corso da: " . $googleSheetCsvUrl . "\n";

// Scarica il file CSV
$csvData = file_get_contents($googleSheetCsvUrl);
if ($csvData === false) {
    die("Errore: Impossibile scaricare il CSV da Google Sheets.\n");
}

echo "Scaricamento completato. Dimensione file: " . strlen($csvData) . " byte.\n";

// Usa un file temporaneo e fgetcsv: le descrizioni del foglio possono contenere ritorni a capo.
$csvHandle = fopen('php://temp', 'r+');
fwrite($csvHandle, $csvData);
rewind($csvHandle);
$rows = [];
while (($csvRow = fgetcsv($csvHandle)) !== false) {
    $rows[] = $csvRow;
}
fclose($csvHandle);
if (count($rows) < 2) {
    die("Errore: Il file CSV scaricato è vuoto o non valido.\n");
}

// 2. Lettura e mappatura intestazioni (Riga 0)
$headers = $rows[0];
$headers = array_map(function($h) { return trim(strtolower($h)); }, $headers);

function getColIdx($headers, $name, $fallback) {
    $idx = array_search(strtolower($name), $headers);
    return ($idx !== false) ? $idx : $fallback;
}

$idxChecked = getColIdx($headers, 'checked', 0);
$idxDate = getColIdx($headers, 'date', 1);
$idxStartTime = getColIdx($headers, 'startTime', 2);
$idxEndTime = getColIdx($headers, 'endTime', 3);
$idxTitle = getColIdx($headers, 'title', 4);
$idxDesc = getColIdx($headers, 'description', 5);
$idxPrice = getColIdx($headers, 'priceInfo', 6);
$idxInfo = getColIdx($headers, 'generalInfo', 7);
$idxContactLabel = getColIdx($headers, 'contactLabel', 8);
$idxContact1 = getColIdx($headers, 'contact1', 9);
$idxContact2 = getColIdx($headers, 'contact2', 10);
$idxContact3 = getColIdx($headers, 'contact3', 11);
$idxVenue = getColIdx($headers, 'venue', 12);
$idxLocation = getColIdx($headers, 'location', 14);
$idxVenueTag = getColIdx($headers, 'venueTag', 15);
$idxTags = getColIdx($headers, 'tags', 13);
$idxOtherTags = getColIdx($headers, 'otherTags', 16);
$idxMusic = getColIdx($headers, 'typeMusic', 17);
$idxCulture = getColIdx($headers, 'typeCulture', 18);
$idxShow = getColIdx($headers, 'typeShow', 19);
$idxArt = getColIdx($headers, 'typeArt', 20);
$idxWorkshop = getColIdx($headers, 'typeWorkshop', 21);
$idxOperator = getColIdx($headers, 'operator', 24);
$idxTimestamp = getColIdx($headers, 'timestamp', 26);

echo "Intestazioni CSV mappate con successo.\n";

$db = getDB();

// Contatori del report
$stats = [
    'parsed_rows' => 0,
    'imported_events' => 0,
    'skipped_events' => 0,
    'created_realta' => 0,
    'created_luoghi' => 0,
    'created_users' => 0,
    'errors' => []
];

// Helper per coordinate geografiche predefinite dei punti caldi in centro storico
$knownCoords = [
    'prampolini' => ['lat' => 44.69820000, 'lng' => 10.63000000],
    'fontanesi' => ['lat' => 44.69610000, 'lng' => 10.63180000],
    'valli' => ['lat' => 44.70010000, 'lng' => 10.63050000],
    'san pietro' => ['lat' => 44.69780000, 'lng' => 10.63600000],
    'san prospero' => ['lat' => 44.69750000, 'lng' => 10.63130000]
];

// Mappa categorie dal nome a ID db
$categoriesMap = [
    'Musica' => 1,
    'Cultura' => 2,
    'Spettacolo' => 3,
    'Arte' => 4,
    'Laboratorio' => 5,
    'Altro' => 6
];

// Helper per validare e ripulire gli orari (es. rimuove ~ o converte punti in due punti)
function cleanTimeStr($timeStr, &$infoGeneriche) {
    if (empty($timeStr)) return null;

    $original = trim($timeStr);

    // Sostituisce punti con due punti e rimuove caratteri estranei
    $cleaned = str_replace('.', ':', $original);
    $cleaned = preg_replace('/[^0-9:]/', '', $cleaned);
    $cleaned = trim($cleaned);

    if (preg_match('/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/', $cleaned)) {
        $parts = explode(':', $cleaned);
        $hours = intval($parts[0]);
        $minutes = intval($parts[1]);
        $seconds = isset($parts[2]) ? intval($parts[2]) : 0;
        return sprintf("%02d:%02d:%02d", $hours, $minutes, $seconds);
    } else {
        // Se è testo generico, lo accoda alle informazioni dell'evento
        if (strlen($original) > 2) {
            if ($infoGeneriche === null || $infoGeneriche === '') {
                $infoGeneriche = $original;
            } else {
                $infoGeneriche .= " | " . $original;
            }
        }
        return null;
    }
}

// 3. Processo di migrazione riga per riga (saltando le prime 3 righe come in app.js)
for ($i = 3; $i < count($rows); $i++) {
    $row = $rows[$i];
    if (empty(array_filter($row, static function ($value) { return trim((string)$value) !== ''; }))) continue;
    if (count($row) < 5) continue; // Salta righe vuote o incomplete

    $stats['parsed_rows']++;

    $title = trim($row[$idxTitle] ?? '');
    $dateStr = trim($row[$idxDate] ?? '');
    
    if (empty($title) || empty($dateStr)) {
        continue; // Eventi non validi
    }

    // A. Formattazione data YYYY-MM-DD
    $dateParts = explode('/', $dateStr);
    if (count($dateParts) === 3) {
        $formattedDate = "{$dateParts[2]}-{$dateParts[1]}-{$dateParts[0]}";
    } else {
        $formattedDate = date('Y-m-d', strtotime($dateStr));
    }

    // B. Formattazione orari
    $rowStartTime = trim($row[$idxStartTime] ?? '');
    $rowEndTime = trim($row[$idxEndTime] ?? '');

    $infoGeneriche = !empty(trim($row[$idxInfo] ?? '')) ? trim($row[$idxInfo]) : null;

    $startTime = cleanTimeStr($rowStartTime, $infoGeneriche);
    $endTime = cleanTimeStr($rowEndTime, $infoGeneriche);

    // C. Gestione Realtà (Locale)
    $venueName = trim($row[$idxVenue] ?? '');
    $realtaId = null;
    if (!empty($venueName)) {
        // Verifica se la realtà esiste già nel database
        $stmt = $db->prepare("SELECT id FROM realta WHERE nome = ?");
        $stmt->execute([$venueName]);
        $realta = $stmt->fetch();
        if ($realta) {
            $realtaId = $realta['id'];
        } else {
            // Crea nuova realtà
            $venueTag = trim($row[$idxVenueTag] ?? '');
            $instagram = '';
            if (!empty($venueTag)) {
                $instagram = str_replace('@', '', $venueTag);
            }
            try {
                $ins = $db->prepare("INSERT INTO realta (nome, tipologia, instagram, attiva) VALUES (?, 'locale', ?, 1)");
                $ins->execute([$venueName, $instagram]);
                $realtaId = $db->lastInsertId();
                $stats['created_realta']++;
            } catch (Exception $e) {
                $stats['errors'][] = "Riga $i: Errore creazione realtà '$venueName': " . $e->getMessage();
            }
        }
    }

    // D. Gestione Luoghi fisici
    $locationName = trim($row[$idxLocation] ?? '');
    $fullPlaceName = !empty($venueName) ? $venueName : $locationName;
    $luogoId = null;

    if (empty($fullPlaceName)) {
        $fullPlaceName = "Reggio Emilia";
    }

    // Cerca o crea il luogo
    $stmt = $db->prepare("SELECT id FROM luoghi WHERE nome = ?");
    $stmt->execute([$fullPlaceName]);
    $luogo = $stmt->fetch();
    if ($luogo) {
        $luogoId = $luogo['id'];
    } else {
        // Identifica coordinate geografiche basate sul nome
        $lat = 44.69820000; // default Reggio Emilia
        $lng = 10.63000000;
        
        $searchName = strtolower($fullPlaceName);
        foreach ($knownCoords as $key => $coords) {
            if (strpos($searchName, $key) !== false) {
                $lat = $coords['lat'];
                $lng = $coords['lng'];
                break;
            }
        }

        try {
            $ins = $db->prepare("INSERT INTO luoghi (nome, indirizzo, citta, latitudine, longitudine, attivo) VALUES (?, ?, ?, ?, ?, 1)");
            $ins->execute([$fullPlaceName, $fullPlaceName, $locationName ?: 'Reggio Emilia', $lat, $lng]);
            $luogoId = $db->lastInsertId();
            $stats['created_luoghi']++;
        } catch (Exception $e) {
            $stats['errors'][] = "Riga $i: Errore creazione luogo '$fullPlaceName': " . $e->getMessage();
            continue; // Se non possiamo associare un luogo, saltiamo l'evento
        }
    }

    // E. Gestione Utente (Operatore)
    $operatorName = trim($row[$idxOperator] ?? '');
    $userId = 1; // Default Admin
    if (!empty($operatorName)) {
        $stmt = $db->prepare("SELECT id FROM users WHERE nome = ?");
        $stmt->execute([$operatorName]);
        $user = $stmt->fetch();
        if ($user) {
            $userId = $user['id'];
        } else {
            // Gli operatori importati non ricevono una password: un amministratore dovrà
            // invitarli/attivarli prima di consentire l'accesso.
            $email = strtolower(str_replace(' ', '', $operatorName)) . "@fommquell.it";
            $pwdHash = password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);
            try {
                $ins = $db->prepare("INSERT INTO users (nome, cognome, email, password_hash, ruolo, attivo) VALUES (?, 'Operatore', ?, ?, 'operatore', 1)");
                $ins->execute([$operatorName, $email, $pwdHash]);
                $userId = $db->lastInsertId();
                $stats['created_users']++;
            } catch (Exception $e) {
                // Se fallisce l'email univoca, usa l'admin come fallback
                $userId = 1;
            }
        }
    }

    // F. Verifica Duplicato Evento (titolo + data + luogo_id)
    $stmt = $db->prepare("SELECT id FROM eventi WHERE titolo = ? AND data = ? AND luogo_id = ?");
    $stmt->execute([$title, $formattedDate, $luogoId]);
    if ($stmt->fetch()) {
        $stats['skipped_events']++;
        continue; // Già presente nel database, salta per evitare duplicati
    }

    // G. Mappatura dello Stato
    $checked = strtoupper(trim($row[$idxChecked] ?? ''));
    $stato = 'pending';
    if ($checked === 'OK' || $checked === 'FQ') {
        $stato = 'published';
    } elseif ($checked === 'NO') {
        $stato = 'rejected';
    }

    // H. Inserimento dell'Evento
    $description = trim($row[$idxDesc] ?? 'Nessuna descrizione fornita.');
    $priceInfo = trim($row[$idxPrice] ?? '');
    
    // Rileva tipo di evento
    $tipoEvento = 'evento'; // Default
    
    try {
        $ins = $db->prepare("
            INSERT INTO eventi (titolo, descrizione, data, ora_inizio, ora_fine, realta_id, luogo_id, tipo_evento, info_prezzo, info_generiche, stato, created_by, published_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $publishedAt = ($stato === 'published') ? date('Y-m-d H:i:s') : null;

        $ins->execute([
            $title, $description, $formattedDate, $startTime, $endTime,
            $realtaId, $luogoId, $tipoEvento, $priceInfo, $infoGeneriche,
            $stato, $userId, $publishedAt
        ]);

        $eventoId = $db->lastInsertId();
        $stats['imported_events']++;

        // I. Mappatura Categorie
        $isMusic = strtoupper(trim($row[$idxMusic] ?? '')) === 'TRUE';
        $isCulture = strtoupper(trim($row[$idxCulture] ?? '')) === 'TRUE';
        $isShow = strtoupper(trim($row[$idxShow] ?? '')) === 'TRUE';
        $isArt = strtoupper(trim($row[$idxArt] ?? '')) === 'TRUE';
        $isWorkshop = strtoupper(trim($row[$idxWorkshop] ?? '')) === 'TRUE';

        $catInserted = false;
        $insCat = $db->prepare("INSERT INTO evento_categorie (evento_id, categoria_id) VALUES (?, ?)");
        
        if ($isMusic) { $insCat->execute([$eventoId, 1]); $catInserted = true; }
        if ($isCulture) { $insCat->execute([$eventoId, 2]); $catInserted = true; }
        if ($isShow) { $insCat->execute([$eventoId, 3]); $catInserted = true; }
        if ($isArt) { $insCat->execute([$eventoId, 4]); $catInserted = true; }
        if ($isWorkshop) { $insCat->execute([$eventoId, 5]); $catInserted = true; }

        if (!$catInserted) {
            // Assegna "Altro" se non ci sono categorie specificate
            $insCat->execute([$eventoId, 6]);
        }

        // J. Mappatura Contatti
        $contactLabel = trim($row[$idxContactLabel] ?? 'Info');
        $contacts = [
            trim($row[$idxContact1] ?? ''),
            trim($row[$idxContact2] ?? ''),
            trim($row[$idxContact3] ?? '')
        ];

        $insContact = $db->prepare("INSERT INTO evento_contatti (evento_id, dicitura, tipo, valore, ordine) VALUES (?, ?, ?, ?, ?)");
        $ordine = 1;
        foreach ($contacts as $contactValue) {
            if (empty($contactValue)) continue;
            
            // Riconoscimento del tipo di contatto
            $tipo = 'instagram';
            if (strpos($contactValue, '@') !== false && strpos($contactValue, '.') !== false) {
                $tipo = 'email';
            } elseif (strpos($contactValue, 'http') !== false) {
                $tipo = 'sito';
            } elseif (preg_match('/^[0-9+\s\-()]{7,20}$/', $contactValue)) {
                $tipo = 'cellulare';
            }

            $insContact->execute([$eventoId, $contactLabel, $tipo, $contactValue, $ordine++]);
        }

        // K. Mappatura Tags
        $tagsString = trim($row[$idxTags] ?? '') . ',' . trim($row[$idxOtherTags] ?? '');
        $rawTags = array_filter(array_map('trim', explode(',', $tagsString)));
        
        $insTagRelation = $db->prepare("INSERT INTO evento_tags (evento_id, tag_id) VALUES (?, ?)");
        
        foreach ($rawTags as $tagName) {
            if (empty($tagName)) continue;
            if (strpos($tagName, '#') === 0) $tagName = substr($tagName, 1);
            
            // Trova o crea il tag
            $stmtTag = $db->prepare("SELECT id FROM tags WHERE nome = ?");
            $stmtTag->execute([$tagName]);
            $tagObj = $stmtTag->fetch();
            $tagId = null;
            
            if ($tagObj) {
                $tagId = $tagObj['id'];
            } else {
                try {
                    $insTag = $db->prepare("INSERT INTO tags (nome) VALUES (?)");
                    $insTag->execute([$tagName]);
                    $tagId = $db->lastInsertId();
                } catch (Exception $e) {
                    // Ignora in caso di collisioni concorrenti
                }
            }

            if ($tagId) {
                try {
                    $insTagRelation->execute([$eventoId, $tagId]);
                } catch (Exception $e) {
                    // Ignora se la relazione esiste già
                }
            }
        }

    } catch (Exception $e) {
        $stats['errors'][] = "Riga $i: Errore inserimento evento '$title': " . $e->getMessage();
    }
}

echo "\n=== REPORT DI MIGRAZIONE COMPLETATO ===\n";
echo "Righe CSV elaborate: " . $stats['parsed_rows'] . "\n";
echo "Eventi importati: " . $stats['imported_events'] . "\n";
echo "Eventi saltati (duplicati): " . $stats['skipped_events'] . "\n";
echo "Nuove realtà create: " . $stats['created_realta'] . "\n";
echo "Nuovi luoghi creati: " . $stats['created_luoghi'] . "\n";
echo "Nuovi utenti creati: " . $stats['created_users'] . "\n";

if (count($stats['errors']) > 0) {
    echo "\nErrori riscontrati (" . count($stats['errors']) . "):\n";
    foreach ($stats['errors'] as $error) {
        echo " - " . $error . "\n";
    }
} else {
    echo "\nNessun errore riscontrato durante la migrazione.\n";
}
echo "========================================\n";
