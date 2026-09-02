#!/usr/bin/env python3
"""Exercise SQLite/D1 migration safety and numeric-integrity boundaries."""

from pathlib import Path
import json
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "db" / "migrations"
NOW = "2026-09-02T00:00:00.000Z"


def expect_rejected(conn: sqlite3.Connection, label: str, sql: str, params: tuple = ()) -> None:
    try:
        conn.execute(sql, params)
    except (sqlite3.IntegrityError, sqlite3.OperationalError):
        return
    raise AssertionError(f"Expected schema to reject: {label}")


def apply_migrations(conn: sqlite3.Connection) -> None:
    for migration in sorted(MIGRATIONS.glob("*.sql")):
        conn.executescript(migration.read_text(encoding="utf-8"))


def main() -> None:
    conn = sqlite3.connect(":memory:", isolation_level=None)
    conn.execute("PRAGMA foreign_keys = ON")
    apply_migrations(conn)

    for user_id, subject in (("user-1", "subject-1"), ("user-2", "subject-2")):
        conn.execute(
            "INSERT INTO users (id, external_subject, created_at, updated_at) VALUES (?,?,?,?)",
            (user_id, subject, NOW, NOW),
        )

    expect_rejected(conn, "blank allergen catalog id", """
      INSERT INTO allergen_catalog (id,canonical_name,created_at)
      VALUES ('   ','Milk',?)
    """, (NOW,))
    expect_rejected(conn, "blank allergen canonical name", """
      INSERT INTO allergen_catalog (id,canonical_name,created_at)
      VALUES ('milk','   ',?)
    """, (NOW,))

    expect_rejected(conn, "blank scientific reference title", """
      INSERT INTO scientific_references (id,title,citation,created_at)
      VALUES ('bad-ref','   ','Citation',?)
    """, (NOW,))
    conn.execute(
        "INSERT INTO scientific_references (id,title,citation,created_at) VALUES ('ref-1','Reference','Citation',?)",
        (NOW,),
    )

    expect_rejected(conn, "unknown goal source", """
      INSERT INTO goals (id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,source,created_at)
      VALUES ('goal-bad-source','user-2','2026-06-01',2000,120,220,70,'arven-calclated',?)
    """, (NOW,))
    expect_rejected(conn, "malformed manual reference JSON", """
      INSERT INTO goals (id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,source,reference_ids_json,created_at)
      VALUES ('goal-bad-json','user-2','2026-06-01',2000,120,220,70,'manual','not-json',?)
    """, (NOW,))

    conn.execute("""
      INSERT INTO goals (
        id,user_id,effective_from,effective_to,energy_kcal,protein_g,carbs_g,fat_g,source,created_at
      ) VALUES ('goal-old','user-1','2026-08-01','2026-08-31',2000,120,220,70,'manual',?)
    """, (NOW,))

    expect_rejected(conn, "semantically empty calculated-goal inputs", """
      INSERT INTO goals (
        id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,source,
        calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at
      ) VALUES ('goal-empty-inputs','user-2','2026-07-01',2000,120,220,70,'arven-calculated','mifflin','v1','{ }','["ref-1"]',?)
    """, (NOW,))
    expect_rejected(conn, "dangling scientific reference id", """
      INSERT INTO goals (
        id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,source,
        calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at
      ) VALUES ('goal-missing-ref','user-2','2026-07-01',2000,120,220,70,'arven-calculated','mifflin','v1','{"weightKg":80}','["missing-ref"]',?)
    """, (NOW,))

    conn.execute("""
      INSERT INTO goals (
        id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,source,
        calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at
      ) VALUES ('goal-current','user-1','2026-09-02',2000,120,220,70,'arven-calculated','mifflin','v1','{"weightKg":80}','["ref-1"]',?)
    """, (NOW,))
    expect_rejected(conn, "mutating calculated target without recalculation", "UPDATE goals SET energy_kcal=9999 WHERE id='goal-current'")
    expect_rejected(conn, "mutating calculated provenance without recalculation", """
      UPDATE goals SET calculation_inputs_json='{"weightKg":81}' WHERE id='goal-current'
    """)
    expect_rejected(conn, "changing calculated goal source in place", "UPDATE goals SET source='manual' WHERE id='goal-current'")
    expect_rejected(conn, "delete referenced scientific reference", "DELETE FROM scientific_references WHERE id='ref-1'")
    expect_rejected(conn, "overlapping active goal interval", """
      INSERT INTO goals (id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,source,created_at)
      VALUES ('goal-overlap','user-1','2026-09-10',1800,100,180,60,'manual',?)
    """, (NOW,))

    expect_rejected(conn, "incomplete meal allocation set", """
      INSERT INTO goal_meal_allocations (goal_id,allocations_json,updated_at)
      VALUES ('goal-current','[{"mealType":"breakfast","energyShareBps":5000}]',?)
    """, (NOW,))
    conn.execute("""
      INSERT INTO goal_meal_allocations (goal_id,allocations_json,updated_at)
      VALUES ('goal-current','[{"mealType":"breakfast","energyShareBps":4000},{"mealType":"lunch","energyShareBps":6000}]',?)
    """, (NOW,))

    expect_rejected(conn, "blank verification timestamp", """
      INSERT INTO foods (
        id,name,normalized_name,energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,
        source_provider,verified_at,created_at,updated_at
      ) VALUES ('food-bad-time','Bad time','bad time',100,10,10,2,'manual-verified','',?,?)
    """, (NOW, NOW))
    expect_rejected(conn, "blank external provider food id", """
      INSERT INTO foods (
        id,name,normalized_name,energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,
        source_provider,source_external_id,verified_at,created_at,updated_at
      ) VALUES ('food-blank-source','Bad source','bad source',100,10,10,2,'usda','   ',?,?,?)
    """, (NOW, NOW, NOW))

    foods = (
        ("food-a", None, "Food A"),
        ("food-b", "user-2", "Private Food B"),
        ("food-d", "user-1", "Private Food D"),
    )
    for food_id, owner, name in foods:
        conn.execute("""
          INSERT INTO foods (
            id,owner_user_id,name,normalized_name,energy_kcal_100g,protein_g_100g,carbs_g_100g,
            fat_g_100g,source_provider,verified_at,created_at,updated_at
          ) VALUES (?,?,?,?,100,10,10,2,'manual-verified',?,?,?)
        """, (food_id, owner, name, name.lower(), NOW, NOW, NOW))

    expect_rejected(conn, "publishing private food by clearing owner", "UPDATE foods SET owner_user_id=NULL WHERE id='food-d'")
    expect_rejected(conn, "changing private food owner", "UPDATE foods SET owner_user_id='user-2' WHERE id='food-d'")

    conn.execute("""
      INSERT INTO meal_entries (id,user_id,local_date,meal_type,occurred_at,created_at,updated_at)
      VALUES ('meal-1','user-1','2026-09-02','lunch',?,?,?)
    """, (NOW, NOW, NOW))
    expect_rejected(conn, "private food owned by another user", """
      INSERT INTO meal_entry_items (
        id,meal_entry_id,food_id,grams,energy_kcal,protein_g,carbs_g,fat_g,calculation_version,created_at
      ) VALUES ('item-bad-owner','meal-1','food-b',50,50,5,5,1,'v1',?)
    """, (NOW,))

    meal_payload = json.dumps({
        "localDate": "2026-09-02",
        "occurredAt": NOW,
        "mealType": "lunch",
        "items": [{"foodId": "food-a", "grams": 50, "calculationVersion": "v1"}],
    }, separators=(",", ":"))
    changed_meal_payload = json.dumps({
        "localDate": "2026-09-02",
        "occurredAt": NOW,
        "mealType": "lunch",
        "items": [{"foodId": "food-a", "grams": 99, "calculationVersion": "v1"}],
    }, separators=(",", ":"))
    private_meal_payload = json.dumps({
        "localDate": "2026-09-02",
        "occurredAt": NOW,
        "mealType": "lunch",
        "items": [{"foodId": "food-b", "grams": 50, "calculationVersion": "v1"}],
    }, separators=(",", ":"))

    expect_rejected(conn, "unsupported AI action type", """
      INSERT INTO ai_actions (id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES ('ai-unknown','user-1','profile-delete','v1','hash-x','{}','proposed','idem-x',?)
    """, (NOW,))
    expect_rejected(conn, "empty payload for declared meal schema", """
      INSERT INTO ai_actions (id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES ('ai-empty','user-1','meal-log','MealLogActionV1','hash-empty','{}','proposed','idem-empty',?)
    """, (NOW,))
    expect_rejected(conn, "meal action referencing another user's private food", """
      INSERT INTO ai_actions (id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES ('ai-private-food','user-1','meal-log','MealLogActionV1','hash-private',?,'proposed','idem-private',?)
    """, (private_meal_payload, NOW))
    expect_rejected(conn, "non-finite meal action grams", """
      INSERT INTO ai_actions (id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES ('ai-inf-meal','user-1','meal-log','MealLogActionV1','hash-inf-meal',
        '{"localDate":"2026-09-02","occurredAt":"2026-09-02T00:00:00Z","mealType":"lunch","items":[{"foodId":"food-a","grams":1e999,"calculationVersion":"v1"}]}',
        'proposed','idem-inf-meal',?)
    """, (NOW,))
    expect_rejected(conn, "non-finite water action quantity", """
      INSERT INTO ai_actions (id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES ('ai-inf-water','user-1','water-log','WaterLogActionV1','hash-inf-water',
        '{"occurredAt":"2026-09-02T00:00:00Z","milliliters":1e999}',
        'proposed','idem-inf-water',?)
    """, (NOW,))
    expect_rejected(conn, "out-of-range finite water action quantity", """
      INSERT INTO ai_actions (id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES ('ai-huge-water','user-1','water-log','WaterLogActionV1','hash-huge-water',
        '{"occurredAt":"2026-09-02T00:00:00Z","milliliters":10001}',
        'proposed','idem-huge-water',?)
    """, (NOW,))
    expect_rejected(conn, "pre-applied AI action insert", """
      INSERT INTO ai_actions (id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at,confirmed_at,applied_at)
      VALUES ('ai-direct','user-1','meal-log','MealLogActionV1','hash-direct',?,'applied','idem-direct',?,?,?)
    """, (meal_payload, NOW, NOW, NOW))

    conn.execute("""
      INSERT INTO ai_actions (id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES ('ai-swap','user-1','meal-log','MealLogActionV1','hash-swap',?,'proposed','idem-swap',?)
    """, (meal_payload, NOW))
    expect_rejected(conn, "changing proposal in the same update that confirms it", """
      UPDATE ai_actions SET payload_json=?, status='confirmed', confirmed_at=? WHERE id='ai-swap'
    """, (changed_meal_payload, NOW))

    conn.execute("""
      INSERT INTO ai_actions (id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES ('ai-good','user-1','meal-log','MealLogActionV1','hash-good',?,'proposed','idem-good',?)
    """, (meal_payload, NOW))
    conn.execute("UPDATE ai_actions SET status='confirmed', confirmed_at=? WHERE id='ai-good'", (NOW,))
    expect_rejected(conn, "changing payload after confirmation", """
      UPDATE ai_actions SET payload_json=?, status='applied', applied_at=? WHERE id='ai-good'
    """, (changed_meal_payload, NOW))
    conn.execute("UPDATE ai_actions SET status='applied', applied_at=? WHERE id='ai-good'", (NOW,))
    expect_rejected(conn, "applied action is terminal", "UPDATE ai_actions SET status='proposed' WHERE id='ai-good'")

    conn.execute("""
      INSERT INTO ai_actions (id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES ('ai-rejected','user-1','meal-log','MealLogActionV1','hash-rejected',?,'proposed','idem-rejected',?)
    """, (meal_payload, NOW))
    conn.execute("UPDATE ai_actions SET status='rejected' WHERE id='ai-rejected'")
    expect_rejected(conn, "rejected action is terminal", "UPDATE ai_actions SET status='proposed' WHERE id='ai-rejected'")

    conn.execute("""
      INSERT INTO ai_actions (id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at)
      VALUES ('ai-failed','user-1','meal-log','MealLogActionV1','hash-failed',?,'proposed','idem-failed',?)
    """, (meal_payload, NOW))
    conn.execute("UPDATE ai_actions SET status='failed' WHERE id='ai-failed'")
    expect_rejected(conn, "failed action is terminal", "UPDATE ai_actions SET status='proposed' WHERE id='ai-failed'")

    medication_table = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_medications'").fetchone()
    assert medication_table is None, "Medication tracking must not exist in the V1 schema"

    print("MIGRATION_CONTRACTS_OK")


if __name__ == "__main__":
    main()
