# İki geliştirici için çalışma düzeni

Hedef repository: https://github.com/Cheday-1048/SlushdHackathon. Mevcut React/Vite frontend kök dizinde, FastAPI backend `backend/` altında kalır. Klasör taşıma veya mimari refactoring gerekli değildir.

## Branch düzeni

- `main`: testlerden geçen, entegre kararlı MVP. Geliştirme branch'lerini PR ile buraya entegre edin.
- `feat/backend`: backend geliştiricisinin çalışma branch'i.
- `feat/frontend`: frontend geliştiricisinin çalışma branch'i.
- `feat/import-mvp`: hedef repository önceden dosyalar içeriyorsa, hedefin mevcut geçmişinden başlayan import PR'ı. Önce bu PR incelenip `main` ile entegre edilir; geliştirme branch'leri entegre MVP commit'inden başlatılır.

Branch isimleri istenen çalışma düzenini belirtir; GitHub'daki gerçek oluşturulma ve yayınlanma durumunu [aktarım raporundan](github-import-report.md) kontrol edin. Önceden var olan branch'ler silinmez veya sıfırlanmaz. Varsayılan branch `main` değilse mevcut branch ve ayarlar korunarak entegrasyon ayrıca koordine edilir.

## Dosya sorumlulukları

| Alan | Birincil sorumlu | Dosyalar |
| --- | --- | --- |
| Frontend arayüz ve istemci | Frontend | `src/`, `index.html`, `components.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, kök `.env.example` |
| Frontend bağımlılıkları | Frontend | `package.json`, `package-lock.json` (birlikte güncellenir) |
| Backend ve veritabanı | Backend | `backend/app/`, `backend/migrations/`, `backend/tests/`, `backend/alembic.ini`, `backend/pytest.ini`, `backend/.env.example` |
| Backend bağımlılıkları | Backend | `backend/requirements.in`, `backend/requirements.txt` |
| Backend çalıştırıcı | Backend; npm komutu değişirse frontend ile koordine | `scripts/start-backend.mjs`, `package.json` içindeki `backend` komutu |
| API sözleşmesi | Backend üretir; frontend değişikliği inceler | `backend/app/schemas/`, `docs/openapi.json`, `docs/api.md`; frontend eşleniği `src/api/schemas.ts` |
| Ortak entegrasyon | Bir PR'da tek sorumlu belirleyin | `README.md`, `.github/workflows/verify.yml`, `.gitignore`, `.gitattributes`, `.nvmrc`, `.python-version`, `playwright.config.ts`, `tests/e2e/`, ortak dokümanlar |

Ortak bir npm/Python dependency manifesti yoktur. Ortak bağımlılıklar HTTP API sözleşmesi, CORS/URL ayarları, CI ve uçtan uca testlerdir. İki geliştirici aynı ortak dosyayı değiştirmeden önce anlaşmalıdır. Backend endpoint değişikliğinde önce request/response örneğini ve geriye uyumluluğu kararlaştırın; backend ve istemci şemalarını eşleşen PR'larda güncelleyin. Yeni migration ekleyin; uygulanmış migration dosyalarını değiştirmeyin.

## Clone ve ilk kurulum

MVP ve çalışma branch'leri GitHub'da yayınlandıktan sonra:

```sh
git clone https://github.com/Cheday-1048/SlushdHackathon.git
cd SlushdHackathon
git fetch origin
# Backend geliştiricisi:
git switch --track origin/feat/backend
# Frontend geliştiricisi kendi checkout'unda bunun yerine:
# git switch --track origin/feat/frontend
```

Node 24.19.0 ve Python 3.12.14 kullanın. macOS/Linux:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm ci
cp .env.example .env
cp backend/.env.example backend/.env
```

`backend/.env` içindeki `DATABASE_URL` değerini kendi PostgreSQL bağlantınızla doldurun. Transaction pooling kullanılıyorsa `MIGRATION_DATABASE_URL` de gerekir. Frontend yalnızca herkese açık `VITE_API_BASE_URL` kullanır; veritabanı erişim bilgileri frontend ortamına yazılmaz. Yerel ortam dosyalarınızı commit etmeyin. Hosted Supabase bağlantısı bu hazırlıkta doğrulanmış değildir. Windows komutları ve tüm bağlantı seçenekleri [README](../README.md) içinde bulunur.

Migration ve demo seed:

```sh
.venv/bin/python -m alembic -c backend/alembic.ini upgrade head
cd backend
../.venv/bin/python -m app.seed
cd ..
```

İki ayrı terminalde `npm run backend -- --reload` ve `npm run dev` çalıştırın. Dashboard: http://127.0.0.1:5173; API dokümantasyonu: http://127.0.0.1:8000/docs. Backend geliştiren kişi de mevcut frontend'i çalıştırarak entegrasyonu kontrol edebilir.

## Günlük geliştirme ve entegrasyon

Kendi branch'inizde commit/push yapın. `main` güncellemelerini `git fetch origin` ve `git merge origin/main` ile alın; çatışmaları test ederek çözün. Push: `git push origin feat/backend` veya `git push origin feat/frontend`. GitHub'da hedefi `main` olan PR açın. API/ortak dosya değişikliklerini diğer geliştirici incelesin; kontroller geçtiğinde PR entegre edilir. Force push veya branch silme gerekmez.

Frontend kontrolü: `npm test` ve `npm run build`. Backend kontrolü: `.venv/bin/python -m pytest -c backend/pytest.ini backend/tests`. PostgreSQL ve tarayıcı testleri için README'deki ayrı yerel `rdl_test_*` veritabanı kurulumunu kullanın. Eksik `TEST_DATABASE_URL` entegrasyon testlerini atlatır; yalnızca birim testlerinin geçmesi tam MVP doğrulaması sayılmaz.

Branch düzeni çalışma anlaşmasıdır; GitHub branch protection ayarları otomatik etkinleştirilmez. Repository sahibi isterse `main` için PR ve CI kontrollerini zorunlu kılabilir. Her geliştirici repository'ye en az Write erişimi almalıdır.
