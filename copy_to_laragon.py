import os
import shutil
import sys

src_dir = os.path.dirname(os.path.abspath(__file__))
dest_dir = r"C:\laragon\www\fomm-quell-site"

print(f"Sorgente: {src_dir}")
print(f"Destinazione: {dest_dir}\n")

if not os.path.exists(r"C:\laragon"):
    print("ATTENZIONE: La cartella C:\\laragon non e' stata trovata sul tuo sistema.")
    sys.exit(1)

# Se la destinazione non esiste, creala
if not os.path.exists(dest_dir):
    os.makedirs(dest_dir)

# Copia ricorsiva sovrascrivendo i file esistenti ed escludendo .git
def copy_recursive(src, dest):
    for item in os.listdir(src):
        if item in ['.git', 'node_modules', '__pycache__', 'copy_to_xampp.py', 'copy_to_laragon.py']:
            continue
        
        s = os.path.join(src, item)
        d = os.path.join(dest, item)
        
        if os.path.isdir(s):
            if not os.path.exists(d):
                os.makedirs(d)
            copy_recursive(s, d)
        else:
            try:
                shutil.copy2(s, d)
            except Exception as e:
                print(f"Non e' stato possibile copiare {item}: {e}")

try:
    copy_recursive(src_dir, dest_dir)
    print("\n[OK] COPIA AGGIORNAMENTO SU LARAGON COMPLETATA CON SUCCESSO!")
    print(f"Tutti i file sono stati sovrascritti in: {dest_dir}")
except Exception as e:
    print(f"\n[ERRORE] Si e' verificato un errore durante la copia: {e}")
