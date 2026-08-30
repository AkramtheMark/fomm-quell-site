<?php
/** Restituisce le categorie attive disponibili per gli eventi. */
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../config/db.php';

try {
    $stmt = getDB()->query('SELECT id, nome, colore, icona FROM categorie WHERE attiva = 1 ORDER BY nome ASC');
    echo json_encode(['success' => true, 'data' => $stmt->fetchAll()]);
} catch (Exception $e) {
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode(['success' => false, 'message' => 'Impossibile caricare le categorie.']);
}
