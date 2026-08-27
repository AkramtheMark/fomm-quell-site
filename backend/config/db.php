<?php
/**
 * Connessione al Database tramite PDO
 * Gestisce il caricamento dinamico delle credenziali locali ed in produzione (Aruba)
 */

function getDB() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $configPath = __DIR__ . '/config.json';
    
    // Configurazione di default per sviluppo locale su XAMPP
    $dbHost = 'localhost';
    $dbName = 'fomm_quell';
    $dbUser = 'root';
    $dbPass = '';
    $dbPort = '3306';

    // Caricamento credenziali dal file di configurazione se presente
    if (file_exists($configPath)) {
        $json = file_get_contents($configPath);
        $config = json_decode($json, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            $dbHost = $config['db_host'] ?? $dbHost;
            $dbName = $config['db_name'] ?? $dbName;
            $dbUser = $config['db_user'] ?? $dbUser;
            $dbPass = $config['db_pass'] ?? $dbPass;
            $dbPort = $config['db_port'] ?? $dbPort;
        }
    }

    $dsn = "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4";
    
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    try {
        $pdo = new PDO($dsn, $dbUser, $dbPass, $options);
        return $pdo;
    } catch (\PDOException $e) {
        // In produzione (Aruba) l'errore non deve rivelare le credenziali a schermo
        error_log("Database connection failure: " . $e->getMessage());
        header('HTTP/1.1 500 Internal Server Error');
        echo json_encode([
            'success' => false,
            'message' => 'Errore di connessione al database. Riprova più tardi.'
        ]);
        exit;
    }
}
