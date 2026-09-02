#!/usr/bin/env python3
"""Adversarial SQLite checks for Codex review 9 hardening."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "db" / "migrations"
NOW = "2026-09-02T16:30:00.000Z"

def reject(conn, label, sql, params=()):
    try:
        conn.execute(sql, params)
    except (sqlite3.IntegrityError, sqlite3.OperationalError):
        return
    raise AssertionError(f"Expected rejection: {label}")

def apply(conn):
    for path in sorted(MIGRATIONS.glob("*.sql")):
        conn.executescript(path.read_text(encoding="utf-8"))

def add_food(conn, food_id, owner=None):
    conn.execute("""
      INSERT INTO foods (id,owner_user_id,name,normalized_name,energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,source_provider,verified_at,created_at,updated_at)
      VALUES (?,?,?, ?,100,10,10,2,'manual-verified',?,?,?)
    """, (food_id, owner, food_id, food_id, NOW, NOW, NOW))

def main():
    conn = sqlite3.connect(":memory:", isolation_level=None)
    conn.execute("PRAGMA foreign_keys=ON")
    apply(conn)
    for uid in ("u1", "u2"):
        conn.execute("INSERT INTO users(id,external_subject,created_at,updated_at) VALUES(?,?,?,?)", (uid, uid, NOW, NOW))

    reject(conn, "NULL allergen id", "INSERT INTO allergen_catalog(id,canonical_name,created_at) VALUES(NULL,'Milk',?)", (NOW,))
    reject(conn, "NULL dietary-rule id", "INSERT INTO dietary_rule_catalog(id,canonical_name,created_at) VALUES(NULL,'Vegetarian',?)", (NOW,))

    conn.execute("INSERT INTO scientific_references(id,title,citation,created_at) VALUES('r9','R9','Citation',?)", (NOW,))
    goal_inputs = '{"weightKg":80,"heightCm":180,"ageYears":40,"sexAtBirth":"male","activityFactor":1.2,"energyAdjustmentKcal":0,"proteinGPerKg":1.5,"fatEnergyPct":0.3,"waterMlPerKg":30}'
    conn.execute("""
      INSERT INTO goals(id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,water_ml,source,calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at)
      VALUES('g9','u1','2026-09-02',2076,120,243.3,69.2,29.1,2400,'arven-calculated','mifflin-st-jeor','v1',?,'["r9"]',?)
    """, (goal_inputs, NOW))
    reject(conn, "REPLACE used scientific ref", "INSERT OR REPLACE INTO scientific_references(id,title,citation,created_at) VALUES('r9','Changed','Changed',?)", (NOW,))

    reject(conn, "duplicate allocation keys", """
      INSERT INTO goal_meal_allocations(goal_id,allocations_json,updated_at)
      VALUES('g9','[{"mealType":"breakfast","mealType":"dinner","energyShareBps":10000,"energyShareBps":0}]',?)
    """, (NOW,))

    add_food(conn, "fg")
    reject(conn, "infinite food source nutrition", """
      INSERT INTO foods(id,name,normalized_name,energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,source_provider,verified_at,created_at,updated_at)
      VALUES('finf','inf','inf',1e999,1,1,1,'manual-verified',?,?,?)
    """, (NOW, NOW, NOW))
    conn.execute("INSERT INTO meal_entries(id,user_id,local_date,meal_type,occurred_at,created_at,updated_at) VALUES('m1','u1','2026-09-02','lunch',?,?,?)", (NOW, NOW, NOW))
    conn.execute("INSERT INTO meal_entries(id,user_id,local_date,meal_type,occurred_at,created_at,updated_at) VALUES('m2','u2','2026-09-02','lunch',?,?,?)", (NOW, NOW, NOW))
    conn.execute("""
      INSERT INTO meal_entry_items(id,meal_entry_id,food_id,grams,energy_kcal,protein_g,carbs_g,fat_g,calculation_version,created_at)
      VALUES('i1','m1','fg',50,50,5,5,1,'v1',?)
    """, (NOW,))
    reject(conn, "cross-user item reparent", "UPDATE meal_entry_items SET meal_entry_id='m2' WHERE id='i1'")
    reject(conn, "infinite meal snapshot", """
      INSERT INTO meal_entry_items(id,meal_entry_id,food_id,grams,energy_kcal,protein_g,carbs_g,fat_g,calculation_version,created_at)
      VALUES('iinf','m1','fg',50,1e999,5,5,1,'v1',?)
    """, (NOW,))
    reject(conn, "infinite extended meal nutrient", "INSERT INTO meal_entry_item_nutrients(meal_entry_item_id,nutrient_key,amount,unit,completeness) VALUES('i1','sodium',1e999,'mg','complete')")

    bad_date = '{"localDate":"2026-02-31","occurredAt":"2026-02-31T12:00:00Z","mealType":"lunch","items":[{"foodId":"fg","grams":50,"calculationVersion":"v1"}]}'
    reject(conn, "invalid calendar occurredAt", """
      INSERT INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('abad','u1','meal-log','MealLogActionV1','h',?,'proposed','idem',?)
    """, (bad_date, NOW))

    good = '{"localDate":"2026-09-02","occurredAt":"2026-09-02T12:00:00Z","mealType":"lunch","items":[{"foodId":"fg","grams":50,"calculationVersion":"v1"}]}'
    conn.execute("""
      INSERT INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('a1','u1','meal-log','MealLogActionV1','h1',?,'proposed','idem1',?)
    """, (good, NOW))
    reject(conn, "proposed with confirmed_at", "UPDATE ai_actions SET confirmed_at=? WHERE id='a1'", (NOW,))
    reject(conn, "proposed with applied_at", "UPDATE ai_actions SET applied_at=? WHERE id='a1'", (NOW,))
    conn.execute("UPDATE ai_actions SET status='confirmed', confirmed_at=? WHERE id='a1'", (NOW,))
    reject(conn, "confirmed with applied timestamp but unchanged status", "UPDATE ai_actions SET applied_at=? WHERE id='a1'", (NOW,))

    print('REVIEW9_CONTRACTS_OK')

if __name__ == '__main__':
    main()
