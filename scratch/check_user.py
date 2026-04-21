import os
import psycopg2
import sys
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Ensure stdout handles Unicode
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Load .env
load_dotenv()
db_url = os.getenv('DATABASE_URL')

def check_user_history(email):
    try:
        conn = psycopg2.connect(db_url)
        c = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get user ID
        c.execute("SELECT id, name, email FROM users WHERE email = %s", (email,))
        user = c.fetchone()
        if not user:
            print(f"User with email {email} not found.")
            return
        
        user_id = user['id']
        print(f"User Found: ID={user_id}, Name={user['name']}, Email={user['email']}")
        
        # Get history
        c.execute("SELECT question, answer, timestamp FROM conversations WHERE user_id = %s ORDER BY timestamp DESC LIMIT 10", (user_id,))
        rows = c.fetchall()
        
        print("\n--- Recent Conversation History ---")
        for row in rows:
            print(f"Time: {row['timestamp']}")
            print(f"Q: {row['question']}")
            # Use repr for answer to avoid terminal encoding issues if reconfigure fails
            try:
                print(f"A: {row['answer'][:300]}")
            except:
                print(f"A: {row['answer'][:300].encode('utf-8')}")
            print("-" * 40)
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_user_history("yashraj.justlearn@gmail.com")
