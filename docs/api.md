# Frontend için MVP API sözleşmesi

Backend geliştirme URL'si `http://127.0.0.1:8000`; frontend bunu kök `.env` içindeki `VITE_API_BASE_URL` üzerinden kullanır. Canlı Swagger `/docs`, OpenAPI JSON `/openapi.json` adresindedir. [Export edilmiş OpenAPI](openapi.json) bütün alanları, türleri, zorunlulukları ve response modellerini içerir. [Gerçek yerel demo response örnekleri](api-examples.json) altı başarılı GET isteğini ve bir 422 örneğini içerir. Örnekler yalnızca sentetik mağaza verisidir.

Tüm veri endpoint'leri iş kayıtları açısından salt okunurdur. Raporlar GET/query kullanır; Phase 05 simülasyon önizlemesi JSON gövdeli POST isteğidir. Kimlik doğrulama veya tenant seçimi henüz yoktur; API yalnızca sabit demo mağazasını döndürür. Frontend veritabanına bağlanmaz. `src/api/client.ts` URL/istek/hata yönetimini, `src/api/schemas.ts` ve `src/api/simulation.ts` Zod doğrulamasını, ilgili hook'lar yükleme/iptal/yeniden deneme akışını sağlar.

## Endpoint'ler

| İstek | Query | Başarılı response |
| --- | --- | --- |
| `GET /health` | Yok | `HealthResponse`: `status: "ok"`, `service`; veritabanı hazır olma garantisi değildir |
| `GET /api/analytics/dashboard` | `preset=last_7_days\|last_30_days\|last_90_days` veya birlikte `start_date`, `end_date`; parametresiz sample period | `AnalyticsDashboard`; mevcut arayüzün kullandığı tek snapshot |
| `GET /api/finance/summary` | Birlikte `start_date`, `end_date` veya hiçbiri | `FinanceSummary`; finansal hesaplama kaynağı |
| `POST /api/simulations/preview` | Query kabul etmez; JSON: `start_date`, `end_date`, `parameters` | `SimulationPreview`; baseline, simulated, differences, assumptions, warnings |
| `POST /api/simulations/compare` | Query kabul etmez; JSON: `start_date`, `end_date`, 2–4 elemanlı `scenarios` | `SimulationComparison`; tek baseline/snapshot_id ve senaryo sonuçları |
| `POST /api/optimization/goal` | Query kabul etmez; JSON: dönem, hedef, kısıtlar, sabit davranış varsayımları ve arama sınırları | `GoalOptimizationResponse`; baseline, hedef, aday sayıları, en fazla üç öneri, açıklamalar |
| `POST /api/assistant/chat` | Query kabul etmez; JSON: `message`, `start_date`, `end_date` | `AssistantChatResponse`; sunucu açıklaması, tarihsel `metrics`, hesaplanan `optimization`, çalıştırılmış `tools_used` |
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
- `422`: doğrulama hatası `{"detail":[{"loc":[...],"msg":"...","type":"..."}]}`. Ham input ve context yansıtılmaz; JSON taşması/NaN da güvenli 422 alır. Başlangıç reklam bütçesine göre geçersiz bir değişiklik `{"code":"invalid_simulation","message":"..."}` döndürür.

İstemci 422 doğrulama açıklamalarını ve `code/message` hatalarında sunucu mesajını gösterir. CORS yalnızca yapılandırılmış tam origin'lere ve GET/POST yöntemlerine izin verir; yerel 5173/4173 portları varsayılan olarak açıktır. UI loading, error/retry ve empty durumlarını korur. Başarılı `/health`, dashboard verisinin hazır olduğunu kanıtlamaz.

## Simülasyon önizlemesi

```json
{
  "start_date": "2026-09-01",
  "end_date": "2026-09-30",
  "parameters": {
    "selling_price_change_pct": "0",
    "discount_pct": "10",
    "expected_conversion_rate": "4",
    "visitor_change_pct": "10",
    "unit_cost_change_pct": "0",
    "advertising_budget_change_amount": "0.00",
    "additional_operating_expense_amount": "0.00"
  }
}
```

Tarihler zorunlu ve en fazla 366 dahil gündür. Parametreler gönderilmezse değişiklikler sıfır, dönüşüm `null` olur. Yüzdeler yüzde puan biriminde ondalık string veya integer kabul eder; JSON float/bool kabul edilmez. `expected_conversion_rate: null` gerçek sipariş/ziyaretçi oranını korur; rapordaki yuvarlanmış yüzde yeniden kullanılmaz. Fiyat değişimi önce, ilave indirim sonra uygulanır. Reklam değişimi ve ilave gider mağazanın para birimindedir. Tam sınırlar, hesaplar ve varsayımlar [Phase 05 raporunda](phase-05-report.md) yer alır.

