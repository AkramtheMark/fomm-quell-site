<?php
/** Punti della mappa delle realtà attive, dedotti dai luoghi dei loro eventi. */
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

try {
    $stmt = getDB()->query("SELECT r.id, r.nome, r.tipologia, r.instagram, r.sito_web,
        l.nome AS luogo_nome, l.indirizzo, l.citta, l.latitudine, l.longitudine,
        COUNT(DISTINCT e.id) AS eventi_pubblicati
        FROM realta r
        INNER JOIN eventi e ON e.realta_id = r.id AND e.stato = 'published'
        INNER JOIN luoghi l ON l.id = e.luogo_id AND l.attivo = 1
        WHERE r.attiva = 1
        GROUP BY r.id, l.id
        ORDER BY r.nome, l.nome");
    echo json_encode(['success' => true, 'data' => $stmt->fetchAll()]);
} catch (Exception $e) {
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode(['success' => false, 'message' => 'Impossibile caricare la mappa delle realtà.']);
}
