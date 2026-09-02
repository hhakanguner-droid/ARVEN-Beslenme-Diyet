#!/usr/bin/env python3
"""Adversarial SQLite checks for Codex review 12 hardening."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "db" / "migrations"
NOW = "2026-09-02T18:00:00.000Z"
LATER = "2026-09-02T18:01:00.000Z"
FRESH = "2026-09-02T18:02:00.000Z"


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

    conn.execute("INSERT INTO scientific_references(id,title,citation,created_at) VALUES('mifflin-1990','Mifflin','Citation',?)", (NOW,))
    inputs = '{"weightKg":80,"heightCm":180,"ageYears":40,"sexAtBirth":"male","activityFactor":1.2,"energyAdjustmentKcal":0,"proteinGPerKg":1.5,"fatEnergyPct":0.3,"waterMlPerKg":30}'
    conn.execute("""
      INSERT INTO goals(id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,water_ml,source,calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at)
      VALUES('goal','u1','2026-09-02',2076,120,243.3,69.2,29.1,2400,'arven-calculated','mifflin-st-jeor','v1',?,'["mifflin-1990"]',?)
    """, (inputs, NOW))
    reject(conn, "goal owner transfer", "UPDATE goals SET user_id='u2' WHERE id='goal'")

    bad_inputs = '{"weightKg":-80,"heightCm":180,"ageYears":40,"sexAtBirth":"male","activityFactor":1.2,"energyAdjustmentKcal":0,"proteinGPerKg":-1.5,"fatEnergyPct":0.3,"waterMlPerKg":-25}'
    reject(conn, "out-of-range calculator inputs", """
      INSERT INTO goals(id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,water_ml,source,calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at)
      VALUES('bad-goal','u2','2026-09-02',2076,120,243.3,69.2,29.1,2400,'arven-calculated','mifflin-st-jeor','v1',?,'["mifflin-1990"]',?)
    """, (bad_inputs, NOW))

    conn.execute("""
      INSERT INTO foods(id,name,normalized_name,allergen_data_status,dietary_safety_data_status,energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,fiber_g_100g,source_provider,verified_at,created_at,updated_at)
      VALUES('food','Food','food','unknown','unknown',100,10,20,5,2,'manual-verified',?,?,?)
    """, (NOW, NOW, NOW))
    reject(conn, "nutrition mutation with stale verification", "UPDATE foods SET energy_kcal_100g=101 WHERE id='food'")
    conn.execute("UPDATE foods SET energy_kcal_100g=101, verified_at=?, updated_at=? WHERE id='food'", (FRESH, FRESH))

    conn.execute("""
      INSERT INTO food_portion_options(id,food_id,measure,label,grams_per_unit,source_provider,verified_at,created_at,updated_at)
      VALUES('slice','food','slice','1 dilim',30,'manual-verified',?,?,?)
    """, (NOW, NOW, NOW))
    reject(conn, "portion grams mutation with stale verification", "UPDATE food_portion_options SET grams_per_unit=500 WHERE id='slice'")

    conn.execute("INSERT INTO food_preferences(id,user_id,food_term,food_id,resolution_status,preference,strength,provenance,created_at,updated_at) VALUES('pref','u1','Food','food','resolved','avoid',5,'user',?,?)", (NOW, NOW))
    reject(conn, "dietary exclusion owner transfer", "UPDATE food_preferences SET user_id='u2' WHERE id='pref'")

    conn.execute("INSERT INTO allergen_catalog(id,canonical_name,created_at) VALUES('milk','Milk',?)", (NOW,))
    reject(conn, "allergen display name whitespace update", "UPDATE allergen_catalog SET canonical_name=? WHERE id='milk'", ("\u2003",))
    conn.execute("INSERT INTO food_allergens(food_id,allergen_id,source_provider,verified_at) VALUES('food','milk','manual-verified',?)", (NOW,))
    reject(conn, "noncanonical allergen evidence update", "UPDATE food_allergens SET verified_at='2026-09-02 12:00:00Z' WHERE food_id='food' AND allergen_id='milk'")

    conn.execute("INSERT INTO food_nutrients(food_id,nutrient_key,amount_per_100g,unit,completeness) VALUES('food','sodium',100,'mg','complete')")
    conn.execute("INSERT INTO meal_entries(id,user_id,local_date,meal_type,occurred_at,created_at,updated_at) VALUES('m1','u1','2026-09-02','lunch',?,?,?)", (NOW, NOW, NOW))
    conn.execute("""
      INSERT INTO meal_entry_items(id,meal_entry_id,food_id,portion_option_id,portion_quantity,portion_label,grams,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,calculation_version,created_at)
      VALUES('item','m1','food','slice',1,'1 dilim',30,30,3,6,1.5,0.6,'v1',?)
    """, (NOW,))
    snapshot = conn.execute("SELECT amount,unit,completeness FROM meal_entry_item_nutrients WHERE meal_entry_item_id='item' AND nutrient_key='sodium'").fetchone()
    assert snapshot == (30.0, 'mg', 'complete'), snapshot

    payload = '{"localDate":"2026-09-02","occurredAt":"2026-09-02T18:00:00Z","milliliters":250}'
    conn.execute("""
      INSERT INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('a1','u1','water-log','WaterLogActionV1','h',?,'proposed','idem-a1',?)
    """, (payload, NOW))
    reject(conn, "AI action id mutation", "UPDATE ai_actions SET id='a2' WHERE id='a1'")
    reject(conn, "AI idempotency mutation", "UPDATE ai_actions SET idempotency_key='idem-a2' WHERE id='a1'")
    reject(conn, "noncanonical confirmation instant", "UPDATE ai_actions SET status='confirmed',confirmed_at='2026-02-31T12:00:00Z' WHERE id='a1'")
    conn.execute("UPDATE ai_actions SET status='confirmed',confirmed_at=? WHERE id='a1'", (NOW,))
    reject(conn, "noncanonical application instant", "UPDATE ai_actions SET status='applied',applied_at='2026-09-02 18:01:00Z' WHERE id='a1'")
    conn.execute("UPDATE ai_actions SET status='applied',applied_at=? WHERE id='a1'", (LATER,))

    print('REVIEW12_CONTRACTS_OK')


if __name__ == '__main__':
    main()
