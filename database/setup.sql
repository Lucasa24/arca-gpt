-- ==============================================================================
-- 🏛️ ARCA DATABASE SETUP
-- Copie e cole este código no "SQL Editor" do Supabase e clique em "Run".
-- ==============================================================================

-- 1. Cria a Tabela de Usuários (O Livro dos Nomes)
create table if not exists public.users (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  password text not null, -- Nota: Em produção, hash deve ser aplicado.
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  is_pro boolean default false,
  provider text default 'email' -- 'email' ou 'google'
);

-- 2. Ativa a Segurança de Nível de Linha (O Guardião)
alter table public.users enable row level security;

-- 3. Políticas de Acesso (As Regras do Templo)
-- Como estamos usando a chave 'publishable' (pública) no backend,
-- precisamos permitir que ela leia e escreva na tabela users.

-- Permite cadastro (INSERT) para qualquer visitante
create policy "Permitir cadastro público"
on public.users
for insert
to public
with check (true);

-- Permite login (SELECT) para verificar credenciais
-- Nota de Segurança: Idealmente, o backend usaria a chave 'service_role' para isso.
create policy "Permitir leitura pública"
on public.users
for select
to public
using (true);

-- ==============================================================================
-- 🆕 ATUALIZAÇÃO: TABELA DE MEMÓRIA (THREADS)
-- ==============================================================================

-- 4. Cria a Tabela de Sessões (O Livro das Memórias)
create table if not exists public.threads (
  id text primary key, -- ID da thread (ex: thread_123456789)
  data jsonb not null default '{}'::jsonb, -- Armazena mensagens e estado
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id text -- Vincula a thread a um usuário (email ou uuid)
);

-- 5. Ativa a Segurança de Nível de Linha para Threads
alter table public.threads enable row level security;

-- 6. Políticas de Acesso para Threads
-- Permite leitura e escrita pública (necessário se usar chave pública no backend)
create policy "Permitir acesso total a threads"
on public.threads
for all
to public
using (true)
with check (true);

-- ==============================================================================
-- 🆕 ATUALIZAÇÃO: COLUNA PROVIDER (LOGIN SOCIAL)
-- ==============================================================================

-- 7. Adiciona coluna 'provider' na tabela users se não existir
-- Execute isso se você já criou a tabela antes e está recebendo erro de coluna ausente
alter table public.users add column if not exists provider text default 'email';
