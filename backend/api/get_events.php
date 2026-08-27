<?php
/**
 * API Pubblica per la consultazione degli Eventi (Fômm Quell 2.0)
 * Consente di recuperare gli eventi pubblicati filtrati per anno, mese, modalità (evento, cinema, teatro) e categoria.
 */

// Configurazione CORS pubblica per consultazione
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config/db.php';
$db = getDB();

$year = isset($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
$month = isset($_GET['month']) ? (int)$_GET['month'] : (int)date('m');
$day = isset($_GET['day']) ? (int)$_GET['day'] : null;
$mode = $_GET['mode'] ?? 'evento'; // 'evento', 'cinema', 'teatro'
$categoryId = isset($_GET['category_id']) ? (int)$_GET['category_id'] : null;

try {
    // Costruisci query di base
    $query = "
        SELECT DISTINCT e.id, e.titolo, e.descrizione, e.data, e.ora_inizio, e.ora_fine, 
                        e.tipo_evento, e.info_prezzo, e.info_generiche,
                        l.nome AS luogo_nome, l.indirizzo AS luogo_indirizzo,
                        r.nome AS realta_nome
        FROM eventi e
        LEFT JOIN luoghi l ON e.luogo_id = l.id
        LEFT JOIN realta r ON e.realta_id = r.id
        LEFT JOIN evento_categorie ec ON e.id = ec.evento_id
        WHERE e.stato = 'published'
          AND YEAR(e.data) = :year
          AND MONTH(e.data) = :month
    ";

    $params = [
        ':year' => $year,
        ':month' => $month
    ];

    if ($day !== null) {
        $query .= " AND DAY(e.data) = :day";
        $params[':day'] = $day;
    }

    $query .= " AND e.tipo_evento = :mode";
    $params[':mode'] = $mode;

    if ($categoryId) {
        $query .= " AND ec.categoria_id = :category_id";
        $params[':category_id'] = $categoryId;
    }

    $query .= " ORDER BY e.data ASC, e.ora_inizio ASC";

    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $events = $stmt->fetchAll();

    // Per ogni evento, recuperiamo l'elenco delle categorie collegate (con i colori relativi per il calendario)
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
        'year' => $year,
        'month' => $month,
        'mode' => $mode,
        'data' => $events
    ]);

} catch (Exception $e) {
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode([
        'success' => false,
        'message' => 'Errore nel caricamento eventi: ' . $e->getMessage()
    ]);
}
