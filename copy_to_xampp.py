import os
import shutil
import sys

src_dir = os.path.dirname(os.path.abspath(__file__))
dest_dir = r"C:\xampp\htdocs\fomm-quell-site"

print(f"Sorgente: {src_dir}")
print(f"Destinazione: {dest_dir}\n")

if not os.path.exists(r"C:\xampp"):
    print("ATTENZIONE: La cartella C:\\xampp non è stata trovata sul tuo sistema.")
    print("Assicurati di aver installato XAMPP nella directory predefinita prima di eseguire questo script.")
    sys.exit(1)

# Se la destinazione esiste già, facciamo una pulizia per evitare file orfani
if os.path.exists(dest_dir):
    print("La cartella di destinazione esiste già. Eliminazione della vecchia copia in corso...")
    try:
        shutil.rmtree(dest_dir)
    except Exception as e:
        print(f"Errore durante l'eliminazione della vecchia cartella: {e}")
        print("Chiudi eventuali file aperti in XAMPP e riprova.")
        sys.exit(1)

# Escludiamo cartelle non necessarie per l'esecuzione su XAMPP
ignore_patterns = shutil.ignore_patterns(
    ".git",
    "*.log",
    "*.pyc",
    "node_modules",
    "__pycache__"
)

try:
    shutil.copytree(src_dir, dest_dir, ignore=ignore_patterns)
    print("\n✅ COPIA COMPLETATA CON SUCCESSO!")
    print(f"Tutti i file del progetto sono stati copiati in: {dest_dir}")
    print("\nOra puoi:")
    print("1. Aprire XAMPP Control Panel ed avviare Apache e MySQL.")
    print("2. Importare il database fomm_quell in phpMyAdmin.")
    print("3. Accedere al sito locale da: http://localhost/fomm-quell-site")
except Exception as e:
    print(f"\n❌ Si è verificato un errore durante la copia: {e}")
