# ARVEN Beslenme & Diyet

Kişiselleştirilmiş beslenme planlama, öğün takibi, doğrulanmış besin verisi ve AI destekli beslenme koçluğu için mobile-first PWA.

## Temel prensip

**AI yorumlar ve önerir; sayısal doğruları kod hesaplar.** Kalori, protein, karbonhidrat, yağ, su, kalan hedefler ve ilerleme metrikleri doğrulanmış yapılandırılmış veriden deterministik olarak üretilir.

ARVEN bir tanı veya tedavi ürünü değildir. Tanı koymaz, reçete vermez ve ilaç kullanımı/değişikliği hakkında talimat üretmez. V1 ilaç verisi saklamaz veya ilaç takibi yapmaz. Beslenmeyle ilişkili takviyeler ileride ayrı bir kullanıcı modülü olarak ele alınır.

## Clean V1 mimarisi

İlk bootstrap denemesinde persistence katmanı review-özel SQLite trigger'larıyla gereğinden fazla karmaşıklaştı. Clean V1 bunu sıfırladı:

- Tek, okunabilir D1/SQLite baseline migration; review-numaralı trigger zinciri yok.
- Authenticated external subject doğrudan ownership anahtarı; ayrı ve yeniden bağlanabilir kullanıcı kimliği katmanı yok.
- Besin, doğal porsiyon, bilimsel kaynak ve hesaplanmış hedefler versioned/append-only kayıtlar.
- Bir `food_version`, nutrition + provenance + allergy/dietary safety bilgisinin tam snapshot'ıdır; düzeltme UPDATE değil yeni version üretir.
- Bir `portion_version`, belirli food version için doğrulanmış gram dönüşümüdür; gram eşdeğeri değişirse yeni version oluşur.
- Öğün ve su geçmişi tek atomik `nutrition_events` journal'ında tutulur; silinebilen/reparent edilebilen meal-item child tabloları yoktur.
- AI lifecycle mutable `status` kullanmaz: immutable proposal + immutable decision + tek terminal `ai_action_outcomes` kaydı. `applied` exact nutrition event'e bağlanır, `failed` result event taşıyamaz.
- AI ve client `local_date` seçemez; gün authenticated IANA timezone + nutrition-day başlangıcından server tarafından türetilir.
- ARVEN-calculated hedefler caller tarafından verilmez; `mifflin-st-jeor@v1` hesaplayıcısından server-side türetilir ve kullanılan bilimsel kaynakların tam snapshot'ı goal version içine yazılır.
- Authenticated semantik write kuralları tek `V1MutationService` transaction boundary'sindedir; eski alternatif append/update/delete repository yolları yoktur.

Ayrıntı: `docs/CLEAN_V1_PERSISTENCE.md`.

## Teknoloji

- Next.js 16.3.3
- React 19.2.7
- TypeScript strict mode
- Zod ile AI ve mutation sınırlarında yapı doğrulama
- D1/SQLite uyumlu STRICT baseline şema
- R2/S3 uyumlu özel dosya saklama sınırı
- installable PWA shell

## Ana rotalar

- `/bugun`
- `/planim`
- `/arven`
- `/gelisim`
- `/daha-fazla`

## Yerel geliştirme

```bash
npm ci
npm run dev
```

Kontroller:

```bash
npm run typecheck
npm test
python3 scripts/validate_migration.py
npm run build
```

## Kaynaklar

- `docs/CLEAN_V1_PERSISTENCE.md` — temiz persistence ve mutation mimarisi
- `docs/ARCHITECTURE.md` — ürün ve teknik mimari
- `docs/ROADMAP.md` — fazlar
- `docs/RESEARCH.md` — açık kaynak araştırması ve clean-room ürün fikirleri
- `docs/EXISTING_SITE_MIGRATION.md` — mevcut Sites prototipinden repo tabanlı ürüne geçiş
- `AGENTS.md` — insan ve coding-agent kuralları

## Branch disiplini

`main` doğrudan geliştirme branch'i değildir. Değişiklikler feature branch + pull request üzerinden gözden geçirilir.
