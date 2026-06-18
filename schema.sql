-- Crear tabla ANIMES
CREATE TABLE animes (
  id BIGSERIAL PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  imagen VARCHAR(500),
  descripcion TEXT,
  tipo VARCHAR(50) DEFAULT 'TV',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla EPISODIOS
CREATE TABLE episodios (
  id BIGSERIAL PRIMARY KEY,
  anime_id BIGINT NOT NULL REFERENCES animes(id) ON DELETE CASCADE,
  numero INT NOT NULL,
  titulo VARCHAR(255),
  links JSONB, -- {"servidor": "url", "servidor2": "url2"}
  cover_image VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security) para lectura pública
ALTER TABLE animes ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodios ENABLE ROW LEVEL SECURITY;

-- Permitir lectura pública
CREATE POLICY "Allow public read on animes" ON animes FOR SELECT USING (true);
CREATE POLICY "Allow public read on episodios" ON episodios FOR SELECT USING (true);

-- Crear índices para mejor rendimiento
CREATE INDEX idx_episodios_anime_id ON episodios(anime_id);
CREATE INDEX idx_episodios_numero ON episodios(numero);
