-- Dati di test iniziali per Fômm Quell 2.0
-- Inserisce categorie standard, alcuni utenti di prova, luoghi ed eventi dimostrativi

-- 1. Popolamento delle CATEGORIE con i colori ufficiali e icone
INSERT INTO `categorie` (`id`, `nome`, `colore`, `icona`, `attiva`) VALUES
(1, 'Musica', '#B52EFF', '🎵', 1),
(2, 'Cultura', '#26F76C', '📚', 1),
(3, 'Spettacolo', '#00F0FF', '🎭', 1),
(4, 'Arte', '#FF007A', '🎨', 1),
(5, 'Laboratorio', '#FFD600', '⚡', 1),
(6, 'Altro', '#FFFFFF', '✨', 1)
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`), `colore` = VALUES(`colore`);

-- 2. Inserimento UTENTI di prova
-- Le password sono hashate con bcrypt per password_verify()
-- admin@fommquell.it -> 'fommquelladmin'
-- scalabrini@fommquell.it -> 'scalabrini2026'
-- operatore@fommquell.it -> 'operatore2026'
INSERT INTO `users` (`id`, `nome`, `cognome`, `email`, `password_hash`, `ruolo`, `attivo`) VALUES
(1, 'Admin', 'FommQuell', 'admin@fommquell.it', '$2y$10$B65R8KxQvG6Wd5B8e/wNuODn.2W0eOOmJ1/xY2nC41qG9qZ0Zq3oO', 'admin', 1),
(2, 'Gestore', 'Scalabrini', 'scalabrini@fommquell.it', '$2y$10$wODn.2W0eOOmJ1/xY2nC41qG9qZ0Zq3oOB65R8KxQvG6Wd5B8e/wNu', 'gestore', 1),
(3, 'Operatore', 'Prova', 'operatore@fommquell.it', '$2y$10$1/xY2nC41qG9qZ0Zq3oOB65R8KxQvG6Wd5B8e/wNuODn.2W0eOOmJ1', 'operatore', 1)
ON DUPLICATE KEY UPDATE `email` = VALUES(`email`);

-- 3. Inserimento REALTÀ (Locali/Cinema/Teatri partner di Fômm Quell)
INSERT INTO `realta` (`id`, `nome`, `descrizione`, `tipologia`, `email`, `telefono`, `sito_web`, `instagram`, `facebook`, `attiva`) VALUES
(1, 'Fattoria Scalabrini', 'Agriturismo, fattoria didattica e spazio eventi all\'aperto.', 'locale', 'info@fattoriascalabrini.it', '0522000000', 'https://fattoriascalabrini.it', 'fattoria_scalabrini', 'FattoriaScalabrini', 1),
(2, 'Cinema Rosebud', 'Cinema d\'essai storico del comune di Reggio Emilia.', 'cinema', 'rosebud@comune.re.it', '0522456123', 'https://rosebud.comune.re.it', 'cinema_rosebud', 'CinemaRosebud', 1),
(3, 'Teatro Valli', 'Teatro Municipale Romolo Valli, cuore della prosa e dell\'opera lirica reggiana.', 'teatro', 'biglietteria@iteatri.re.it', '0522458811', 'https://iteatri.re.it', 'iteatrireggioemilia', 'Iteatri', 1),
(4, 'Al Corso', 'Cinema multisala d\'essai nel centro storico.', 'cinema', 'info@cinemaalcorso.com', '0522452224', 'https://cinemaalcorso.com', 'cinema_al_corso', 'CinemaAlCorso', 1)
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- 4. Associazione UTENTI-REALTÀ
INSERT INTO `realta_users` (`realta_id`, `user_id`, `ruolo_realta`) VALUES
(1, 2, 'gestore_principale'), -- Scalabrini gestito da utente 2
(2, 3, 'collaboratore')     -- Rosebud collaboratore utente 3
ON DUPLICATE KEY UPDATE `ruolo_realta` = VALUES(`ruolo_realta`);

-- 5. Inserimento LUOGHI fisici (con coordinate per Leaflet)
INSERT INTO `luoghi` (`id`, `nome`, `indirizzo`, `citta`, `provincia`, `cap`, `latitudine`, `longitudine`, `descrizione`, `attivo`) VALUES
(1, 'Piazza Prampolini', 'Piazza Prampolini', 'Reggio Emilia', 'RE', '42121', 44.69820000, 10.63000000, 'Piazza Grande, cuore del centro storico reggiano.', 1),
(2, 'Piazza Fontanesi', 'Piazza Fontanesi', 'Reggio Emilia', 'RE', '42121', 44.69610000, 10.63180000, 'Piazza alberata famosa per la movida e i locali all\'aperto.', 1),
(3, 'Teatro Valli', 'Piazza della Vittoria, 1', 'Reggio Emilia', 'RE', '42121', 44.70010000, 10.63050000, 'Il monumentale Teatro Municipale Romolo Valli.', 1),
(4, 'Chiostri di San Pietro', 'Via Emilia San Pietro, 44/c', 'Reggio Emilia', 'RE', '42121', 44.69780000, 10.63600000, 'Polo culturale e monumentale di Reggio Emilia.', 1),
(5, 'Piazza San Prospero', 'Piazza San Prospero', 'Reggio Emilia', 'RE', '42121', 44.69750000, 10.63130000, 'Piazza della Basilica, caratterizzata dai leoni di marmo rosso.', 1),
(6, 'Fattoria Scalabrini', 'Via Sottili, 2', 'Reggio Emilia', 'RE', '42123', 44.65480000, 10.61200000, 'Sede rurale ed agrituristica.', 1)
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- 6. Inserimento EVENTI dimostrativi
INSERT INTO `eventi` (`id`, `titolo`, `descrizione`, `data`, `ora_inizio`, `ora_fine`, `realta_id`, `luogo_id`, `tipo_evento`, `info_prezzo`, `info_generiche`, `stato`, `created_by`, `published_at`) VALUES
(1, 'GIOVEDISCHI', 'Serata d\'ascolto e presentazione vinili all\'aperto.', '2026-08-27', '21:00:00', '23:30:00', 1, 2, 'evento', 'ingresso gratuito', 'Info e prenotazione consigliata', 'published', 1, CURRENT_TIMESTAMP),
(2, 'READING PARTY', 'Una mattinata dedicata alla lettura silenziosa all\'aperto nel parco dei chiostri.', '2026-08-28', '10:00:00', '12:00:00', NULL, 4, 'evento', 'ingresso gratuito', 'Porta il tuo libro', 'published', 1, CURRENT_TIMESTAMP),
(3, 'ANTIGONE: PRIMA OPERAZIONE', 'Spettacolo teatrale sperimentale della compagnia locale.', '2026-08-29', '21:15:00', '22:45:00', 3, 3, 'teatro', 'ingresso: 15€', 'Biglietti in prevendita online', 'published', 1, CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE `titolo` = VALUES(`titolo`);

-- 7. Associazione EVENTI - CATEGORIE
INSERT INTO `evento_categorie` (`evento_id`, `categoria_id`) VALUES
(1, 1), -- Giovedischi -> Musica
(1, 2), -- Giovedischi -> Cultura
(2, 2), -- Reading Party -> Cultura
(3, 3)  -- Antigone -> Spettacolo
ON DUPLICATE KEY UPDATE `evento_id` = `evento_id`;

-- 8. Inserimento TAGS
INSERT INTO `tags` (`id`, `nome`) VALUES
(1, 'jazz'),
(2, 'indie'),
(3, 'vinile'),
(4, 'prosa'),
(5, 'classici')
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- 9. Associazione EVENTI - TAGS
INSERT INTO `evento_tags` (`evento_id`, `tag_id`) VALUES
(1, 3), -- Giovedischi -> vinile
(3, 4)  -- Antigone -> prosa
ON DUPLICATE KEY UPDATE `evento_id` = `evento_id`;

-- 10. Inserimento CONTATTI EVENTO
INSERT INTO `evento_contatti` (`evento_id`, `dicitura`, `tipo`, `valore`, `ordine`) VALUES
(1, 'Segui la pagina:', 'instagram', 'fommquell', 1),
(2, 'Email:', 'email', 'info@chiostrisanpietro.it', 1),
(3, 'Biglietteria:', 'cellulare', '0522458811', 1)
ON DUPLICATE KEY UPDATE `evento_id` = `evento_id`;
