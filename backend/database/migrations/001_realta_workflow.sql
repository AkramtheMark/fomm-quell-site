-- Fômm Quell 2.0 - Workflow approvazione realtà
-- Eseguire UNA SOLA VOLTA sul database già esistente, dopo un backup.

ALTER TABLE `realta`
  ADD COLUMN `stato` ENUM('pending', 'approved', 'rejected', 'disabled') NOT NULL DEFAULT 'pending' AFTER `attiva`,
  ADD COLUMN `motivo_rifiuto` TEXT NULL AFTER `stato`,
  ADD COLUMN `approved_at` TIMESTAMP NULL AFTER `motivo_rifiuto`,
  ADD COLUMN `approved_by` INT NULL AFTER `approved_at`,
  ADD CONSTRAINT `fk_realta_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

UPDATE `realta`
SET `stato` = CASE WHEN `attiva` = 1 THEN 'approved' ELSE 'pending' END
WHERE `stato` = 'pending';
