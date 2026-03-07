-- Tabela de Usuários (Auth)
create table users (
  id uuid primary key,
  email text unique not null,
  password text not null,
  is_pro boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Tabela de Threads (Memória de Conversa)
-- Armazena o estado completo da conversa (mensagens, persona, configurações) em JSONB
create table threads (
  id text primary key, -- threadId
  user_id uuid references users(id), -- Opcional: vincular a um usuário logado
  data jsonb not null, -- O objeto completo da memória { messages, currentPersona, etc }
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Política de segurança (RLS) - Opcional para MVP, mas recomendado
alter table users enable row level security;
alter table threads enable row level security;

-- Política simples: permitir tudo (para facilitar início) ou configurar conforme necessidade
create policy "Allow public access for MVP" on users for all using (true);
create policy "Allow public access for MVP" on threads for all using (true);
