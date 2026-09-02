#!/usr/bin/env python3
"""Adversarial SQLite checks for Codex review 8 hardening."""

from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "db" / "migrations"
NOW = "2026-09-02T15:30:00.000Z"


def expect_rejected(conn: sqlite3.Connection, label: str, sql: str, params: tuple = ()) -> None:
    try:
        conn.execute(sql, params)
    except (sqlite3.IntegrityError, sqlite3.OperationalError):
        return
    raise AssertionError(f"Expected schema to reject: {label}")


def apply_migrations(conn: sqlite3.Connection) -> None:
    for migration in sorted(MIGRATIONS.glob("*.sql")):
        conn.executescript(migration.read_text(encoding="utf-8"))


def add_food(conn: sqlite3.Connection, food_id: str, owner: str | None, name: str) -> None:
    conn.execute("""
      INSERT INTO foods (
        id,owner_user_id,name,normalized_name,energy_kcal_100g,protein_g_100g,carbs_g_100g,
        fat_g_100g,source_provider,verified_at,created_at,updated_at
      ) VALUES (?,?,?,?,100,10,10,2,'manual-verified',?,?,?)
    """, (food_id, owner, name, name.lower(), NOW, NOW, NOW))


def main() -> None:
    conn = sqlite3.connect(":memory:", isolation_level=None)
    conn.execute("PRAGMA foreign_keys = ON")
    apply_migrations(conn)

    for user_id, subject in (("user-1", "subject-1"), ("user-2", "subject-2")):
        conn.execute(
            "INSERT INTO users (id,external_subject,created_at,updated_at) VALUES (?,?,?,?)",
            (user_id, subject, NOW, NOW),
        )

    expect_rejected(conn, "blank dietary rule id", """
      INSERT INTO dietary_rule_catalog (id,canonical_name,created_at) VALUES ('   ','Vegetarian',?)
    """, (NOW,))
    expect_rejected(conn, "blank dietary rule name", """
      INSERT INTO dietary_rule_catalog (id,canonical_name,created_at) VALUES ('vegetarian','   ',?)
    """, (NOW,))
    conn.execute(
        "INSERT INTO dietary_rule_catalog (id,canonical_name,created_at) VALUES ('vegetarian','Vegetarian',?)",
        (NOW,),
    )

    conn.execute(
        "INSERT INTO scientific_references (id,title,citation,created_at) VALUES ('ref-r8','Reference R8','Citation R8',?)",
        (NOW,),
    )
    conn.execute("""
      INSERT INTO goals (
        id,user_id,effective_from,energy_kcal,protein_g,carbs_g,fat_g,source,
        calculation_method,calculation_version,calculation_inputs_json,reference_ids_json,created_at
      ) VALUES (
        'goal-r8','user-1','2026-09-02',2000,120,220,70,'arven-calculated',
        'mifflin','v1','{"weightKg":80}','["ref-r8"]',?
      )
    """, (NOW,))
    expect_rejected(conn, "rewrite used scientific evidence", """
      UPDATE scientific_references SET citation='Different evidence' WHERE id='ref-r8'
    """)

    add_food(conn, "food-global", None, "Global Food")
    add_food(conn, "food-private", "user-2", "Private Food")

    conn.execute("""
      INSERT INTO meal_entries (id,user_id,local_date,meal_type,occurred_at,created_at,updated_at)
      VALUES ('meal-r8','user-1','2026-09-02','lunch',?,?,?)
    """, (NOW, NOW, NOW))
    conn.execute("""
      INSERT INTO meal_entry_items (
        id,meal_entry_id,food_id,grams,energy_kcal,protein_g,carbs_g,fat_g,calculation_version,created_at
      ) VALUES ('meal-item-r8','meal-r8','food-global',50,50,5,5,1,'v1',?)
    """, (NOW,))
    expect_rejected(conn, "move globally sourced meal to another user", """
      UPDATE meal_entries SET user_id='user-2' WHERE id='meal-r8'
    """)

    expect_rejected(conn, "manual meal infinity", """
      INSERT INTO meal_entry_items (
        id,meal_entry_id,food_id,grams,energy_kcal,protein_g,carbs_g,fat_g,calculation_version,created_at
      ) VALUES ('meal-inf','meal-r8','food-global',1e999,50,5,5,1,'v1',?)
    """, (NOW,))
    expect_rejected(conn, "manual water infinity", """
      INSERT INTO water_logs (id,user_id,occurred_at,local_date,milliliters,created_at)
      VALUES ('water-inf','user-1',?,'2026-09-02',1e999,?)
    """, (NOW, NOW))

    expect_rejected(conn, "null partial source nutrient", """
      INSERT INTO food_nutrients (food_id,nutrient_key,amount_per_100g,unit,completeness)
      VALUES ('food-global','sodium',NULL,'mg','partial')
    """)
    expect_rejected(conn, "null partial snapshot nutrient", """
      INSERT INTO meal_entry_item_nutrients (meal_entry_item_id,nutrient_key,amount,unit,completeness)
      VALUES ('meal-item-r8','sodium',NULL,'mg','partial')
    """)

    valid_meal_payload = (
        '{"localDate":"2026-09-02","occurredAt":"2026-09-02T15:30:00Z",'
        '"mealType":"lunch","items":[{"foodId":"food-global","grams":50,"calculationVersion":"v1"}]}'
    )
    expect_rejected(conn, "direct rejected AI action insert", """
      INSERT INTO ai_actions (
        id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at
      ) VALUES ('ai-direct-reject','user-1','meal-log','MealLogActionV1','h1',?,'rejected','i1',?)
    """, (valid_meal_payload, NOW))
    expect_rejected(conn, "direct failed AI action insert", """
      INSERT INTO ai_actions (
        id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at
      ) VALUES ('ai-direct-fail','user-1','meal-log','MealLogActionV1','h2',?,'failed','i2',?)
    """, (valid_meal_payload, NOW))

    for bad_time in ("0", "12:00"):
        bad_payload = (
            '{"localDate":"2026-09-02","occurredAt":"' + bad_time + '",'
            '"mealType":"lunch","items":[{"foodId":"food-global","grams":50,"calculationVersion":"v1"}]}'
        )
        expect_rejected(conn, f"non-canonical occurredAt {bad_time}", """
          INSERT INTO ai_actions (
            id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at
          ) VALUES (?,?,?,?,? ,?,'proposed',?,?)
        """, (f"ai-time-{bad_time}", "user-1", "meal-log", "MealLogActionV1", f"hash-{bad_time}", bad_payload, f"idem-{bad_time}", NOW))

    duplicate_payload = (
        '{"localDate":"2026-09-02","occurredAt":"2026-09-02T15:30:00Z",'
        '"mealType":"lunch","items":[{"foodId":"food-global","foodId":"food-private",'
        '"grams":50,"grams":1e999,"calculationVersion":"v1"}]}'
    )
    expect_rejected(conn, "duplicate JSON object keys", """
      INSERT INTO ai_actions (
        id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at
      ) VALUES ('ai-dup','user-1','meal-log','MealLogActionV1','hash-dup',?,'proposed','idem-dup',?)
    """, (duplicate_payload, NOW))

    conn.execute("""
      INSERT INTO ai_actions (
        id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at
      ) VALUES ('ai-active','user-1','meal-log','MealLogActionV1','hash-active',?,'proposed','idem-active',?)
    """, (valid_meal_payload, NOW))
    expect_rejected(conn, "delete food referenced by active AI action", "DELETE FROM foods WHERE id='food-global'")

    conn.execute("UPDATE ai_actions SET status='confirmed', confirmed_at=? WHERE id='ai-active'", (NOW,))
    conn.execute("UPDATE ai_actions SET status='applied', applied_at=? WHERE id='ai-active'", (NOW,))

    print("REVIEW8_CONTRACTS_OK")


if __name__ == "__main__":
    main()
