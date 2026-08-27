<?php
/**
 * Utility CLI script to generate bcrypt password hashes for seed.sql or manual database inserts
 * Usage: php generate_hash.php <password>
 */

if (php_sapi_name() !== 'cli') {
    die("Questo script può essere eseguito solo da riga di comando (CLI).\n");
}

if ($argc < 2) {
    echo "Uso: php generate_hash.php <password>\n";
    exit(1);
}

$password = $argv[1];
$hash = password_hash($password, PASSWORD_DEFAULT);

echo "\nPassword inserita: " . $password . "\n";
echo "Hash Bcrypt generato: " . $hash . "\n\n";
echo "Puoi inserire questo hash direttamente nella colonna `password_hash` della tabella `users`.\n";