Yanıt `model_version: "aggregate-v1"`, `store_id`, `currency`, `reporting_period`, `baseline`, uygulanmış `parameters`, `status`, `simulated`, `differences`, `assumptions` ve `warnings` içerir. Baseline aynı tarihlerde FinanceSummary ile aynıdır. Beklenen sipariş/ziyaretçi sayıları altı basamağa kadar ondalık string; gerçekleşmiş siparişler integer'dır. Para iki basamaklı string'dir. Sıfır veya negatif başlangıç kârında `profit_change_pct: null` döner. Desteklenmeyen/eksik başlangıçta HTTP 200 ile `status: "unavailable"`, `simulated: null`, `differences: null` ve açıklamalar döner. Hiçbir iş kaydı ya da senaryo geçmişi yazılmaz. [Gerçek yerel önizleme yanıtı](phase-05-preview-example.json) yeniden üretilebilir örnektir.

## A/B Arena karşılaştırması

```json
{
  "start_date": "2026-09-01",
  "end_date": "2026-09-30",
  "scenarios": [
    {"id": "11111111-1111-4111-8111-111111111111", "name": "Current strategy", "parameters": {}},
    {"id": "22222222-2222-4222-8222-222222222222", "name": "Discount assumption", "parameters": {"discount_pct": "10", "expected_conversion_rate": "4"}}
  ]
}
```

Senaryo sayısı 2–4, UUID'ler benzersiz, isimler kırpıldıktan sonra 1–80 karakter olmalıdır. Parametreler ve dönem sınırları preview ile aynıdır. Her istek FinanceService'i bir kez çağırır; bütün senaryolar aynı salt okunur repeatable-read transaction'daki hesaplanmış başlangıç verisiyle mevcut motor üzerinden çalışır.

Yanıtın ortak alanları `model_version`, `snapshot_id`, `store_id`, `currency`, `reporting_period`, `baseline`, `assumptions`, `warnings` ve `scenarios` listesidir. `snapshot_id`, tüm dönen baseline'ın kanonik JSON SHA-256 parmak izidir; kalıcı kayıt veya daha sonra sunucudan getirilebilen bir snapshot anahtarı değildir. Her senaryo `id`, `name`, `parameters`, `status`, `simulated`, `differences`, `assumptions`, `warnings` ve `comparison` taşır. Liste giriş sırasını korur; kazanan veya otomatik sıralama yoktur.

`comparison` alanları: `orders_change_pct`, `gross_profit_change_pct`, `operating_expenses_difference`, `operating_expenses_change_pct`, `advertising_expenditure_difference`, `advertising_expenditure_change_pct`, `conversion_rate_difference_pp`, `operating_profit_margin_difference_pp`. Mevcut revenue/profit/orders/gross-profit mutlak farkları `differences` içindedir. Pozitif olmayan başlangıç değerlerinde yüzde farkı `null`; dönüşüm ve marj farkları yüzde puandır. Dönüşüm farkı rapordaki iki basamaklı gösterime değil motorun altı basamaklı tarihsel oranına göre hesaplanır. Eksik senaryo çıktısında `comparison: null` döner.

Geçersiz reklam değişimi bütün isteği 422 ile reddeder ve hatalı senaryonun adını/kimliğini açıklar. Eksik veriler senaryo bazında `unavailable` durumuyla döner. Sonuçlar varsayımsaldır; kullanıcı seçimi veya elemesi iş kayıtlarını değiştirmez. [Gerçek karşılaştırma örneği](phase-06-comparison-example.json) ve [Phase 06 raporu](phase-06-report.md) tüm hesap ve doğrulama ayrıntılarını içerir.

## Hedef bazlı optimizasyon

`POST /api/optimization/goal` tarih çiftine ek olarak `target_profit_increase_pct`, `constraints`, `behavioral_assumptions` ve isteğe bağlı `search` kabul eder. Tam örnek ve sınırlar [Phase 07 raporundadır](phase-07-report.md). `constraints` fiyat değişimi alt/üst sınırı, maksimum indirim, reklam artışı, ek faaliyet gideri ve isteğe bağlı minimum faaliyet kâr marjını içerir. Tutarlar mağazanın para birimindeki ek tutarlardır.

`behavioral_assumptions.conversion_mode` zorunlu `historical` veya `explicit` değeridir. Historical için `expected_conversion_rate: null`, explicit için 0–100 arasında değer gerekir. `visitor_change_pct` ve `unit_cost_change_pct` bütün adaylarda sabittir. Fiyat/indirim/reklam kaynaklı otomatik dönüşüm veya trafik etkisi varsayılmaz.

