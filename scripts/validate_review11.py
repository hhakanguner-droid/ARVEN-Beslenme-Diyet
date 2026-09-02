#!/usr/bin/env python3
"""Adversarial SQLite checks for Codex review 11 hardening."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "db" / "migrations"
NOW = "2026-09-02T18:00:00.000Z"
LATER = "2026-09-02T18:01:00.000Z"


def reject(conn, label, sql, params=()):
    try:
        conn.execute(sql, params)
    except (sqlite3.IntegrityError, sqlite3.OperationalError):
        return
    raise AssertionError(f"Expected rejection: {label}")


def apply(conn):
    for path in sorted(MIGRATIONS.glob("*.sql")):
        conn.executescript(path.read_text(encoding="utf-8"))


def main():
    conn = sqlite3.connect(":memory:", isolation_level=None)
    conn.execute("PRAGMA foreign_keys=ON")
    apply(conn)
    for uid in ("u1", "u2"):
        conn.execute("INSERT INTO users(id,external_subject,created_at,updated_at) VALUES(?,?,?,?)", (uid, uid, NOW, NOW))

    # Authenticated safety ownership cannot move between accounts.
    conn.execute("INSERT INTO allergen_catalog(id,canonical_name,created_at) VALUES('milk','Milk',?)", (NOW,))
    conn.execute("INSERT INTO user_allergies(user_id,allergen_id,active,created_at) VALUES('u1','milk',1,?)", (NOW,))
    reject(conn, "active allergy owner transfer", "UPDATE user_allergies SET user_id='u2' WHERE user_id='u1' AND allergen_id='milk'")

    # Canonical machine IDs and the complete whitespace family are rejected.
    reject(conn, "unicode-space allergen id", "INSERT INTO allergen_catalog(id,canonical_name,created_at) VALUES(?, 'Bad', ?)", ("\u2003", NOW))
    reject(conn, "nbsp-only dietary name", "INSERT INTO dietary_rule_catalog(id,canonical_name,created_at) VALUES('veg', ?, ?)", ("\u00a0", NOW))

    # Direct log writes require exact canonical UTC syntax rather than CAST-friendly text.
    reject(conn, "malformed meal instant separators", """
      INSERT INTO meal_entries(id,user_id,local_date,meal_type,occurred_at,created_at,updated_at)
      VALUES('m-bad','u1','2026-09-02','lunch','2026-09-02X12x00x00Z',?,?)
    """, (NOW, NOW))
    reject(conn, "nonnumeric water instant", """
      INSERT INTO water_logs(id,user_id,occurred_at,local_date,milliliters,created_at)
      VALUES('w-bad','u1','2026-09-02Taa:bb:ccZ','2026-09-02',250,?)
    """, (NOW,))

    # Verification timestamps are canonical for nutrition and hard-safety evidence.
    reject(conn, "food verification uses space separator", """
      INSERT INTO foods(id,name,normalized_name,energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,source_provider,verified_at,created_at,updated_at)
      VALUES('bad-food','bad','bad',100,10,20,5,'manual-verified','2026-09-02 12:00:00Z',?,?)
    """, (NOW, NOW))

    conn.execute("""
      INSERT INTO foods(id,name,normalized_name,allergen_data_status,dietary_safety_data_status,energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,fiber_g_100g,source_provider,verified_at,created_at,updated_at)
      VALUES('food','Food','food','unknown','unknown',100,10,20,5,2,'manual-verified',?,?,?)
    """, (NOW, NOW, NOW))
    reject(conn, "safety evidence impossible date", """
      INSERT INTO food_allergens(food_id,allergen_id,source_provider,verified_at)
      VALUES('food','milk','manual-verified','2026-02-31T12:00:00Z')
    """)
    conn.execute("INSERT INTO food_allergens(food_id,allergen_id,source_provider,verified_at) VALUES('food','milk','manual-verified',?)", (NOW,))
    conn.execute("UPDATE foods SET allergen_data_status='verified' WHERE id='food'")
    reject(conn, "delete verified allergen evidence", "DELETE FROM food_allergens WHERE food_id='food' AND allergen_id='milk'")

    # Verified nutrition cannot change while retaining stale evidence.
    reject(conn, "nutrition update without provenance refresh", "UPDATE foods SET energy_kcal_100g=101 WHERE id='food'")

    # Portion label and resolved grams are one deterministic representation.
    conn.execute("""
      INSERT INTO food_portion_options(id,food_id,measure,label,grams_per_unit,source_provider,verified_at,created_at,updated_at)
      VALUES('slice','food','slice','1 dilim',30,'manual-verified',?,?,?)
    """, (NOW, NOW, NOW))
    conn.execute("INSERT INTO meal_entries(id,user_id,local_date,meal_type,occurred_at,created_at,updated_at) VALUES('m1','u1','2026-09-02','lunch',?,?,?)", (NOW, NOW, NOW))
    reject(conn, "portion label disagrees with option", """
      INSERT INTO meal_entry_items(id,meal_entry_id,food_id,portion_option_id,portion_quantity,portion_label,grams,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,calculation_version,created_at)
      VALUES('bad-label','m1','food','slice',1,'5 bardak',30,30,3,6,1.5,0.6,'v1',?)
    """, (NOW,))
    conn.execute("""
      INSERT INTO meal_entry_items(id,meal_entry_id,food_id,portion_option_id,portion_quantity,portion_label,grams,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,calculation_version,created_at)
      VALUES('item','m1','food','slice',1,'1 dilim',30,30,3,6,1.5,0.6,'v1',?)
    """, (NOW,))

    # Extended nutrient snapshots are derived from food_nutrients + item grams.
    conn.execute("INSERT INTO food_nutrients(food_id,nutrient_key,amount_per_100g,unit,completeness) VALUES('food','sodium',100,'mg','complete')")
    reject(conn, "invented extended nutrient snapshot", """
      INSERT INTO meal_entry_item_nutrients(meal_entry_item_id,nutrient_key,amount,unit,completeness)
      VALUES('item','sodium',999999,'mg','complete')
    """)
    conn.execute("INSERT INTO meal_entry_item_nutrients(meal_entry_item_id,nutrient_key,amount,unit,completeness) VALUES('item','sodium',30,'mg','complete')")

    # Supported calculator inputs must reproduce every stored target exactly.
    conn.execute("INSERT INTO scientific_references(id,title,citation,created_at) VALUES('mifflin-1990','Mifflin','Citation',?)", (NOW,))
    inputs = '{"weightKg":80,"heightCm":180,"ageYears":40,"sexAtBirth":"male","activityFactor":1.2,"energyAdjustmentKcal":0,"proteinGPerKg":1.5,"fatEnergyPct":0.3,"waterMlPerKg":30}'
    reject(conn, "arbitrary calculated target", """
      INSERT INTO goals(id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,water_ml,source,calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at)
      VALUES('bad-goal','u1','2026-09-02',9999,120,243.3,69.2,29.1,2400,'arven-calculated','mifflin-st-jeor','v1',?,'["mifflin-1990"]',?)
    """, (inputs, NOW))
    conn.execute("""
      INSERT INTO goals(id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,water_ml,source,calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at)
      VALUES('goal','u1','2026-09-02',2076,120,243.3,69.2,29.1,2400,'arven-calculated','mifflin-st-jeor','v1',?,'["mifflin-1990"]',?)
    """, (inputs, NOW))

    # AI creation time is canonical and action identities cannot be REPLACEd/reset.
    payload = '{"localDate":"2026-09-02","occurredAt":"2026-09-02T18:00:00Z","milliliters":250}'
    reject(conn, "garbage AI created_at", """
      INSERT INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('bad-created','u1','water-log','WaterLogActionV1','h',?,'proposed','bad-created','garbage')
    """, (payload,))
    conn.execute("""
      INSERT INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('a1','u1','water-log','WaterLogActionV1','h',?,'proposed','idem-a1',?)
    """, (payload, NOW))
    conn.execute("UPDATE ai_actions SET status='confirmed',confirmed_at=? WHERE id='a1'", (NOW,))
    conn.execute("UPDATE ai_actions SET status='applied',applied_at=? WHERE id='a1'", (LATER,))
    reject(conn, "replace applied action by id", """
      INSERT OR REPLACE INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('a1','u1','water-log','WaterLogActionV1','h2',?,'proposed','idem-new',?)
    """, (payload, NOW))
    reject(conn, "replace applied action by idempotency key", """
      INSERT OR REPLACE INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('a2','u1','water-log','WaterLogActionV1','h2',?,'proposed','idem-a1',?)
    """, (payload, NOW))

    print('REVIEW11_CONTRACTS_OK')


if __name__ == '__main__':
    main()
