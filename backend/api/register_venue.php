<?php
/**
 * API per la Registrazione di Nuove Realtà (Fômm Quell 2.0)
 * Gestisce l'inserimento nel database di una realtà e del suo gestore di riferimento.
 * La realtà viene creata in stato disattivato (attiva = 0) in attesa di approvazione admin.
 */

// Configurazione CORS con supporto a sessioni/cookie
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: $origin");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config/db.php';

// Ricevi dati di registrazione
$input = json_decode(file_get_contents('php://input'), true);

$venueName = trim($input['nome_locale'] ?? $_POST['nome_locale'] ?? '');
$email = trim($input['email'] ?? $_POST['email'] ?? '');
$password = trim($input['password'] ?? $_POST['password'] ?? '');
$descrizione = trim($input['descrizione'] ?? $_POST['descrizione'] ?? '');
$tipologia = trim($input['tipologia'] ?? $_POST['tipologia'] ?? 'locale');
$telefono = trim($input['telefono'] ?? $_POST['telefono'] ?? '');
$instagram = trim($input['instagram'] ?? $_POST['instagram'] ?? '');
$activationCode = trim($input['activation_code'] ?? $_POST['activation_code'] ?? '');

// 1. Validazione dati obbligatori
if (empty($venueName) || empty($email) || empty($password) || empty($activationCode)) {
    header('HTTP/1.1 400 Bad Request');
    echo json_encode(['success' => false, 'message' => 'Tutti i campi obbligatori (*) devono essere compilati.']);
    exit;
}

// 2. Controllo codice attivazione amministratore
if ($activationCode !== 'FOMMQUELL2026') {
    header('HTTP/1.1 403 Forbidden');
    echo json_encode(['success' => false, 'message' => 'Codice di attivazione Fômm Quell non valido. Registrazione respinta.']);
    exit;
}

$db = getDB();

try {
    // 3. Verifica se l'email utente esiste già
    $stmtUser = $db->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
    $stmtUser->execute([$email]);
    if ($stmtUser->fetch()) {
        header('HTTP/1.1 409 Conflict');
        echo json_encode(['success' => false, 'message' => 'Questa email è già associata ad un utente registrato.']);
        exit;
    }

    // 4. Verifica se il nome del locale esiste già
    $stmtRealta = $db->prepare("SELECT id FROM realta WHERE nome = ? LIMIT 1");
    $stmtRealta->execute([$venueName]);
    if ($stmtRealta->fetch()) {
        header('HTTP/1.1 409 Conflict');
        echo json_encode(['success' => false, 'message' => 'Il nome di questo locale è già presente nel nostro database.']);
        exit;
    }

    // 5. Inizio transazione database per consistenza dati
    $db->beginTransaction();

    // A. Inserimento della Realtà (stato 'attiva = 0' in attesa di approvazione)
    $stmtInsRealta = $db->prepare("
        INSERT INTO realta (nome, descrizione, tipologia, email, telefono, instagram, attiva) 
        VALUES (?, ?, ?, ?, ?, ?, 0)
    ");
    $stmtInsRealta->execute([$venueName, $descrizione, $tipologia, $email, $telefono, $instagram]);
    $realtaId = $db->lastInsertId();

    // B. Inserimento dell'utente Gestore
    // Hashing sicuro della password
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    
    // Rileva nome e cognome dall'indirizzo email o imposta valori di default
    $nomePart = explode('@', $email)[0];
    $nomePart = ucwords(str_replace('.', ' ', $nomePart));
    
    $stmtInsUser = $db->prepare("
        INSERT INTO users (nome, cognome, email, password_hash, ruolo, attivo) 
        VALUES (?, 'Gestore', ?, ?, 'gestore', 1)
    ");
    $stmtInsUser->execute([$nomePart, $email, $passwordHash]);
    $userId = $db->lastInsertId();

    // C. Associazione utente-realtà come gestore principale
    $stmtLink = $db->prepare("
        INSERT INTO realta_users (realta_id, user_id, ruolo_realta) 
        VALUES (?, ?, 'gestore_principale')
    ");
    $stmtLink->execute([$realtaId, $userId]);

    // Commit transazione
    $db->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Richiesta di registrazione inviata con successo. Riceverai un email di conferma non appena lo staff di Fômm Quell avrà verificato e approvato il tuo locale!'
    ]);

} catch (Exception $e) {
    // In caso di errore, annulla tutte le modifiche
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    error_log("Registrazione fallita: " . $e->getMessage());
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode([
        'success' => false,
        'message' => 'Si è verificato un errore interno durante la registrazione. Riprova più tardi.'
    ]);
}
