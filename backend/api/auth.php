<?php
/**
 * API di Autenticazione Utenti e Gestione Sessioni (Fômm Quell 2.0)
 * Gestisce: login, logout e controllo dello stato sessione corrente.
 */

// L'API viene usata dalla stessa origine del sito: non riflettere origini esterne.
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Configura sessione sicura
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Lax');
ini_set('session.cookie_secure', (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? '1' : '0');

session_start();

// Token usato dalle richieste che modificano dati della sessione corrente.
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

require_once __DIR__ . '/../config/db.php';

$action = $_GET['action'] ?? 'check';

$db = getDB();

if ($action === 'login') {
    // Ricevi dati POST (JSON o form urlencoded)
    $input = json_decode(file_get_contents('php://input'), true);
    $email = trim($input['email'] ?? $_POST['email'] ?? '');
    $password = trim($input['password'] ?? $_POST['password'] ?? '');

    if (empty($email) || empty($password)) {
        header('HTTP/1.1 400 Bad Request');
        echo json_encode(['success' => false, 'message' => 'Email e password sono obbligatorie.']);
        exit;
    }

    // Cerca l'utente nel database
    $stmt = $db->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        header('HTTP/1.1 401 Unauthorized');
        echo json_encode(['success' => false, 'message' => 'Credenziali non valide.']);
        exit;
    }

    if (!$user['attivo']) {
        header('HTTP/1.1 403 Forbidden');
        echo json_encode(['success' => false, 'message' => 'Questo account utente è stato disattivato dall\'amministratore.']);
        exit;
    }

    // Se è un gestore/operatore, verifica se le sue realtà collegate sono attive
    $realtaIds = [];
    $realtaNomi = [];
    
    $stmtRealta = $db->prepare("
        SELECT r.id, r.nome, r.attiva 
        FROM realta r
        INNER JOIN realta_users ru ON r.id = ru.realta_id
        WHERE ru.user_id = ?
    ");
    $stmtRealta->execute([$user['id']]);
    $realtaCollegate = $stmtRealta->fetchAll();

    if ($user['ruolo'] !== 'admin') {
        if (empty($realtaCollegate)) {
            header('HTTP/1.1 403 Forbidden');
            echo json_encode(['success' => false, 'message' => 'Nessun locale associato a questo account. Contatta l\'amministratore.']);
            exit;
        }

        // Verifica se almeno una realtà a cui appartiene è attiva
        $haRealtaAttiva = false;
        foreach ($realtaCollegate as $rc) {
            $realtaIds[] = (int)$rc['id'];
            $realtaNomi[] = $rc['nome'];
            if ($rc['attiva']) {
                $haRealtaAttiva = true;
            }
        }

        if (!$haRealtaAttiva) {
            header('HTTP/1.1 403 Forbidden');
            echo json_encode([
                'success' => false, 
                'message' => 'Il tuo locale è ancora in attesa di approvazione da parte di Fômm Quell.'
            ]);
            exit;
        }
    } else {
        // Gli admin non hanno bisogno di realtà collegate per loggarsi
        foreach ($realtaCollegate as $rc) {
            $realtaIds[] = (int)$rc['id'];
            $realtaNomi[] = $rc['nome'];
        }
    }

    // Autenticazione superata, inizializza sessione
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['nome'] = $user['nome'];
    $_SESSION['cognome'] = $user['cognome'];
    $_SESSION['email'] = $user['email'];
    $_SESSION['ruolo'] = $user['ruolo'];
    $_SESSION['realta_ids'] = $realtaIds;
    $_SESSION['realta_nomi'] = $realtaNomi;
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

    echo json_encode([
        'success' => true,
        'message' => 'Login eseguito con successo.',
        'user' => [
            'id' => $_SESSION['user_id'],
            'nome' => $_SESSION['nome'],
            'cognome' => $_SESSION['cognome'],
            'email' => $_SESSION['email'],
            'ruolo' => $_SESSION['ruolo'],
            'realta_ids' => $_SESSION['realta_ids'],
            'realta_nomi' => $_SESSION['realta_nomi']
        ],
        'csrf_token' => $_SESSION['csrf_token']
    ]);
    exit;

} elseif ($action === 'logout') {
    $csrfToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals($_SESSION['csrf_token'] ?? '', $csrfToken)) {
        header('HTTP/1.1 403 Forbidden');
        echo json_encode(['success' => false, 'message' => 'Richiesta non valida. Aggiorna la pagina e riprova.']);
        exit;
    }

    // Pulisci e distruggi sessione
    $_SESSION = [];
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    session_destroy();

    echo json_encode(['success' => true, 'message' => 'Logout eseguito con successo.']);
    exit;

} else {
    // Controllo stato sessione ('check')
    if (isset($_SESSION['user_id'])) {
        echo json_encode([
            'logged_in' => true,
            'user' => [
                'id' => $_SESSION['user_id'],
                'nome' => $_SESSION['nome'],
                'cognome' => $_SESSION['cognome'],
                'email' => $_SESSION['email'],
                'ruolo' => $_SESSION['ruolo'],
                'realta_ids' => $_SESSION['realta_ids'] ?? [],
                'realta_nomi' => $_SESSION['realta_nomi'] ?? []
            ],
            'csrf_token' => $_SESSION['csrf_token']
        ]);
    } else {
        echo json_encode(['logged_in' => false]);
    }
    exit;
}
