# ARVEN Beslenme & Diyet

Kişiselleştirilmiş beslenme planlama, öğün takibi, doğrulanmış besin verisi ve AI destekli beslenme koçluğu için mobile-first PWA.

## Temel prensip

**AI yorumlar ve önerir; sayısal doğruları kod hesaplar.** Kalori, protein, karbonhidrat, yağ, su, kalan hedefler ve ilerleme metrikleri doğrulanmış yapılandırılmış veriden deterministik olarak üretilir.

ARVEN bir tanı veya tedavi ürünü değildir. Sağlık bağlamını açıklayabilir ve profesyonel değerlendirme önerebilir; tanı koymaz, reçete vermez ve ilaç başlatma/bırakma/doz değiştirme talimatı üretmez.

## Teknoloji

- Next.js 16.3.3 (Active LTS)
- React 19.2.7
- TypeScript strict mode
- Zod ile AI sınırlarında yapı doğrulama
- D1 uyumlu ilk SQL şeması, PostgreSQL'e taşınabilir repository sınırı
- R2/S3 uyumlu özel dosya saklama sınırı
- installable PWA shell

## Ana rotalar

- `/bugun`
- `/planim`
- `/arven`
- `/gelisim`
- `/daha-fazla`

İkincil canonical akışlar proje mimarisinde ayrılmıştır ve fazlar ilerledikçe gerçek persistence/API katmanlarına bağlanacaktır.

## Yerel geliştirme

```bash
npm install
npm run dev
```

Kontroller:

```bash
npm run typecheck
npm test
npm run build
```

## Kaynaklar

- `docs/ARCHITECTURE.md` — ürün ve teknik mimari
- `docs/ROADMAP.md` — fazlar
- `docs/RESEARCH.md` — açık kaynak araştırması ve alınan ürün fikirleri
- `docs/EXISTING_SITE_MIGRATION.md` — mevcut Sites prototipinden repo tabanlı ürüne geçiş
- `AGENTS.md` — geliştirme ve coding-agent kuralları

## Branch disiplini

`main` doğrudan geliştirme branch'i değildir. Değişiklikler feature branch + pull request üzerinden gözden geçirilir.
