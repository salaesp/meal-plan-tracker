-- Registro de cada persona (planes, activaciones y días), un JSON por usuario.
create table "user_data" ("user_id" text not null primary key references "user" ("id") on delete cascade, "data" text not null, "updated_at" integer not null);
