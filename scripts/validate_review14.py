#!/usr/bin/env python3
"""Adversarial SQLite checks for Review 14 systemic hardening."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "db" / "migrations"
NOW = "2026-09-02T20:00:00.000Z"
ACTION_TIME = "2026-09-02T20:00:00Z"
LATER = "2026-09-02T20:01:00.000Z"
FRESH = "2026-09-02T20:02:00.000Z"


def reject(conn, label, sql, params=()):
    try:
        conn.execute(sql, params)
    except (sqlite3.IntegrityError, sqlite3.OperationalError):
        return
    raise AssertionError(f"Expected rejection: {label}")


def apply(conn):
    for path in sorted(MIGRATIONS.glob("*.sql")):
        conn.executescript(path.read_text(encoding="utf-8"))


def add_food(conn, food_id, energy=100, allergen_status="verified", dietary_status="verified"):
    conn.execute("""
      INSERT INTO foods(
        id,name,normalized_name,allergen_data_status,dietary_safety_data_status,
        energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,fiber_g_100g,
        source_provider,verified_at,created_at,updated_at
      ) VALUES(?,?,?,?,?, ?,10,20,5,2,'manual-verified',?,?,?)
    """, (food_id, food_id, food_id, allergen_status, dietary_status, energy, NOW, NOW, NOW))


def add_supported_goal(conn, goal_id, user_id):
    inputs = '{"weightKg":80,"heightCm":180,"ageYears":40,"sexAtBirth":"male","activityFactor":1.2,"energyAdjustmentKcal":0,"proteinGPerKg":1.5,"fatEnergyPct":0.3,"waterMlPerKg":30}'
    conn.execute("""
      INSERT INTO goals(
        id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,water_ml,
        source,calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at
      ) VALUES(?,?, '2026-09-02',2076,120,243.3,69.2,29.1,2400,
        'arven-calculated','mifflin-st-jeor','v1',?,'["mifflin-1990"]',?)
    """, (goal_id, user_id, inputs, NOW))


def main():
    conn = sqlite3.connect(":memory:", isolation_level=None)
    conn.execute("PRAGMA foreign_keys=ON")
    apply(conn)
    for uid in ("u1", "u2"):
        conn.execute("INSERT INTO users(id,external_subject,created_at,updated_at) VALUES(?,?,?,?)", (uid, uid, NOW, NOW))

    reject(conn, "NULL assessment identity", "INSERT INTO assessment_snapshots(id,user_id,schema_version,answers_json,completed_at,created_at) VALUES(NULL,'u1','v1','{}',?,?)", (NOW, NOW))
    reject(conn, "NULL meal identity", "INSERT INTO meal_entries(id,user_id,local_date,meal_type,occurred_at,created_at,updated_at) VALUES(NULL,'u1','2026-09-02','lunch',?,?,?)", (NOW, NOW, NOW))
    reject(conn, "invalid assessment completion time", "INSERT INTO assessment_snapshots(id,user_id,schema_version,answers_json,completed_at,created_at) VALUES('bad-a','u1','v1','{}','0',?)", (NOW,))
    conn.execute("INSERT INTO assessment_snapshots(id,user_id,schema_version,answers_json,completed_at,created_at) VALUES('a1','u1','v1','{}',?,?)", (NOW, NOW))
    reject(conn, "REPLACE assessment ownership", "INSERT OR REPLACE INTO assessment_snapshots(id,user_id,schema_version,answers_json,completed_at,created_at) VALUES('a1','u2','v1','{}',?,?)", (NOW, NOW))

    conn.execute("INSERT INTO scientific_references(id,title,citation,created_at) VALUES('mifflin-1990','Mifflin','Citation',?)", (NOW,))
    add_supported_goal(conn, "g1", "u1")
    add_supported_goal(conn, "g2", "u2")
    reject(conn, "new legacy calculator", """
      INSERT INTO goals(id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,source,calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at)
      VALUES('legacy','u2','2026-10-01',2000,120,220,70,'arven-calculated','m','v1','{"weightKg":80}','["mifflin-1990"]',?)
    """, (NOW,))
    allocation_json = '[{"mealType":"lunch","energyShareBps":10000}]'
    conn.execute("INSERT INTO goal_meal_allocations(goal_id,allocations_json,updated_at) VALUES('g1',?,?)", (allocation_json, NOW))
    reject(conn, "allocation parent transfer", "UPDATE goal_meal_allocations SET goal_id='g2' WHERE goal_id='g1'")

    add_food(conn, "food-a")
    add_food(conn, "food-b")
    conn.execute("INSERT INTO meal_entries(id,user_id,local_date,meal_type,occurred_at,created_at,updated_at) VALUES('m1','u1','2026-09-02','lunch',?,?,?)", (NOW, NOW, NOW))
    conn.execute("""
      INSERT INTO meal_entry_items(id,meal_entry_id,food_id,grams,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,calculation_version,created_at)
      VALUES('i1','m1','food-b',50,50,5,10,2.5,1,'v1',?)
    """, (NOW,))
    reject(conn, "used core food truth rewrite", "UPDATE foods SET energy_kcal_100g=999,verified_at=? WHERE id='food-b'", (FRESH,))
    conn.execute("INSERT INTO food_nutrients(food_id,nutrient_key,amount_per_100g,unit,completeness) VALUES('food-a','sodium',100,'mg','complete')")
    reject(conn, "nutrient reparent into used food", "UPDATE food_nutrients SET food_id='food-b' WHERE food_id='food-a' AND nutrient_key='sodium'")

    conn.execute("INSERT INTO meal_entries(id,user_id,local_date,meal_type,occurred_at,created_at,updated_at) VALUES('m2','u2','2026-09-02','lunch',?,?,?)", (NOW, NOW, NOW))
    reject(conn, "REPLACE historical meal item", """
      INSERT OR REPLACE INTO meal_entry_items(id,meal_entry_id,food_id,grams,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,calculation_version,created_at)
      VALUES('i1','m2','food-b',25,25,2.5,5,1.25,0.5,'v1',?)
    """, (NOW,))

    reject(conn, "unverified natural portion claim", """
      INSERT INTO meal_entry_items(id,meal_entry_id,food_id,portion_quantity,portion_label,grams,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,calculation_version,created_at)
      VALUES('fake-natural','m1','food-a',1,'1 dilim',50,50,5,10,2.5,1,'v1',?)
    """, (NOW,))

    meal_payload = '{"localDate":"2026-09-02","occurredAt":"' + ACTION_TIME + '","mealType":"lunch","items":[{"foodId":"food-a","grams":50,"calculationVersion":"v1"}]}'
    conn.execute("""
      INSERT INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('proposal','u1','meal-log','MealLogActionV1','h1',?,'proposed','proposal',?)
    """, (meal_payload, NOW))
    reject(conn, "proposal core food rewrite", "UPDATE foods SET energy_kcal_100g=120,verified_at=? WHERE id='food-a'", (FRESH,))

    conn.execute("INSERT INTO allergen_catalog(id,canonical_name,created_at) VALUES('milk','Milk',?)", (NOW,))
    conn.execute("INSERT INTO user_allergies(user_id,allergen_id,active,created_at) VALUES('u1','milk',1,?)", (NOW,))
    add_food(conn, "milk-food", allergen_status="unknown")
    conn.execute("INSERT INTO food_allergens(food_id,allergen_id,source_provider,verified_at) VALUES('milk-food','milk','manual-verified',?)", (NOW,))
    conn.execute("UPDATE foods SET allergen_data_status='verified' WHERE id='milk-food'")
    milk_payload = '{"localDate":"2026-09-02","occurredAt":"' + ACTION_TIME + '","mealType":"lunch","items":[{"foodId":"milk-food","grams":50,"calculationVersion":"v1"}]}'
    reject(conn, "allergen-conflicting proposal", """
      INSERT INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('unsafe','u1','meal-log','MealLogActionV1','h2',?,'proposed','unsafe',?)
    """, (milk_payload, NOW))

    water_payload = '{"localDate":"2026-09-02","occurredAt":"' + ACTION_TIME + '","milliliters":250}'
    conn.execute("""
      INSERT INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('water-action','u1','water-log','WaterLogActionV1','h3',?,'proposed','water-action',?)
    """, (water_payload, NOW))
    conn.execute("UPDATE ai_actions SET status='confirmed',confirmed_at=? WHERE id='water-action'", (NOW,))
    reject(conn, "apply without persisted mutation", "UPDATE ai_actions SET status='applied',applied_at=? WHERE id='water-action'", (LATER,))
    conn.execute("INSERT INTO water_logs(id,user_id,occurred_at,local_date,milliliters,created_at,ai_action_id) VALUES('w1','u1',?,'2026-09-02',250,?,'water-action')", (ACTION_TIME, NOW))
    conn.execute("UPDATE ai_actions SET status='applied',applied_at=? WHERE id='water-action'", (LATER,))
    reject(conn, "second persisted result for action", "INSERT INTO water_logs(id,user_id,occurred_at,local_date,milliliters,created_at,ai_action_id) VALUES('w2','u1',?,'2026-09-02',250,?,'water-action')", (ACTION_TIME, NOW))
    reject(conn, "delete applied mutation receipt", "DELETE FROM water_logs WHERE id='w1'")

    conn.execute("""
      INSERT INTO ai_actions(id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES('fail-action','u1','water-log','WaterLogActionV1','h4',?,'proposed','fail-action',?)
    """, (water_payload, NOW))
    reject(conn, "proposed failure with fake confirmation", "UPDATE ai_actions SET status='failed',confirmed_at=? WHERE id='fail-action'", (NOW,))
    conn.execute("UPDATE ai_actions SET status='failed' WHERE id='fail-action'")

    print('REVIEW14_CONTRACTS_OK')


if __name__ == '__main__':
    main()
