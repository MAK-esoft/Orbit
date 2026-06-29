-- ============================================================
-- IRBAS WhatsApp Ingestion POC — Supabase schema
-- Run this whole file in the Supabase SQL Editor.
-- Safe to re-run: drops are ordered to respect FK dependencies.
-- ============================================================

-- ---- Clean slate (POC convenience) -------------------------
drop table if exists ledger_entries cascade;
drop table if exists expense_requests cascade;
drop table if exists payment_requests cascade;
drop table if exists whatsapp_messages cascade;
drop table if exists customers cascade;
drop table if exists regional_offices cascade;

-- ============================================================
-- Table: regional_offices
-- ============================================================
create table regional_offices (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,                 -- e.g. "Karachi RO"
  city               text not null,
  whatsapp_group_id  text,                           -- WhatsApp group ID for matching
  slack_channel_id   text,                           -- Slack channel ID for matching (e.g. C0123ABCD)
  balance_pkr        numeric(14,2) default 0,        -- current running balance
  created_at         timestamptz default now()
);

-- ============================================================
-- Table: customers
-- ============================================================
create table customers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,                      -- e.g. "D.Watson Karachi"
  ro_id          uuid references regional_offices(id),
  contact_phone  text,
  created_at     timestamptz default now()
);

-- ============================================================
-- Table: whatsapp_messages
-- Raw ingestion log — every message received is stored here
-- before processing.
-- ============================================================
create table whatsapp_messages (
  id                 uuid primary key default gen_random_uuid(),
  raw_payload        jsonb not null,                 -- full webhook payload from WhatsApp
  sender_phone       text,
  group_id           text,
  message_text       text,
  media_url          text,                           -- if image/document attached
  received_at        timestamptz default now(),
  classification     text,                           -- 'payment_proof' | 'expense_proof' | 'unrecognised'
  processing_status  text default 'pending'          -- 'pending' | 'processed' | 'failed'
);

-- ============================================================
-- Table: payment_requests
-- Created when a WhatsApp message is classified as a payment proof.
-- ============================================================
create table payment_requests (
  id                    uuid primary key default gen_random_uuid(),
  whatsapp_message_id   uuid references whatsapp_messages(id),
  ro_id                 uuid references regional_offices(id),
  amount_pkr            numeric(14,2),
  payment_method        text,                        -- 'bank_transfer' | 'cash_deposit' | 'unknown'
  deposit_slip_ref      text,                        -- for cash deposits — extracted from message
  bank_email_match      boolean default false,       -- whether bank email verification succeeded
  bank_email_amount     numeric(14,2),               -- amount found in matching bank email
  bank_email_timestamp  timestamptz,                 -- timestamp from bank email
  status                text default 'pending',      -- 'pending' | 'approved' | 'rejected'
  approved_by           text,
  approved_at           timestamptz,
  rejection_reason      text,
  created_at            timestamptz default now()
);

-- ============================================================
-- Table: expense_requests
-- Created when a WhatsApp message is classified as an expense proof.
-- ============================================================
create table expense_requests (
  id                    uuid primary key default gen_random_uuid(),
  whatsapp_message_id   uuid references whatsapp_messages(id),
  ro_id                 uuid references regional_offices(id),
  description           text,                        -- AI-extracted description
  amount_pkr            numeric(14,2),               -- AI-extracted amount if visible
  media_url             text,                        -- proof image URL
  status                text default 'pending',      -- 'pending' | 'approved' | 'rejected'
  approved_by           text,
  approved_at           timestamptz,
  rejection_reason      text,
  created_at            timestamptz default now()
);

-- ============================================================
-- Table: ledger_entries
-- Created only after a payment_request or expense_request is approved.
-- ============================================================
create table ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  ro_id         uuid references regional_offices(id),
  entry_type    text not null,                       -- 'payment_received' | 'expense_deducted'
  amount_pkr    numeric(14,2) not null,
  reference_id  uuid,                                -- payment_request.id or expense_request.id
  description   text,
  created_at    timestamptz default now()
);

-- ============================================================
-- POC Row-Level Security
-- For the POC we keep RLS DISABLED so the browser approval UI
-- can read/write with the anon key directly.
-- !! Re-enable RLS and add policies before production. !!
-- ============================================================
alter table regional_offices  disable row level security;
alter table customers         disable row level security;
alter table whatsapp_messages disable row level security;
alter table payment_requests  disable row level security;
alter table expense_requests  disable row level security;
alter table ledger_entries    disable row level security;

-- ============================================================
-- Seed data: 3 Regional Offices + 2 customers each
-- ============================================================
insert into regional_offices (id, name, city, whatsapp_group_id, balance_pkr) values
  ('11111111-1111-1111-1111-111111111111', 'Karachi RO',   'Karachi',   'group_karachi_001',   2500000),
  ('22222222-2222-2222-2222-222222222222', 'Lahore RO',    'Lahore',    'group_lahore_001',    1800000),
  ('33333333-3333-3333-3333-333333333333', 'Islamabad RO', 'Islamabad', 'group_islamabad_001',  950000);

insert into customers (name, ro_id, contact_phone) values
  ('D.Watson Karachi',          '11111111-1111-1111-1111-111111111111', '+92-21-1234567'),
  ('Imtiaz Karachi',            '11111111-1111-1111-1111-111111111111', '+92-21-7654321'),
  ('Al-Fatah Lahore',           '22222222-2222-2222-2222-222222222222', '+92-42-1234567'),
  ('Naheed Lahore',             '22222222-2222-2222-2222-222222222222', '+92-42-9876543'),
  ('Metro Islamabad',           '33333333-3333-3333-3333-333333333333', '+92-51-1234567'),
  ('Shifa Pharmacy Islamabad',  '33333333-3333-3333-3333-333333333333', '+92-51-9876543');

-- ============================================================
-- Slack channel -> RO mapping
-- After you create a Slack channel for testing, get its channel ID
-- (Slack: channel name -> View channel details -> bottom shows "Channel ID",
--  e.g. C0123ABCD) and map it to a Regional Office:
--
--   UPDATE regional_offices
--   SET slack_channel_id = 'C0123ABCD'      -- <-- your channel ID
--   WHERE name = 'Karachi RO';
--
-- The workflow's "Find RO" step matches EITHER whatsapp_group_id OR
-- slack_channel_id, so the same pipeline serves both triggers.
-- ============================================================
