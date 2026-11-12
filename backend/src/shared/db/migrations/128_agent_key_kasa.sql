-- Ajan anahtarına ÖZEL FİNANS KASASI izni (bkz. docs/hermes-entegrasyon.md → "Kasa izni").
-- Varsayılan NULL = kasa kapalı (anahtar /api/pf/* için 404 alır, kasanın varlığını bile göremez).
-- İzni yalnız SAHİP (users.is_owner=1) verir; kasa_granted_by o sahibi tutar ve her istekte yeniden
-- denetlenir: sahiplik düşerse ya da hesap askıya alınırsa izin kendiliğinden geçersizleşir.
ALTER TABLE agent_api_keys ADD COLUMN kasa_access TEXT CHECK(kasa_access IN ('read','write'));
ALTER TABLE agent_api_keys ADD COLUMN kasa_granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE agent_api_keys ADD COLUMN kasa_granted_at TEXT;