Arama eksenleri 2–5 nokta; toplam üst sınır 625 adayı geçemez. Aynı yuvarlanmış noktalar tekilleştirilir. Arama limiti aşımı ve çelişkili fiyat aralığı 422 verir. Tek FinanceService başlangıcı üzerinden mevcut simülasyon motoru kullanılır. Yüzde kâr hedefi pozitif ve eksiksiz başlangıç kârı gerektirir; hedef parasal tutarı yukarı kuruşa yuvarlanır.

Yanıt `status: feasible|target_not_achievable|unavailable`, `baseline`, `snapshot_id`, uygulanmış `request`, `target_operating_profit`, `target_profit_difference`, `candidates_evaluated`, `feasible_candidate_count`, `recommendations`, `rejections`, `assumptions`, `constraint_explanations`, `warnings` içerir. Model `aggregate-v1`, arama `grid-v1` olarak tanımlanır. Öneriler faaliyet kârına göre azalan sıralıdır; her biri UUID, isim, yedi parametre, mevcut simülasyon sonucu/farkları, sağlanan kısıtlar ve uyarıları içerir. Ret sayıları ilk başarısız kontrol için bir kez sayılır. Hedefe ulaşamama HTTP 200 ile açıklanır; elverişli varsayım uydurulmaz. [Kaydedilen örnek yanıt](phase-07-optimization-example.json) gerçek yerel sentetik veriye dayanır.

## AI Decision Assistant

`POST /api/assistant/chat` bağımsız bir doğal dil hedefi ve seçili tarih aralığını kabul eder:

```json
{
  "message": "Increase my operating profit by 20% without increasing advertising costs.",
  "start_date": "2026-09-01",
  "end_date": "2026-09-30"
}
```

Mesaj kırpıldıktan sonra 1–2000 karakterdir; dönem en fazla 366 dahil gündür. Tenant/mağaza seçimi, sohbet geçmişi, önceki OpenAI yanıt kimliği ve ek alan kabul edilmez. Her istek bağımsızdır. Model yalnızca `get_store_metrics` ve `run_goal_optimization` araçlarını seçebilir. Araç argümanları strict JSON şeması yanında Pydantic ile doğrulanır; araç dönemi istek dönemiyle aynı olmalıdır. Hesaplamalar mevcut FinanceService, GoalOptimizationService ve simülasyon motorunda yapılır.

Yanıttaki `message` sunucunun doğrulanmış sonuçlardan ürettiği açıklamadır; ham model metni gösterilmez. `metrics` gerçek tarihsel FinanceSummary veya null, `optimization` değiştirilmemiş GoalOptimizationResponse veya null, `tools_used` ise başarılı araçların benzersiz isimleridir. Modelden bir kâr tutarı kabul edilmez. Varsayımsal önerilerde tam uygulanmış istek, kısıtlar ve sınırlamalar görünür; sonuçsuz arama bütün olası gerçek stratejilerin başarısız olduğu anlamına gelmez.

Belirtilmeyen arama sınırları açıkça bildirilen demo varsayımlarıdır: fiyat değişimi %0–10, ek indirim en fazla %10, ek reklam/faaliyet harcaması sıfır, tarihsel dönüşüm ve değişmeyen ziyaretçi/birim maliyet. Kullanıcı farklı desteklenen sınırları mesajda belirtebilir. Yüzde faaliyet kârı artışı dışındaki hedefler bu minimal entegrasyonda desteklenmez.

`OPENAI_API_KEY` sadece backend'de tutulur; eksik anahtar 503 yapılandırma hatası verir ve veritabanı açılmaz. Sağlayıcı/araç protokolü hataları temizlenmiş 502, zaman aşımı 504 yanıtıdır; sağlayıcı gövdesi ve kimlik bilgileri dışarı verilmez. Ayrıntılı limitler ve test kapsamı [Phase 08 raporundadır](phase-08-report.md). Anahtarsız ortamda OpenAI ağına çıkmadan mevcut manuel optimizer kullanılabilir. Tarayıcı testi OpenAI erişimini kapatır; başarı akışındaki AI zarfı test çiftidir, finansal hesap ve Arena karşılaştırması gerçek yerel backend'de çalışır.

Schema değişince backend geliştiricisi bu sözleşmeyi ve OpenAPI export'unu günceller; frontend geliştiricisi `src/api/schemas.ts` değişikliğini inceler. Kök dizinden export yenileme:

```sh
PYTHONPATH=backend .venv/bin/python -c 'import json; from pathlib import Path; from app.main import create_app; Path("docs/openapi.json").write_text(json.dumps(create_app().openapi(), ensure_ascii=False, indent=2) + "\n")'
```

Windows'ta aynı Python kodunu `.venv\Scripts\python.exe` ile çalıştırmadan önce `$env:PYTHONPATH = "backend"` ayarlayın.
