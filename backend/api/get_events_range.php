<?php
/**
 * API Pubblica per recuperare eventi all'interno di un range di date (Fômm Quell 2.0)
 * Ideale per la visualizzazione settimanale della mappa e dell'agenda.
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config/db.php';
$db = getDB();

$startDate = $_GET['start'] ?? '';
$endDate = $_GET['end'] ?? '';
$mode = $_GET['mode'] ?? 'all'; // 'all', 'evento', 'cinema', 'teatro'

if (empty($startDate) || empty($endDate)) {
    header('HTTP/1.1 400 Bad Request');
    echo json_encode(['success' => false, 'message' => 'Parametri start e end obbligatori (formato YYYY-MM-DD).']);
    exit;
}

try {
    $query = "
        SELECT DISTINCT e.id, e.titolo, e.descrizione, e.data, e.ora_inizio, e.ora_fine, 
                        e.tipo_evento, e.info_prezzo, e.info_generiche,
                        l.nome AS luogo_nome, l.indirizzo AS luogo_indirizzo, l.latitudine, l.longitudine,
                        r.nome AS realta_nome, r.instagram AS realta_instagram
        FROM eventi e
        LEFT JOIN luoghi l ON e.luogo_id = l.id
        LEFT JOIN realta r ON e.realta_id = r.id
        LEFT JOIN evento_categorie ec ON e.id = ec.evento_id
        WHERE e.stato = 'published'
          AND e.data >= :start
          AND e.data <= :end
    ";

    $params = [
        ':start' => $startDate,
        ':end' => $endDate
    ];

    if ($mode !== 'all') {
        $query .= " AND e.tipo_evento = :mode";
        $params[':mode'] = $mode;
    }

    $query .= " ORDER BY e.data ASC, e.ora_inizio ASC";

    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $events = $stmt->fetchAll();

    // Recuperiamo categorie e contatti per ciascun evento
    $stmtCats = $db->prepare("
        SELECT c.id, c.nome, c.colore 
        FROM categorie c
        INNER JOIN evento_categorie ec ON c.id = ec.categoria_id
        WHERE ec.evento_id = ?
    ");

    $stmtContacts = $db->prepare("
        SELECT dicitura, tipo, valore, ordine 
        FROM evento_contatti 
        WHERE evento_id = ? 
        ORDER BY ordine ASC
    ");

    foreach ($events as &$ev) {
        $stmtCats->execute([$ev['id']]);
        $ev['categorie'] = $stmtCats->fetchAll();

        $stmtContacts->execute([$ev['id']]);
        $ev['contatti'] = $stmtContacts->fetchAll();
    }

    echo json_encode([
        'success' => true,
        'start' => $startDate,
        'end' => $endDate,
        'mode' => $mode,
        'data' => $events
    ]);

} catch (Exception $e) {
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode([
        'success' => false,
        'message' => 'Errore nel caricamento eventi per data range: ' . $e->getMessage()
    ]);
}
