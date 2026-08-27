-- Schema del database Fômm Quell 2.0
-- Compatibile con MySQL 5.7+ e MariaDB 10.2+ (ambiente XAMPP e hosting Aruba)

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `activity_log`;
DROP TABLE IF EXISTS `realta_collaborazioni`;
DROP TABLE IF EXISTS `evento_teatro`;
DROP TABLE IF EXISTS `spettacoli_teatro`;
DROP TABLE IF EXISTS `evento_cinema`;
DROP TABLE IF EXISTS `cinema_film`;
DROP TABLE IF EXISTS `evento_contatti`;
DROP TABLE IF EXISTS `evento_tags`;
DROP TABLE IF EXISTS `tags`;
DROP TABLE IF EXISTS `evento_categorie`;
DROP TABLE IF EXISTS `categorie`;
DROP TABLE IF EXISTS `eventi`;
DROP TABLE IF EXISTS `luoghi`;
DROP TABLE IF EXISTS `realta_users`;
DROP TABLE IF EXISTS `realta`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Tabella UTENTI
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nome` VARCHAR(50) NOT NULL,
  `cognome` VARCHAR(50) NOT NULL,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `ruolo` ENUM('admin', 'gestore', 'operatore') NOT NULL DEFAULT 'operatore',
  `attivo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabella REALTÀ (locali, circoli, associazioni, ecc.)
CREATE TABLE `realta` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nome` VARCHAR(100) NOT NULL UNIQUE,
  `descrizione` TEXT,
  `tipologia` VARCHAR(50) NOT NULL DEFAULT 'locale', -- associazione, circolo, locale, teatro, cinema, ecc.
  `email` VARCHAR(100),
  `telefono` VARCHAR(30),
  `sito_web` VARCHAR(255),
  `instagram` VARCHAR(100),
  `facebook` VARCHAR(100),
  `attiva` TINYINT(1) NOT NULL DEFAULT 0, -- Richiede approvazione admin iniziale
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabella Relazione molti-a-molti REALTÀ - UTENTI
CREATE TABLE `realta_users` (
  `realta_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `ruolo_realta` ENUM('gestore_principale', 'collaboratore') NOT NULL DEFAULT 'collaboratore',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`realta_id`, `user_id`),
  FOREIGN KEY (`realta_id`) REFERENCES `realta` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabella LUOGHI (spazi fisici in cui si tengono gli eventi)
CREATE TABLE `luoghi` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nome` VARCHAR(100) NOT NULL UNIQUE,
  `indirizzo` VARCHAR(255) NOT NULL,
  `citta` VARCHAR(100) NOT NULL DEFAULT 'Reggio Emilia',
  `provincia` VARCHAR(10) NOT NULL DEFAULT 'RE',
  `cap` VARCHAR(10),
  `latitudine` DECIMAL(10, 8) NOT NULL,
  `longitudine` DECIMAL(11, 8) NOT NULL,
  `descrizione` TEXT,
  `attivo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabella EVENTI
CREATE TABLE `eventi` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `titolo` VARCHAR(150) NOT NULL,
  `descrizione` TEXT NOT NULL,
  `data` DATE NOT NULL,
  `ora_inizio` TIME,
  `ora_fine` TIME,
  `realta_id` INT, -- Può essere NULL per eventi inseriti direttamente da admin non associati ad una singola realtà partner
  `luogo_id` INT NOT NULL,
  `tipo_evento` ENUM('evento', 'cinema', 'teatro') NOT NULL DEFAULT 'evento',
  `info_prezzo` VARCHAR(255),
  `info_generiche` VARCHAR(255),
  `stato` ENUM('draft', 'pending', 'approved', 'rejected', 'published', 'archived') NOT NULL DEFAULT 'draft',
  `motivo_rifiuto` TEXT, -- Per archiviare motivazioni di rifiuto admin
  `created_by` INT,
  `updated_by` INT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `published_at` TIMESTAMP NULL,
  FOREIGN KEY (`realta_id`) REFERENCES `realta` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`luogo_id`) REFERENCES `luoghi` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabella CATEGORIE (Musica, Cultura, ecc.)
