#!/usr/bin/env python3
"""Cross-cutting persistence invariants for ARVEN Beslenme & Diyet.

This suite intentionally validates invariant *classes* across the schema so a
review cannot reveal the same ownership/precision/provenance bug one table at a
time.
"""

from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "db" / "migrations"


def apply_migrations(conn: sqlite3.Connection) -> None:
    for path in sorted(MIGRATIONS.glob("*.sql")):
        conn.executescript(path.read_text(encoding="utf-8"))


def must_fail(conn: sqlite3.Connection, sql: str, params=()) -> None:
    try:
        conn.execute(sql, params)
    except sqlite3.DatabaseError:
        return
    raise AssertionError(f"expected statement to fail: {sql}")


def main() -> None:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    apply_migrations(conn)

    now = "2026-09-02T18:45:00Z"
    conn.executemany(
        "INSERT INTO users(id,external_subject,created_at,updated_at) VALUES(?,?,?,?)",
        [("u1", "subject-1", now, now), ("u2", "subject-2", now, now)],
    )

    # Ownership matrix: every remaining user-owned root is non-transferable.
    conn.execute("INSERT INTO profiles(user_id,updated_at) VALUES('u1',?)", (now,))
    must_fail(conn, "UPDATE profiles SET user_id='u2' WHERE user_id='u1'")

    conn.execute("INSERT INTO user_ui_preferences(user_id,updated_at) VALUES('u1',?)", (now,))
    must_fail(conn, "UPDATE user_ui_preferences SET user_id='u2' WHERE user_id='u1'")

    conn.execute(
        "INSERT INTO food_source_preferences(user_id,provider,enabled,priority,updated_at) VALUES('u1','usda',1,1,?)",
        (now,),
    )
    must_fail(conn, "UPDATE food_source_preferences SET user_id='u2' WHERE user_id='u1' AND provider='usda'")

    conn.execute(
        "INSERT INTO assessment_snapshots(id,user_id,schema_version,answers_json,completed_at,created_at) VALUES('assessment-1','u1','v1','{}',?,?)",
        (now, now),
    )
    must_fail(conn, "UPDATE assessment_snapshots SET user_id='u2' WHERE id='assessment-1'")

    # A verified food with an extended nutrient. Keep source values deliberately
    # fractional so early-rounding regressions are visible.
    conn.execute(
        """
        INSERT INTO foods(
          id,name,normalized_name,energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,fiber_g_100g,
          source_provider,source_external_id,verified_at,created_at,updated_at
        ) VALUES('precision-food','Precision food','precision food',49,1,0,0,NULL,'usda','precision-1',?,?,?)
        """,
        (now, now, now),
    )
    conn.execute(
        "INSERT INTO food_nutrients(food_id,nutrient_key,amount_per_100g,unit,completeness) VALUES('precision-food','sodium',1,'mg','complete')"
    )
    conn.execute(
        "INSERT INTO meal_entries(id,user_id,local_date,meal_type,occurred_at,created_at,updated_at) VALUES('meal-1','u1','2026-09-02','lunch',?,?,?)",
        (now, now, now),
    )

    # 33.333 g requires >3 decimal materialization precision for 1 mg/100 g.
    grams = 33.333
    conn.execute(
        """
        INSERT INTO meal_entry_items(
          id,meal_entry_id,food_id,grams,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,calculation_version,created_at
        ) VALUES('item-precision','meal-1','precision-food',?,?,?,?,?,NULL,'deterministic-v1',?)
        """,
        (grams, round(49 * grams / 100, 6), round(1 * grams / 100, 6), 0, 0, now),
    )
    amount = conn.execute(
        "SELECT amount FROM meal_entry_item_nutrients WHERE meal_entry_item_id='item-precision' AND nutrient_key='sodium'"
    ).fetchone()[0]
    assert abs(amount - 0.33333) < 1e-9, amount

    # Historical snapshots are immutable; correction is replace/re-log, never a
    # partial parent edit that leaves child nutrient snapshots stale.
    must_fail(conn, "UPDATE meal_entry_items SET grams=10 WHERE id='item-precision'")
    must_fail(conn, "UPDATE meal_entry_item_nutrients SET amount=99 WHERE meal_entry_item_id='item-precision' AND nutrient_key='sodium'")

    # Once a verified source has produced history, its extended nutrient set is
    # versioned/immutable. Silent provenance rewrites are impossible.
    must_fail(conn, "UPDATE food_nutrients SET amount_per_100g=2 WHERE food_id='precision-food' AND nutrient_key='sodium'")
    must_fail(conn, "DELETE FROM food_nutrients WHERE food_id='precision-food' AND nutrient_key='sodium'")
    must_fail(conn, "INSERT INTO food_nutrients(food_id,nutrient_key,amount_per_100g,unit,completeness) VALUES('precision-food','calcium',1,'mg','complete')")

    # Per-item storage precision must preserve aggregate truth. 100 x 1 g at
    # 49 kcal/100g must sum to 49 kcal, not 0 after per-item integer rounding.
    conn.execute(
        "INSERT INTO meal_entries(id,user_id,local_date,meal_type,occurred_at,created_at,updated_at) VALUES('meal-2','u1','2026-09-02','dinner',?,?,?)",
        (now, now, now),
    )
    for index in range(100):
        conn.execute(
            """
            INSERT INTO meal_entry_items(
              id,meal_entry_id,food_id,grams,energy_kcal,protein_g,carbs_g,fat_g,fiber_g,calculation_version,created_at
            ) VALUES(?, 'meal-2','precision-food',1,0.49,0.01,0,0,NULL,'deterministic-v1',?)
            """,
            (f"tiny-{index}", now),
        )
    total = conn.execute("SELECT SUM(energy_kcal) FROM meal_entry_items WHERE meal_entry_id='meal-2'").fetchone()[0]
    assert abs(total - 49.0) < 1e-8, total

    print("INVARIANT_HARDENING_OK")


if __name__ == "__main__":
    main()
