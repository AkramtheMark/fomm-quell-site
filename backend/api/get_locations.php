<?php
/**
 * API per il recupero dei Luoghi fisici (Fômm Quell 2.0)
 * Restituisce la lista dei luoghi attivi per popolare select o campi di autocompilazione.
 */

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: $origin");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config/db.php';

$db = getDB();

try {
    $stmt = $db->query("SELECT id, nome, indirizzo, citta, latitudine, longitudine FROM luoghi WHERE attivo = 1 ORDER BY nome ASC");
    $luoghi = $stmt->fetchAll();
    
    echo json_encode([
        'success' => true,
        'data' => $luoghi
    ]);
} catch (Exception $e) {
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode([
        'success' => false,
        'message' => 'Errore nel caricamento dei luoghi: ' . $e->getMessage()
    ]);
}
