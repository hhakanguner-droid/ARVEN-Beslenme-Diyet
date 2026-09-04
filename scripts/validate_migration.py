#!/usr/bin/env python3
from __future__ import annotations
import glob, sqlite3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=sorted(glob.glob(str(ROOT/'db'/'migrations'/'*.sql')))
def reject(conn,sql,params=()):
    try: conn.execute(sql,params)
    except (sqlite3.IntegrityError,sqlite3.OperationalError): return
    raise AssertionError(f'expected rejection: {sql}')
def main():
    assert [Path(p).name for p in MIGRATIONS]==['0001_initial.sql','0002_phase2_identity.sql','0003_phase3_planning.sql']
    combined='\n'.join(Path(p).read_text(encoding='utf-8') for p in MIGRATIONS)
    assert 'CREATE TRIGGER' not in combined.upper()
    assert 'CREATE TABLE ai_actions' not in combined
    assert 'meal_entry_items' not in combined
    c=sqlite3.connect(':memory:');c.execute('PRAGMA foreign_keys=ON')
    for p in MIGRATIONS: c.executescript(Path(p).read_text(encoding='utf-8'))
    now='2026-09-02T20:00:00.000Z'
    for u in ('u1','u2'): c.execute('INSERT INTO users(subject,timezone,created_at,updated_at) VALUES(?,?,?,?)',(u,'Europe/Istanbul',now,now))
    c.execute('INSERT INTO profiles(user_subject,updated_at) VALUES(?,?)',('u1',now));reject(c,"UPDATE users SET subject='other' WHERE subject='u1'")
    c.execute("INSERT INTO goal_versions(id,user_subject,source,energy_kcal,protein_g,carbs_g,fat_g,created_at) VALUES('g1','u1','manual',2000,120,200,70,?)",(now,));reject(c,"INSERT INTO user_current_goal(user_subject,goal_version_id,selected_at) VALUES('u2','g1',?)",(now,))
    reject(c,"INSERT INTO ai_action_proposals(id,user_subject,action_type,schema_version,payload_json,payload_sha256,idempotency_key,created_at) VALUES('bad','u1','meal-log','WaterLogActionV1','{}',?,'bad-k',?)",('b'*64,now))
    c.execute("INSERT INTO ai_action_proposals(id,user_subject,action_type,schema_version,payload_json,payload_sha256,idempotency_key,created_at) VALUES('a1','u1','water-log','WaterLogActionV1','{}',?,'k1',?)",('a'*64,now))
    c.execute("INSERT INTO ai_action_decisions(action_id,user_subject,decision,decided_at) VALUES('a1','u1','confirmed',?)",(now,))
    c.execute("INSERT INTO nutrition_events(id,user_subject,event_type,occurred_at,local_date,payload_json,created_at) VALUES('e1','u1','water-log',?,'2026-09-02','{}',?)",(now,now))
    c.execute("INSERT INTO nutrition_events(id,user_subject,event_type,occurred_at,local_date,payload_json,created_at) VALUES('meal-e','u1','meal-log',?,'2026-09-02','{}',?)",(now,now))
    reject(c,"INSERT INTO ai_action_outcomes(action_id,user_subject,action_type,confirmation_marker,outcome,result_event_id,recorded_at) VALUES('a1','u2','water-log','confirmed','applied','e1',?)",(now,))
    reject(c,"INSERT INTO ai_action_outcomes(action_id,user_subject,action_type,confirmation_marker,outcome,result_event_id,recorded_at) VALUES('a1','u1','water-log','confirmed','applied','meal-e',?)",(now,))
    c.execute("INSERT INTO ai_action_outcomes(action_id,user_subject,action_type,confirmation_marker,outcome,result_event_id,recorded_at) VALUES('a1','u1','water-log','confirmed','applied','e1',?)",(now,))
    reject(c,"INSERT INTO ai_action_outcomes(action_id,user_subject,action_type,confirmation_marker,outcome,failure_code,recorded_at) VALUES('a1','u1','water-log','confirmed','failed','oops',?)",(now,))
    c.execute("INSERT INTO ai_action_proposals(id,user_subject,action_type,schema_version,payload_json,payload_sha256,idempotency_key,created_at) VALUES('a2','u1','water-log','WaterLogActionV1','{}',?,'k2',?)",('c'*64,now))
    c.execute("INSERT INTO ai_action_decisions(action_id,user_subject,decision,decided_at) VALUES('a2','u1','rejected',?)",(now,))
    reject(c,"INSERT INTO ai_action_outcomes(action_id,user_subject,action_type,confirmation_marker,outcome,failure_code,recorded_at) VALUES('a2','u1','water-log','confirmed','failed','nope',?)",(now,))
    reject(c,"INSERT INTO food_versions(id,food_key,version,name,normalized_name,energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,allergen_data_status,dietary_safety_data_status,source_provider,verified_at,created_at) VALUES('f1','food',1,'Food','food','oops',1,1,1,'unknown','unknown','manual-verified',?,?)",(now,now))
    reject(c,"INSERT INTO safety_acknowledgements(id,user_subject,acknowledgement_type,policy_version,acknowledged_at,created_at) VALUES('ack-bad','u1','not-a-real-type','v1',?,?)",(now,now))
    reject(c,"INSERT INTO safety_acknowledgements(id,user_subject,acknowledgement_type,policy_version,acknowledged_at,created_at) VALUES('ack-bad2','u1','non-diagnostic-health-boundary','   ',?,?)",(now,now))
    c.execute("INSERT INTO safety_acknowledgements(id,user_subject,acknowledgement_type,policy_version,acknowledged_at,created_at) VALUES('ack1','u1','non-diagnostic-health-boundary','v1',?,?)",(now,now))
    reject(c,"INSERT INTO user_ui_preferences(user_subject,energy_unit,updated_at) VALUES('u1','oz',?)",(now,))
    c.execute("INSERT INTO user_ui_preferences(user_subject,energy_unit,updated_at) VALUES('u1','kj',?)",(now,))
    c.execute("INSERT INTO meal_plan_versions(id,user_subject,slots_json,created_at) VALUES('mp1','u1','[]',?)",(now,))
    reject(c,"INSERT INTO user_current_meal_plan(user_subject,meal_plan_version_id,selected_at) VALUES('u2','mp1',?)",(now,))
    c.execute("INSERT INTO user_current_meal_plan(user_subject,meal_plan_version_id,selected_at) VALUES('u1','mp1',?)",(now,))
    print('CLEAN_V1_MIGRATION_OK')
if __name__=='__main__':main()
