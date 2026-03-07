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
  is_pro boolean default false
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
