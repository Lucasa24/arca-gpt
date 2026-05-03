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
-- Limpa políticas antigas para evitar conflitos
drop policy if exists "Permitir cadastro público" on public.users;
drop policy if exists "Permitir leitura pública" on public.users;
drop policy if exists "Enable insert for all" on public.users;
drop policy if exists "Enable select for all" on public.users;

-- Permite cadastro (INSERT) para qualquer visitante (necessário para SignUp)
create policy "Permitir cadastro público"
on public.users
for insert
to public
with check (true);

-- Permite login (SELECT) para verificar credenciais
-- ATENÇÃO: Em produção, usar chave 'service_role' no backend é mais seguro.
-- Como estamos usando a chave pública, precisamos permitir leitura.
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
drop policy if exists "Permitir acesso total a threads" on public.threads;

-- Permite leitura e escrita pública (necessário se usar chave pública no backend)
create policy "Permitir acesso total a threads"
on public.threads
for all
to public
using (true)
with check (true);

-- ==============================================================================
-- 🆕 ATUALIZAÇÃO: MENSAGENS (HISTÓRICO COMPLETO POR THREAD)
-- ==============================================================================

create table if not exists public.thread_messages (
  id bigserial primary key,
  thread_id text not null references public.threads(id) on delete cascade,
  user_id text,
  role text not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.thread_messages enable row level security;

drop policy if exists "Permitir acesso total a thread_messages" on public.thread_messages;

create policy "Permitir acesso total a thread_messages"
on public.thread_messages
for all
to public
using (true)
with check (true);

-- ==============================================================================
-- 🆕 ATUALIZAÇÃO: ESTADO DO USUÁRIO (ÚLTIMA TRAVESSIA / POSIÇÃO)
-- ==============================================================================

create table if not exists public.user_state (
  user_id text primary key,
  last_thread_id text,
  last_scroll jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_state enable row level security;

drop policy if exists "Permitir acesso total a user_state" on public.user_state;

create policy "Permitir acesso total a user_state"
on public.user_state
for all
to public
using (true)
with check (true);

-- ==============================================================================
-- 🆕 ATUALIZAÇÃO: CRÉDITOS (CONTROLE INTERNO DE USO DO GEMINI)
-- ==============================================================================

create table if not exists public.user_credits (
  user_id text primary key,
  creditos_disponiveis numeric not null default 0,
  creditos_gastos numeric not null default 0,
  historico_de_recargas jsonb not null default '[]'::jsonb,
  historico_de_consumo jsonb not null default '[]'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_credits enable row level security;

drop policy if exists "Permitir acesso total a user_credits" on public.user_credits;

create policy "Permitir acesso total a user_credits"
on public.user_credits
for all
to public
using (true)
with check (true);

-- ==============================================================================
-- 🆕 OPCIONAL: EVENTOS DE CONSUMO (UNIQUE consumption_id)
-- Uma proteção física contra duplicatas em cenários de concorrência/retry.
-- ==============================================================================

create table if not exists public.credit_consumption_events (
  consumption_id text primary key,
  user_id text not null,
  tipo text,
  bucket text,
  tokens numeric not null default 0,
  creditos numeric not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.credit_consumption_events enable row level security;

drop policy if exists "Permitir acesso total a credit_consumption_events" on public.credit_consumption_events;

create policy "Permitir acesso total a credit_consumption_events"
on public.credit_consumption_events
for all
to public
using (true)
with check (true);

-- ==============================================================================
-- 🆕 ATUALIZAÇÃO: COLUNA PROVIDER (LOGIN SOCIAL)
-- ==============================================================================

-- 7. Adiciona coluna 'provider' na tabela users se não existir
alter table public.users add column if not exists provider text default 'email';
