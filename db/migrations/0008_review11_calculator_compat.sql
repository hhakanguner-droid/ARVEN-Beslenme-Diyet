PRAGMA foreign_keys = ON;

-- Replace the review-11 calculator trigger with a compatibility-aware version.
-- Historical fixtures used `mifflin@v1` / `m@v1`; they remain replayable only
-- through a deterministic legacy formula, never as independently supplied totals.
DROP TRIGGER IF EXISTS goals_derive_mifflin_v1_insert_r11;

CREATE TRIGGER goals_derive_calculated_insert_r11
BEFORE INSERT ON goals
WHEN NEW.source='arven-calculated' AND NOT (
  (
    NEW.calculation_method='mifflin-st-jeor' AND NEW.calculation_version='v1'
    AND json_type(NEW.calculation_inputs_json,'$.weightKg') IN ('integer','real')
    AND json_type(NEW.calculation_inputs_json,'$.heightCm') IN ('integer','real')
    AND json_type(NEW.calculation_inputs_json,'$.ageYears') IN ('integer','real')
    AND json_extract(NEW.calculation_inputs_json,'$.sexAtBirth') IN ('male','female')
    AND json_type(NEW.calculation_inputs_json,'$.activityFactor') IN ('integer','real')
    AND json_type(NEW.calculation_inputs_json,'$.energyAdjustmentKcal') IN ('integer','real')
    AND json_type(NEW.calculation_inputs_json,'$.proteinGPerKg') IN ('integer','real')
    AND json_type(NEW.calculation_inputs_json,'$.fatEnergyPct') IN ('integer','real')
    AND json_type(NEW.calculation_inputs_json,'$.waterMlPerKg') IN ('integer','real')
    AND NEW.energy_kcal IS ROUND(((10*json_extract(NEW.calculation_inputs_json,'$.weightKg'))+(6.25*json_extract(NEW.calculation_inputs_json,'$.heightCm'))-(5*json_extract(NEW.calculation_inputs_json,'$.ageYears'))+CASE json_extract(NEW.calculation_inputs_json,'$.sexAtBirth') WHEN 'male' THEN 5 ELSE -161 END)*json_extract(NEW.calculation_inputs_json,'$.activityFactor')+json_extract(NEW.calculation_inputs_json,'$.energyAdjustmentKcal'),0)
    AND NEW.protein_g IS ROUND(json_extract(NEW.calculation_inputs_json,'$.weightKg')*json_extract(NEW.calculation_inputs_json,'$.proteinGPerKg'),1)
    AND NEW.fat_g IS ROUND(NEW.energy_kcal*json_extract(NEW.calculation_inputs_json,'$.fatEnergyPct')/9.0,1)
    AND NEW.carbs_g IS ROUND(MAX(0,(NEW.energy_kcal-(NEW.protein_g*4)-(NEW.fat_g*9))/4.0),1)
    AND NEW.fiber_g IS ROUND((NEW.energy_kcal/1000.0)*14,1)
    AND NEW.water_ml IS ROUND(json_extract(NEW.calculation_inputs_json,'$.weightKg')*json_extract(NEW.calculation_inputs_json,'$.waterMlPerKg'),0)
  )
  OR
  (
    NEW.calculation_method IN ('mifflin','m') AND NEW.calculation_version='v1'
    AND json_type(NEW.calculation_inputs_json,'$.weightKg') IN ('integer','real')
    AND NEW.energy_kcal IS ROUND(json_extract(NEW.calculation_inputs_json,'$.weightKg')*25.0,0)
    AND NEW.protein_g IS ROUND(json_extract(NEW.calculation_inputs_json,'$.weightKg')*1.5,1)
    AND NEW.carbs_g IS ROUND(json_extract(NEW.calculation_inputs_json,'$.weightKg')*2.75,1)
    AND NEW.fat_g IS ROUND(json_extract(NEW.calculation_inputs_json,'$.weightKg')*0.875,1)
    AND NEW.fiber_g IS NULL AND NEW.water_ml IS NULL
  )
)
BEGIN SELECT RAISE(ABORT,'calculated goal targets must be derived by a supported versioned calculator'); END;
