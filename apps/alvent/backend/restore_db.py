from __future__ import annotations

import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


def _is_sqlite_database(path: Path) -> bool:
    try:
        with sqlite3.connect(str(path)) as connection:
            connection.execute("PRAGMA integrity_check;")
        return True
    except sqlite3.DatabaseError:
        return False


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: python restore_db.py <ruta_backup.bd|ruta_backup.db> [ruta_destino.db]")
        return 1

    source_path = Path(sys.argv[1]).expanduser().resolve()
    if len(sys.argv) >= 3:
        target_path = Path(sys.argv[2]).expanduser().resolve()
    else:
        target_path = Path(__file__).resolve().parent / "app" / "database" / "alvent.db"

    if not source_path.exists():
        print(f"No existe el archivo origen: {source_path}")
        return 1

    if source_path.is_dir():
        print(f"La ruta origen es una carpeta, no un archivo: {source_path}")
        return 1

    if not _is_sqlite_database(source_path):
        print(f"El archivo no parece ser una base SQLite válida: {source_path}")
        return 1

    target_path.parent.mkdir(parents=True, exist_ok=True)

    if target_path.exists():
        backup_path = target_path.with_suffix(
            f"{target_path.suffix}.pre_restore_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        )
        shutil.copy2(target_path, backup_path)
        print(f"Respaldo previo guardado en: {backup_path}")

    shutil.copy2(source_path, target_path)
    print(f"Base restaurada correctamente en: {target_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())