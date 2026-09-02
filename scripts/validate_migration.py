#!/usr/bin/env python3
"""Exercise the initial SQLite/D1 schema's safety and numeric-integrity boundaries."""

from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "db" / "migrations" / "0001_initial.sql"
NOW = "2026-09-02T00:00:00.000Z"


def expect_rejected(conn: sqlite3.Connection, label: str, sql: str, params: tuple = ()) -> None:
    try:
        conn.execute(sql, params)
    except (sqlite3.IntegrityError, sqlite3.OperationalError):
        return
    raise AssertionError(f"Expected schema to reject: {label}")


def main() -> None:
    conn = sqlite3.connect(":memory:", isolation_level=None)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(MIGRATION.read_text(encoding="utf-8"))

    conn.execute(
        "INSERT INTO users (id, external_subject, created_at, updated_at) VALUES (?,?,?,?)",
        ("user-1", "subject-1", NOW, NOW),
    )

    base_goal = (
        "user-1",
        "2026-09-02",
        2000,
        120,
        220,
        70,
        "manual",
        NOW,
    )
    conn.execute(
        """
        INSERT INTO goals (
          id, user_id, effective_from, energy_kcal, protein_g, carbs_g, fat_g, source, created_at
        ) VALUES ('goal-valid',?,?,?,?,?,?,?,?)
        """,
        base_goal,
    )

    expect_rejected(
        conn,
        "negative optional fibre goal",
        """
        INSERT INTO goals (
          id, user_id, effective_from, energy_kcal, protein_g, carbs_g, fat_g, fiber_g, source, created_at
        ) VALUES ('goal-neg-fiber','user-1','2026-09-02',2000,120,220,70,-1,'manual',?)
        """,
        (NOW,),
    )
    expect_rejected(
        conn,
        "negative optional water goal",
        """
        INSERT INTO goals (
          id, user_id, effective_from, energy_kcal, protein_g, carbs_g, fat_g, water_ml, source, created_at
        ) VALUES ('goal-neg-water','user-1','2026-09-02',2000,120,220,70,-100,'manual',?)
        """,
        (NOW,),
    )

    expect_rejected(
        conn,
        "semantically empty calculated-goal inputs",
        """
        INSERT INTO goals (
          id, user_id, effective_from, energy_kcal, protein_g, carbs_g, fat_g,
          source, calculation_method, calculation_version, calculation_inputs_json,
          reference_ids_json, created_at
        ) VALUES (
          'goal-empty-inputs','user-1','2026-09-02',2000,120,220,70,
          'arven-calculated','mifflin','v1','{ }','["ref-1"]',?
        )
        """,
        (NOW,),
    )
    expect_rejected(
        conn,
        "blank calculated-goal reference id",
        """
        INSERT INTO goals (
          id, user_id, effective_from, energy_kcal, protein_g, carbs_g, fat_g,
          source, calculation_method, calculation_version, calculation_inputs_json,
          reference_ids_json, created_at
        ) VALUES (
          'goal-empty-ref','user-1','2026-09-02',2000,120,220,70,
          'arven-calculated','mifflin','v1','{"weightKg":80}','[""]',?
        )
        """,
        (NOW,),
    )
    conn.execute(
        """
        INSERT INTO goals (
          id, user_id, effective_from, energy_kcal, protein_g, carbs_g, fat_g,
          source, calculation_method, calculation_version, calculation_inputs_json,
          reference_ids_json, created_at
        ) VALUES (
          'goal-calculated-valid','user-1','2026-09-02',2000,120,220,70,
          'arven-calculated','mifflin','v1','{"weightKg":80}','["ref-1"]',?
        )
        """,
        (NOW,),
    )
    expect_rejected(
        conn,
        "invalid provenance on update",
        """
        UPDATE goals SET source='arven-calculated', calculation_method='mifflin', calculation_version='v1',
          calculation_inputs_json='{ }', reference_ids_json='["ref-1"]'
        WHERE id='goal-valid'
        """,
    )

    for food_id, name in (("food-a", "Food A"), ("food-b", "Food B")):
        conn.execute(
            """
            INSERT INTO foods (
              id, name, normalized_name, energy_kcal_100g, protein_g_100g, carbs_g_100g,
              fat_g_100g, source_provider, verified_at, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """,
            (food_id, name, name.lower(), 100, 10, 10, 2, "manual-verified", NOW, NOW, NOW),
        )

    conn.execute(
        "INSERT INTO food_nutrients (food_id,nutrient_key,amount_per_100g,unit,completeness) VALUES ('food-a','sodium',100,'mg','complete')"
    )
    expect_rejected(
        conn,
        "mismatched nutrient key/unit",
        "INSERT INTO food_nutrients (food_id,nutrient_key,amount_per_100g,unit,completeness) VALUES ('food-b','sodium',1,'g','complete')",
    )
    expect_rejected(
        conn,
        "unsupported nutrient key",
        "INSERT INTO food_nutrients (food_id,nutrient_key,amount_per_100g,unit,completeness) VALUES ('food-b','sodum',1,'mg','complete')",
    )

    conn.execute(
        """
        INSERT INTO food_portion_options (
          id, food_id, measure, label, grams_per_unit, source_provider, verified_at, created_at, updated_at
        ) VALUES ('portion-a','food-a','piece','1 adet',50,'manual-verified',?,?,?)
        """,
        (NOW, NOW, NOW),
    )
    conn.execute(
        """
        INSERT INTO meal_entries (id,user_id,local_date,meal_type,occurred_at,created_at,updated_at)
        VALUES ('meal-1','user-1','2026-09-02','lunch',?,?,?)
        """,
        (NOW, NOW, NOW),
    )
    expect_rejected(
        conn,
        "portion option belonging to a different food",
        """
        INSERT INTO meal_entry_items (
          id,meal_entry_id,food_id,portion_option_id,portion_quantity,portion_label,grams,
          energy_kcal,protein_g,carbs_g,fat_g,calculation_version,created_at
        ) VALUES ('item-bad','meal-1','food-b','portion-a',1,'1 adet',50,50,5,5,1,'v1',?)
        """,
        (NOW,),
    )

    expect_rejected(
        conn,
        "AI action applied without confirmation evidence",
        """
        INSERT INTO ai_actions (
          id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,created_at
        ) VALUES ('ai-bad','user-1','meal-log','v1','hash','{}','applied','idem-1',?)
        """,
        (NOW,),
    )
    conn.execute(
        """
        INSERT INTO ai_actions (
          id,user_id,action_type,schema_version,request_hash,payload_json,status,idempotency_key,
          created_at,confirmed_at,applied_at
        ) VALUES ('ai-good','user-1','meal-log','v1','hash2','{}','applied','idem-2',?,?,?)
        """,
        (NOW, NOW, NOW),
    )

    print("MIGRATION_CONTRACTS_OK")


if __name__ == "__main__":
    main()
