-- Su nakliye tır kaydını personel günlük giriş/güvenlik bildirimiyle birleştirir.

ALTER TABLE water_truck_arrivals
  ADD COLUMN identity_type TEXT NOT NULL DEFAULT 'tc'
  CHECK(identity_type IN ('tc', 'passport'));

ALTER TABLE water_truck_arrivals ADD COLUMN visit_company TEXT;
ALTER TABLE water_truck_arrivals ADD COLUMN host_person_name TEXT;
ALTER TABLE water_truck_arrivals ADD COLUMN host_person_phone TEXT;
ALTER TABLE water_truck_arrivals ADD COLUMN entry_reason TEXT NOT NULL DEFAULT 'SU AMAÇLI NAKLİYE';
ALTER TABLE water_truck_arrivals ADD COLUMN work_area TEXT;