CREATE TABLE `categorie` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nome` VARCHAR(50) NOT NULL UNIQUE,
  `colore` VARCHAR(20) NOT NULL, -- Colore esadecimale per pallini del calendario
  `icona` VARCHAR(20),
  `attiva` TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Tabella molti-a-molti EVENTI - CATEGORIE (Un evento può appartenere a più categorie)
CREATE TABLE `evento_categorie` (
  `evento_id` INT NOT NULL,
  `categoria_id` INT NOT NULL,
  PRIMARY KEY (`evento_id`, `categoria_id`),
  FOREIGN KEY (`evento_id`) REFERENCES `eventi` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`categoria_id`) REFERENCES `categorie` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Tabella TAGS
CREATE TABLE `tags` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nome` VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Tabella molti-a-molti EVENTI - TAGS
CREATE TABLE `evento_tags` (
  `evento_id` INT NOT NULL,
  `tag_id` INT NOT NULL,
  PRIMARY KEY (`evento_id`, `tag_id`),
  FOREIGN KEY (`evento_id`) REFERENCES `eventi` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Tabella CONTATTI EVENTO (struttura flessibile per canali di contatto dinamici)
CREATE TABLE `evento_contatti` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `evento_id` INT NOT NULL,
  `dicitura` VARCHAR(100) NOT NULL DEFAULT 'Info', -- es. 'Info e prenotazioni:'
  `tipo` ENUM('instagram', 'cellulare', 'email', 'facebook', 'sito') NOT NULL DEFAULT 'instagram',
  `valore` VARCHAR(255) NOT NULL,
  `ordine` INT NOT NULL DEFAULT 0,
  FOREIGN KEY (`evento_id`) REFERENCES `eventi` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Tabella CINEMA FILM (Catalogo film importati dallo scraping)
CREATE TABLE `cinema_film` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `titolo` VARCHAR(255) NOT NULL UNIQUE,
  `descrizione` TEXT,
  `locandina` VARCHAR(255),
  `regista` VARCHAR(100),
  `durata` VARCHAR(30),
  `info_aggiuntive` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Tabella Relazione specifica EVENTI CINEMA (Mappa le singole proiezioni)
CREATE TABLE `evento_cinema` (
  `evento_id` INT PRIMARY KEY,
  `cinema_film_id` INT NOT NULL,
  `orari_proiezioni` TEXT, -- Stringa contenente gli orari separati da virgole
  `ticket_url` VARCHAR(255),
  FOREIGN KEY (`evento_id`) REFERENCES `eventi` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`cinema_film_id`) REFERENCES `cinema_film` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Tabella SPETTACOLI TEATRO (Catalogo spettacoli importati/inseriti)
CREATE TABLE `spettacoli_teatro` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `titolo` VARCHAR(255) NOT NULL UNIQUE,
  `descrizione` TEXT,
  `compagnia` VARCHAR(150),
  `regista` VARCHAR(100),
  `durata` VARCHAR(30),
  `info_aggiuntive` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Tabella Relazione specifica EVENTI TEATRO
CREATE TABLE `evento_teatro` (
  `evento_id` INT PRIMARY KEY,
  `spettacolo_teatro_id` INT NOT NULL,
  `ticket_url` VARCHAR(255),
  FOREIGN KEY (`evento_id`) REFERENCES `eventi` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`spettacolo_teatro_id`) REFERENCES `spettacoli_teatro` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Tabella COLLABORAZIONI REALTÀ
CREATE TABLE `realta_collaborazioni` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `realta_id` INT NOT NULL,
  `tipo_collaborazione` VARCHAR(100), -- es. 'Festival Habitat', 'Coproduzione 2026'
  `note` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`realta_id`) REFERENCES `realta` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Tabella ACTIVITY LOG (Registro azioni amministrative)
CREATE TABLE `activity_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT,
  `azione` VARCHAR(50) NOT NULL, -- 'creazione', 'modifica', 'approvazione', 'rifiuto', 'cancellazione'
  `tabella_nome` VARCHAR(50) NOT NULL,
  `record_id` INT NOT NULL,
  `descrizione` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
