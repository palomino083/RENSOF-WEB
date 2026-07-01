import os

print("ABSOLUTE DB PATH:")
print(os.path.abspath("app/database/alvent.db"))
print("EXISTS:", os.path.exists("app/database/alvent.db"))