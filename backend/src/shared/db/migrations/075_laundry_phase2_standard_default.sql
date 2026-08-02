-- 074 sonrasında eski baseline koduyla açılmış bir sunucuda Faz 2 ayarları
-- yanlışlıkla premiuma çevrilmiş olabilir. İlk varsayılanı bir kez düzelt.
UPDATE laundry_block_config
SET is_premium=0, updated_by=NULL, updated_at=datetime('now')
WHERE block IN ('F2A', 'F2B', 'F2C');
