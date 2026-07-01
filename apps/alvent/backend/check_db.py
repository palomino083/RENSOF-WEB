from app.database.database import DATABASE_URL
import sqlite3

print("DATABASE_URL:", DATABASE_URL)

conn = sqlite3.connect("app/database/alvent.db")
cur = conn.cursor()

cur.execute("PRAGMA table_info(usuarios)")
print(cur.fetchall())