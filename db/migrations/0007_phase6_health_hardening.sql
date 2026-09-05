PRAGMA foreign_keys = ON;

-- Preserve the exact AI extraction that the user reviewed, plus the corrected/confirmed value.
-- The audit row is owned by the same subject and cascades with account/result deletion so a privacy
-- purge cannot leave health data behind.
CREATE TABLE lab_result_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lab_result_entry_id TEXT NOT NULL,
  user_subject TEXT NOT NULL,
  extracted_marker_name TEXT NOT NULL,
  extracted_value_text TEXT NOT NULL,
  extracted_unit_text TEXT,
  extracted_reference_range_text TEXT,
  confirmed_marker_name TEXT NOT NULL,
  confirmed_value_text TEXT NOT NULL,
  confirmed_unit_text TEXT,
  confirmed_reference_range_text TEXT,
  confirmed_at TEXT NOT NULL,
  FOREIGN KEY (lab_result_entry_id) REFERENCES lab_result_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_subject) REFERENCES users(subject) ON DELETE CASCADE
) STRICT;
CREATE UNIQUE INDEX lab_result_confirmations_entry_idx ON lab_result_confirmations(lab_result_entry_id);
CREATE INDEX lab_result_confirmations_user_idx ON lab_result_confirmations(user_subject, confirmed_at);

CREATE TRIGGER lab_result_capture_confirmation
BEFORE UPDATE OF marker_name, value_text, unit_text, reference_range_text, status ON lab_result_entries
WHEN OLD.status = 'extracted' AND NEW.status = 'confirmed'
BEGIN
  INSERT INTO lab_result_confirmations (
    lab_result_entry_id, user_subject,
    extracted_marker_name, extracted_value_text, extracted_unit_text, extracted_reference_range_text,
    confirmed_marker_name, confirmed_value_text, confirmed_unit_text, confirmed_reference_range_text,
    confirmed_at
  ) VALUES (
    OLD.id, OLD.user_subject,
    OLD.marker_name, OLD.value_text, OLD.unit_text, OLD.reference_range_text,
    NEW.marker_name, NEW.value_text, NEW.unit_text, NEW.reference_range_text,
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

-- A confirmed lab reading is immutable. A later correction must be a new entry so both facts remain auditable.
CREATE TRIGGER lab_result_prevent_confirmed_rewrite
BEFORE UPDATE OF marker_name, value_text, unit_text, reference_range_text, status ON lab_result_entries
WHEN OLD.status = 'confirmed'
BEGIN
  SELECT RAISE(ABORT, 'confirmed lab result entries are immutable');
END;
