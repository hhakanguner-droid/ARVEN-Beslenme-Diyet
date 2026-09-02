#!/usr/bin/env python3
"""Adversarial SQLite checks for Codex review 10 hardening."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "db" / "migrations"
NOW = "2026-09-02T17:00:00.000Z"


def reject(conn, label, sql, params=()):
    try:
        conn.execute(sql, params)
    except (sqlite3.IntegrityError, sqlite3.OperationalError):
        return
    raise AssertionError(f"Expected rejection: {label}")


def apply(conn):
    for path in sorted(MIGRATIONS.glob("*.sql")):
        conn.executescript(path.read_text(encoding="utf-8"))


def add_food(conn, food_id="food", energy=100, protein=10, carbs=20, fat=5, fiber=2):
    conn.execute("""
      INSERT INTO foods(id,name,normalized_name,energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,fiber_g_100g,source_provider,verified_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?, 'manual-verified',?,?,?)
    """, (food_id, food_id, food_id, energy, protein, carbs, fat, fiber, NOW, NOW, NOW))


def main():
    conn = sqlite3.connect(":memory:", isolation_level=None)
    conn.execute("PRAGMA foreign_keys=ON")
    apply(conn)
    for uid in ("u1", "u2"):
        conn.execute("INSERT INTO users(id,external_subject,created_at,updated_at) VALUES(?,?,?,?)", (uid, uid, NOW, NOW))

    reject(conn, "infinite goal", """
      INSERT INTO goals(id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,source,created_at)
      VALUES('g-inf','u1','2026-09-02',1e999,100,200,70,'manual',?)
    """, (NOW,))
    reject(conn, "text goal", """
      INSERT INTO goals(id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,source,created_at)
      VALUES('g-text','u1','2026-09-02','oops',100,200,70,'manual',?)
    """, (NOW,))

    conn.execute("INSERT INTO scientific_references(id,title,citation,created_at) VALUES('r10','R10','Citation',?)", (NOW,))
    reject(conn, "duplicate calculation input keys", """
      INSERT INTO goals(id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,source,calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at)
      VALUES('gdup','u1','2026-09-02',2000,120,220,70,'arven-calculated','m','v1','{"weightKg":80,"weightKg":100}','["r10"]',?)
    """, (NOW,))
    conn.execute("""
      INSERT INTO goals(id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,source,calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at)
      VALUES('g10','u1','2026-09-02',2000,120,220,70,'arven-calculated','m','v1','{"weightKg":80}','["r10"]',?)
    """, (NOW,))
    reject(conn, "null in-use scientific reference id", "UPDATE scientific_references SET id=NULL WHERE id='r10'")

    reject(conn, "tab-only allergen id", "INSERT INTO allergen_catalog(id,canonical_name,created_at) VALUES(?, 'Milk', ?)", ("\t", NOW))
    reject(conn, "newline-only dietary name", "INSERT INTO dietary_rule_catalog(id,canonical_name,created_at) VALUES('veg', ?, ?)", ("\n", NOW))

    reject(conn, "noncanonical food verification date", """
      INSERT INTO foods(id,name,normalized_name,energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,source_provider,verified_at,created_at,updated_at)
      VALUES('bad-date','bad','bad',100,10,20,5,'manual-verified','2026-02-31T12:00:00Z',?,?)
    """, (NOW, NOW))
    reject(conn, "text nutrition storage", """
      INSERT INTO foods(id,name,normalized_name,energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,source_provider,verified_at,created_at,updated_at)
      VALUES('nan-food','nan','nan','NaN',10,20,5,'manual-verified',?,?,?)
    """, (NOW, NOW, NOW))

    add_food(conn)
    conn.execute("""
      INSERT INTO food_portion_options(id,food_id,measure,label,grams_per_unit,source_provider,verified_at,created_at,updated_at)
      VALUES('slice','food','slice','1 dilim',30,'manual-verified',?,?,?)
    """, (NOW, NOW, NOW))
    reject(conn, "text portion grams", """
      INSERT INTO food_portion_options(id,food_id,measure,label,grams_per_unit,source_provider,verified_at,created_at,updated_at)
      VALUES('bad-portion','food','slice','bad','oops','manual-verified',?,?,?)
    """, (NOW, NOW, NOW))

    conn.execute("INSERT INTO meal_entries(id,user_id,local_date,meal_type,occurred_at,created_at,updated_at) VALUES('m1','u1','2026-09-02','lunch',?,?,?)", (NOW, NOW, NOW))
    reject(conn, "invalid direct meal date", "INSERT INTO meal_entries(id,user_id,local_date,meal_type,occurred_at,created_at,updated_at) VALUES('badm','u1','2026-02-31','lunch','2026-02-31T12:00:00Z',?,?)", (NOW, NOW))
    reject(conn, "arbitrary meal snapshot", """
      INSERT INTO meal_entry_items(id,meal_entry_id,food_id,grams,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,calculation_version,created_at)
      VALUES('bad-snapshot','m1','food',50,999,999,999,999,999,'v1',?)
    """, (NOW,))
    reject(conn, "household grams mismatch", """
      INSERT INTO meal_entry_items(id,meal_entry_id,food_id,portion_option_id,portion_quantity,portion_label,grams,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,calculation_version,created_at)
      VALUES('bad-portion-item','m1','food','slice',1,'1 dilim',500,500,50,100,25,10,'v1',?)
    """, (NOW,))
    conn.execute("""
      INSERT INTO meal_entry_items(id,meal_entry_id,food_id,portion_option_id,portion_quantity,portion_label,grams,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,calculation_version,created_at)
      VALUES('good-item','m1','food','slice',1,'1 dilim',30,30,3,6,1.5,0.6,'v1',?)
    """, (NOW,))
    reject(conn, "text extended nutrient", "INSERT INTO meal_entry_item_nutrients(meal_entry_item_id,nutrient_key,amount,unit,completeness) VALUES('good-item','sodium','NaN','mg','complete')")

    conn.execute("INSERT INTO water_logs(id,user_id,occurred_at,local_date,milliliters,created_at) VALUES('w1','u1',?,'2026-09-02',250,?)", (NOW, NOW))
    reject(conn, "water owner transfer", "UPDATE water_logs SET user_id='u2' WHERE id='w1'")
    reject(conn, "invalid direct water date", "INSERT INTO water_logs(id,user_id,occurred_at,local_date,milliliters,created_at) VALUES('badw','u1','2026-02-31T12:00:00Z','2026-02-31',250,?)", (NOW,))

    rollover = '{"localDate":"2026-09-02","occurredAt":"2026-09-02T24:01:00Z","milliliters":250}'
    reject(conn, "rollover AI occurrence hour", """
      INSERT INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('roll','u1','water-log','WaterLogActionV1','h',?,'proposed','roll',?)
    """, (rollover, NOW))

    payload = '{"localDate":"2026-09-02","occurredAt":"2026-09-02T12:00:00Z","milliliters":250}'
    conn.execute("""
      INSERT INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('a10','u1','water-log','WaterLogActionV1','h',?,'proposed','a10',?)
    """, (payload, NOW))
    reject(conn, "confirmation before creation", "UPDATE ai_actions SET status='confirmed', confirmed_at='2026-09-01T12:00:00.000Z' WHERE id='a10'")
    conn.execute("UPDATE ai_actions SET status='confirmed', confirmed_at=? WHERE id='a10'", (NOW,))
    reject(conn, "rewrite confirmation timestamp", "UPDATE ai_actions SET confirmed_at='2026-09-02T17:01:00.000Z' WHERE id='a10'")
    conn.execute("UPDATE ai_actions SET status='applied', applied_at='2026-09-02T17:02:00.000Z' WHERE id='a10'")
    reject(conn, "rewrite applied timestamp", "UPDATE ai_actions SET applied_at='2026-09-02T17:03:00.000Z' WHERE id='a10'")

    print('REVIEW10_CONTRACTS_OK')


if __name__ == '__main__':
    main()
