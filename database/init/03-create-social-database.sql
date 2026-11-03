SELECT format('CREATE DATABASE %I', 'social_db')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'social_db')
\gexec