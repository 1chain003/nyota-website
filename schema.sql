CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    id_number TEXT,
    city TEXT,
    postal_code TEXT,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    type TEXT,
    country TEXT,
    university TEXT,
    program TEXT,
    name TEXT,
    email TEXT,
    phone TEXT,
    job TEXT,
    experience TEXT,
    education TEXT,
    message TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    subject TEXT,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
