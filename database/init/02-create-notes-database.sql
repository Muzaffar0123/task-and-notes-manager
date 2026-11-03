SELECT format('CREATE DATABASE %I', 'notes_db')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'notes_db')
\gexec