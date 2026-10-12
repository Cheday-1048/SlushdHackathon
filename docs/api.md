# Frontend için MVP API sözleşmesi

Backend geliştirme URL'si `http://127.0.0.1:8000`; frontend bunu kök `.env` içindeki `VITE_API_BASE_URL` üzerinden kullanır. Canlı Swagger `/docs`, OpenAPI JSON `/openapi.json` adresindedir. [Export edilmiş OpenAPI](openapi.json) bütün alanları, türleri, zorunlulukları ve response modellerini içerir. [Gerçek yerel demo response örnekleri](api-examples.json) altı başarılı GET isteğini ve bir 422 örneğini içerir. Örnekler yalnızca sentetik mağaza verisidir.

MVP'de tüm veri endpoint'leri GET ve salt okunurdur. Request body yoktur; query parametreleri kullanılır. Kimlik doğrulama veya tenant seçimi henüz yoktur; API yalnızca sabit demo mağazasını döndürür. Frontend veritabanına bağlanmaz. `src/api/client.ts` URL/istek/hata yönetimini, `src/api/schemas.ts` Zod doğrulamasını, `src/hooks/use-dashboard.ts` yükleme/iptal/yeniden deneme akışını sağlar.

## Endpoint'ler

| İstek | Query | Başarılı response |
| --- | --- | --- |
| `GET /health` | Yok | `HealthResponse`: `status: "ok"`, `service`; veritabanı hazır olma garantisi değildir |
| `GET /api/analytics/dashboard` | `preset=last_7_days\|last_30_days\|last_90_days` veya birlikte `start_date`, `end_date`; parametresiz sample period | `AnalyticsDashboard`; mevcut arayüzün kullandığı tek snapshot |
| `GET /api/finance/summary` | Birlikte `start_date`, `end_date` veya hiçbiri | `FinanceSummary`; finansal hesaplama kaynağı |
| `GET /api/dashboard/summary` | Aynı tarih parametreleri | `DashboardSummary`; deprecated eski uyumluluk sözleşmesi |
| `GET /api/products` | `limit` 1–100 (varsayılan 50), `offset` ≥0 (varsayılan 0) | `ProductList`: `items`, `total`, `limit`, `offset`, `store_id`, `data_source` |
| `GET /api/expenses` | Aynı pagination ve birlikte `start_date`, `end_date` | `ExpenseList`: ürün listesi zarfına ek `reporting_period`; expense item'larında `included_in_operating_expenses` |

Tarihler `YYYY-MM-DD` biçimindedir; iki uç da mağaza saat diliminde dahil edilir. Parametresiz finans/analytics/expense raporu 1–30 Eylül 2026 sentetik dönemi kullanır. Analytics custom aralığı en fazla 366 dahil gündür. Preset bugünü içerir ve custom tarihlerle birlikte gönderilemez. Bilinmeyen query parametreleri ve eksik/geçersiz tarih çifti 422 döndürür. `preset=demo` veya `preset=custom` backend parametresi değildir; frontend bu seçimleri parametresiz veya tarih çifti olarak serialize eder.

```sh
curl 'http://127.0.0.1:8000/health'
curl 'http://127.0.0.1:8000/api/analytics/dashboard?start_date=2026-09-01&end_date=2026-09-30'
curl 'http://127.0.0.1:8000/api/products?limit=10&offset=0'
```

## Analytics response alanları

| Alan | Format ve anlam |
| --- | --- |
| `summary` | `FinanceSummary`: gelir, COGS, giderler, kârlar, marjlar, sipariş/ziyaretçi/dönüşüm, başabaş, completeness ve `currency`, `store_id`, `reporting_period`, `data_source` |
| `store_timezone`, `as_of_date` | IANA saat dilimi ve mağaza yerel tarihi (`YYYY-MM-DD`) |
| `selected_preset` | `demo`, `custom`, `last_7_days`, `last_30_days`, `last_90_days` |
| `daily[]` | `date`, `revenue`, `order_count`, `visitors`, `conversion_rate`, `operating_expenses`, `advertising_expenditure`, `total_expenses`, `gross_profit`, `operating_profit`, `data_completeness` |
| `products[]` | `product_id`, `name`, `sku`, `units_sold`, `units_returned`, `revenue`, `cogs`, `gross_profit`, `gross_profit_margin`, `data_completeness` |
| `expenses[]` | `category`, `label`, `amount`; kategori employee_costs/rent/shipping/platform_fees/other_operating/advertising |
| `unallocated_customer_shipping_revenue` | Ürünlere dağıtılmamış müşteri kargo geliri |
| `product_warnings[]` | Ürün hesapları için eksiklik/attribution açıklamaları |

Money ve yüzde değerleri JSON **string** olarak gelir (ör. `"29371.63"`, `"34.67"`); sayım alanları integer'dır. UUID ve tarih/saat alanları string'dir. Bilinemeyen metrik `null` gelir; `0` ile aynı değildir. Eksik trafik için daily visitors/conversion da `null` olabilir. Para toplamlarını veya finansal oranları frontend'de yeniden hesaplamayın; backend değerlerini gösterin. `data_source.type` her zaman `database_demo` değeridir. Tam finance alan listesi OpenAPI `FinanceSummary` şemasında; hesap kuralları [finans dokümanında](phase-03-financial-engine.md) bulunur.

## Hatalar ve entegrasyon

- `404`: seed edilmemiş demo, `{"code":"demo_store_not_seeded","message":"..."}`.
- `503`: eksik DATABASE_URL, erişilemeyen veritabanı veya eksik migration; `{"code":"...","message":"..."}`.
- `500`: beklenmeyen hata, `{"code":"internal_error","message":"The server could not complete this request. Please retry."}`.
- `422`: FastAPI validation response, `{"detail":[...]}`; custom `code/message` zarfını kullanmaz.

Mevcut istemci 422 için genel HTTP hata mesajı gösterir; `code/message` hatalarında sunucu mesajını gösterir. CORS yalnızca yapılandırılmış tam origin'lere izin verir; yerel 5173/4173 portları varsayılan olarak açıktır. UI loading, error/retry ve empty durumlarını korur. Başarılı `/health`, dashboard verisinin hazır olduğunu kanıtlamaz.

Schema değişince backend geliştiricisi bu sözleşmeyi ve OpenAPI export'unu günceller; frontend geliştiricisi `src/api/schemas.ts` değişikliğini inceler. Kök dizinden export yenileme:

```sh
PYTHONPATH=backend .venv/bin/python -c 'import json; from pathlib import Path; from app.main import create_app; Path("docs/openapi.json").write_text(json.dumps(create_app().openapi(), ensure_ascii=False, indent=2) + "\n")'
```

Windows'ta aynı Python kodunu `.venv\Scripts\python.exe` ile çalıştırmadan önce `$env:PYTHONPATH = "backend"` ayarlayın.
