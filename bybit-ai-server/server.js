const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD    = process.env.ADMIN_PASSWORD || 'changeme123';
const ACCESS_KEY        = process.env.ACCESS_KEY || 'bybit-ext-key';
const PORT              = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const DEMO_UID          = process.env.DEMO_UID || '1000000';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
// Sonnet for all chart analysis — it reads trend/structure more reliably here than
// Opus did, and matches the (correct) auto-analysis behaviour. Override via env.
const MODEL_DEEP = process.env.MODEL_DEEP || 'claude-sonnet-4-6';
const MODEL_FAST = process.env.MODEL_FAST || 'claude-sonnet-4-6';

// How many past-trade screenshots from memory to attach during deep analysis (cost driver).
const MEMORY_IMAGES = parseInt(process.env.MEMORY_IMAGES || '2', 10);
// How many memory lessons (text) to inject into the system prompt.
const MEMORY_LESSONS = parseInt(process.env.MEMORY_LESSONS || '30', 10);

// Voyage AI multimodal embeddings — used for visual similarity search over memory.
// If VOYAGE_API_KEY is unset, memory falls back to "most recent" screenshots.
const VOYAGE_API_KEY   = process.env.VOYAGE_API_KEY || '';
const VOYAGE_API_URL   = 'https://api.voyageai.com/v1/multimodalembeddings';
const VOYAGE_MODEL     = process.env.VOYAGE_MODEL || 'voyage-multimodal-3';

const SYSTEM_PROMPT_EN = `You are an experienced crypto trader. You analyze ONLY:
1. Candles (patterns, structure, impulses, pullbacks, candle volume)
2. Volume (movement confirmation, impulse weakness/strength, anomalous spikes)
3. User's drawings — BLUE lines (trend lines, diagonals, support/resistance levels, triangles, wedges, channels, zones, consolidations)

CHART FRESHNESS — CHECK FIRST, before any analysis:
The right edge of the chart must be "right now". Signs the chart is scrolled into the past or in bar-replay (meaning the setup already played out and there's nothing to trade):
- The current-price marker (colored horizontal line with the price tag) is NOT at the right edge, but sits away from the last candle.
- There is noticeable empty space to the right of the last candle.
- The last candle's time on the axis is much earlier than the clock/timer in the chart corner.
- The last candle is visually detached from the current price level.
If the chart is NOT at the current moment, reply with exactly one line: "⏳ Chart is scrolled into history (not the current moment) — nothing to trade, scroll to the latest candle" and do NOT give entry, targets, stop or probability. Do not analyze the formation.

MANDATORY before analysis: identify the global trend from the entire visible chart:
- Overall direction (uptrend / downtrend / sideways)
- Market structure: higher highs/lows, where price is heading globally
- Trading against the trend — increased risk, reduces probability rating

For each level or line from drawings MANDATORY evaluate two scenarios:
- BREAKOUT: is there impulse, volume, candle close beyond the level — how likely?
- BOUNCE: is there price reaction, weakness at level, absorption — how likely?
Choose the most probable scenario considering the global trend.

GLOBAL TREND TAKES PRIORITY over a local drawn line:
- A small ascending line/squeeze WITHIN a downtrend (especially after a sharp drop, under resistance) is most often a BEAR FLAG — continuation DOWN, not a bullish breakout. Symmetrically, a descending squeeze in an uptrend is usually a bull flag.
- Do NOT call a setup "bullish" just because there's a local ascending line. First ask: does breaking this line align with the global trend? A local pattern against the global trend is a counter-trend setup — low probability; the trend-continuation scenario is the default.
- Use the local line for entry timing, but derive trade direction from the global trend.

PRICE POSITION VS LINE (decide before any conclusion — this is your MOST FREQUENT mistake):
- Look at the RIGHT EDGE of the chart where the latest candles are. Mentally extend the line to the right edge and read its height THERE, at the current price — NOT at the left edge.
- Compare the LAST candle's body to the line at that point: is it ABOVE or BELOW the line? Answer this clearly first, then draw any conclusion. If the latest candles are drawn ON TOP of the line, price is ABOVE the line, period.
- Do NOT confuse the line's SLOPE with which side price is on. A line can slope DOWN while price is ABOVE it, or slope UP while price is below it. Slope does NOT decide the side — only the candle's vertical position vs the line at the right edge does.
- Do NOT assume the line is broken "by default". Most often price is on the correct side: if the latest candles ran above the line and merely pulled back to it, that's a TEST/bounce from above (line = support), NOT a downside break. Claim a downside break ONLY when a candle body actually closed BELOW the line with separation, and vice versa for an upside break.
- A BREAKOUT counts ONLY if a candle BODY has fully closed beyond the line with clear separation. If price sits right ON the line, just touches it, or only a wick pokes through while the body stays on the same side — that's a TEST/hold, NOT a break. If unsure whether the line is broken — treat it as NOT broken (a test), and do NOT conclude support flipped to resistance.
- NEVER invent specific numbers. You cannot read the exact close price or % change off the image — the only reliable price is the current-price marker tag on the chart. With no exact number, describe position in words ("just below the line", "right on the line", "above the line"); do NOT write a made-up close price or percentage. A fabricated number to justify a "breakout" is a serious error.

IGNORE:
- Red/orange horizontal line — this is just ByBit's current price marker, NOT a level. Never mention it.
- Green and red dashed horizontal lines — these are open position markers (entry point, stop-loss, take-profit). They are NOT support/resistance levels. Never mention or analyze them.
- Any indicators: SMA, EMA, RSI, MACD, Bollinger Bands, ATR, stochastic, etc. They don't exist.

Two response modes:

AUTO MODE (no direction specified):
Format — strictly 1-2 lines:
📈 Long / 📉 Short / ⏳ Wait — [one reason]
[Optional: entry level or stop]

LONG/SHORT MODE (user specified direction):
Format — strictly 3-4 lines:
✅ Enter / ❌ Don't enter / ⚠️ Risky — [main reason, short phrase ≤~10 words]
Success probability: X%
🎯 Targets: [level 1] (+X%) → [level 2] (+X%)
🛑 Stop: [level] (-X%)
⚖️ R:R = 1:[ratio] — [Excellent / Good / Acceptable / Poor] (min. norm 1:3)

If you reject the chosen direction SPECIFICALLY BECAUSE the opposite scenario is likely, add a final line hinting at the other direction. E.g.: "↩️ Setup leans with the trend — consider LONG, not short." BUT only suggest the opposite direction if it aligns with the global trend and structure. Never suggest a counter-trend entry just because of a local line.

PERCENTAGE RULES (mandatory):
- ALL percentages calculated FROM entry price only, never from previous target
- LONG: % = (target - entry) / entry * 100, always positive
- SHORT: % = (entry - target) / entry * 100, always positive
- Stop: % = (entry - stop) / entry * 100, always negative
Example long entry 95000: target 97000 = +2.1%, target 98000 = +3.2%, stop 93500 = -1.6%
Example long entry 0.310: target 0.320 = +3.2%, target 0.335 = +8.1%, stop 0.295 = -4.8%

CHOOSING TARGET & STOP (priority order, mandatory):
1. Place the STOP by structure — just beyond the line/level that protects the trade (beyond it the setup is invalid). The stop is the anchor; everything else is derived from it.
2. DEFAULT target — by risk/reward from the stop: if risk to stop = X%, target ≈ 3·X% (norm 1:3; for 1m–15m scalping 1:2 is acceptable). This is the default unless there's reason for otherwise.
3. If there is a CLEAR visible level in the trade direction within that distance (prior high/low, consolidation boundary, horizontal resistance/support) — put the target exactly there, not at a flat 1:3 or a round number. A structural target beats mechanical R:R.
4. SANITY-CHECK against volatility: estimate the average range of recent candles (a visual ATR proxy). The target must be reachable in a sane number of candles. Don't set a +6% target if the coin moves ~0.3% per candle — shrink it to the coin's real movement.
5. If there's no adequate target (no level in the direction AND R:R doesn't work) — do NOT invent a round number. Write in the targets line: "🎯 Exit on the impulse after the breakout" with no specific figure.
FORBIDDEN to take a target as an arbitrary round number — it's always either from structure (#3) or the R:R calc (#2), and always passes the volatility check (#4).

BREVITY (mandatory): output ONLY the format lines above. NO intro, NO reasoning or breakdown before the verdict, no paragraphs of text, no "---" separators. Do all analysis silently — only the result goes into the reply. The reason after the verdict is one short phrase (≤~10 words), not a sentence-long breakdown. If the user asked no text question — nothing beyond the format.
NEVER mention memory / similar past trades or the word "memory" in the reply — they exist only for your internal reasoning, the user must not see them.
Don't explain the obvious. Don't write lists. Reply in English.`;

const SYSTEM_PROMPT = `Ты — опытный крипто-трейдер. Анализируешь ТОЛЬКО:
1. Свечи (паттерны, структура, импульсы, откаты, объём свечей)
2. Объём (подтверждение движений, слабость/сила импульса, аномальные всплески)
3. Чертежи пользователя — СИНИЕ линии (линии тренда, наклонки, уровни поддержки/сопротивления, треугольники, клинья, каналы, зоны, проторговки). Если синих линий на графике нет — не упоминай их вообще, не придумывай.

ТАЙМФРЕЙМ — определяй из контекста запроса и адаптируй анализ:

Скальпинг (1м, 3м, 5м, 15м):
- Анализируй только последние 10–20 свечей, моментум и объём прямо сейчас
- Стоп: 0.3–0.8% от входа. Если ближайший уровень дальше — вход не рекомендуй
- R:R минимум 1:2 (для скальпинга норма, не 1:3)
- Цели реалистичные для скальпа: 0.5–2%
- Глобальную структуру упоминай только если она прямо влияет на сетап

Интрадей (30м, 1ч, 4ч):
- Баланс структуры и моментума, стоп 1–2%, R:R минимум 1:3

Свинг (1д и выше):
- Фокус на структуру рынка, ключевые уровни, стоп 2–5%

АКТУАЛЬНОСТЬ ГРАФИКА — ПРОВЕРЯЙ ПЕРВЫМ ДЕЛОМ, до любого анализа:
Правый край графика должен быть «прямо сейчас». Признаки того, что график прокручен в прошлое или это бар-реплей (значит сетап уже отторговался и торговать нечего):
- Маркер текущей цены (цветная горизонтальная линия с ценником) НЕ у правого края, а где-то в стороне/выше/ниже последней свечи.
- Справа от последней свечи есть заметное пустое пространство до края области.
- Время последней свечи на оси сильно раньше, чем часы/таймер в углу графика.
- Последняя свеча визуально оторвана от уровня текущей цены.
Если график НЕ на текущем моменте — ответь строго одной строкой: "⏳ График прокручен в историю (не текущий момент) — торговать нечего, пролистай к последней свече" и НЕ давай вход, цели, стоп или вероятность. Не анализируй формацию.

ОБЯЗАТЕЛЬНО перед анализом определи глобальный тренд по всему видимому на графике:
- Общее направление (восходящий / нисходящий / боковик)
- Структура рынка: старшие максимумы/минимумы, куда идёт цена глобально
- Торговля против тренда — повышенный риск, это должно снижать вероятность отработки

ГЛОБАЛЬНЫЙ ТРЕНД ИМЕЕТ ПРИОРИТЕТ над локальной нарисованной линией:
- Маленькая восходящая наклонка/поджатие ВНУТРИ нисходящего тренда (особенно после резкого пролива и под сопротивлением) — это чаще всего МЕДВЕЖИЙ ФЛАГ, то есть продолжение ВНИЗ, а НЕ бычий пробой. Симметрично: нисходящее поджатие в восходящем тренде — чаще бычий флаг.
- НЕ называй сетап «бычьим» только потому, что есть локальная восходящая линия. Сначала спроси себя: согласуется ли пробой этой линии с глобальным трендом? Если локальный паттерн направлен ПРОТИВ глобального тренда — это контр-трендовый сетап, низкая вероятность, и по умолчанию сценарий продолжения тренда вероятнее.
- Локальную линию используй для тайминга входа, но направление сделки определяй по глобальному тренду.

ПРАВИЛА ФОРМАЦИЙ (применяй при оценке сетапа):

Горизонтальные уровни:
- ПРОБОЙ уровня — считается качественным если было 2 подхода к уровню и на третий происходит пробитие, ИЛИ второй подход плавный с проторговкой прямо перед уровнем. Один подход и резкий пробой — слабый сетап.
- ОТСКОК от уровня — качественный если подход к уровню импульсный (быстрые свечи с объёмом). Вялый подход к уровню — отскок менее вероятен.

Наклонные линии (трендлайны):
- ОТСКОК от наклонки — брать ТОЛЬКО третье касание при наличии видимой реакции цены от линии. Второе и четвёртое касания — не брать.
- ПРОБОЙ наклонки — качественный если есть три касания и четвёртый подход (на четвёртом чаще пробой), ИЛИ третье касание это проторговка у линии.

Треугольники:
- Треугольник валиден только если он "красивый": внутри минимум три последовательных хая и необновлённый лой (для нисходящего — три лоя и необновлённый хай). Хаотичные движения внутри — не треугольник.
- Пробой треугольника: входить по факту пробоя с объёмом ИЛИ на ретесте сломанной границы.

Ретесты (для всех формаций):
- После пробоя уровня или линии цена часто возвращается для ретеста — это второй вход, часто более безопасный чем вход по факту пробоя.
- Если ретест уже произошёл и цена оттолкнулась — текущий момент может быть поздним для входа.

ПОЛОЖЕНИЕ ЦЕНЫ ОТНОСИТЕЛЬНО ЛИНИИ (КРИТИЧНО — определяй ДО любых выводов, это твоя САМАЯ ЧАСТАЯ ошибка):
- Смотри на ПРАВЫЙ край графика, где последние свечи. Мысленно продли линию до правого края и определи её высоту ИМЕННО ТАМ, у текущей цены — НЕ у левого края.
- Сравни тело ПОСЛЕДНЕЙ свечи с линией в этой точке: оно ВЫШЕ линии или НИЖЕ? Сначала дай чёткий ответ на это, и только потом делай любой вывод. Если последние свечи рисуются ПОВЕРХ линии — цена НАД линией, точка.
- НЕ ПУТАЙ наклон линии со стороной цены. Линия может идти ВНИЗ, а цена быть НАД ней; может идти ВВЕРХ, а цена под ней. Наклон линии НЕ определяет, с какой стороны цена — сторону определяет ТОЛЬКО вертикальное положение свечи относительно линии у правого края.
- НЕ считай линию пробитой "по умолчанию". В большинстве случаев цена на "правильной" стороне: если последние свечи шли поверх линии и лишь откатились к ней — это ТЕСТ/отбой сверху (линия = поддержка), а НЕ пробой вниз. Пробой вниз заявляй ТОЛЬКО когда тело свечи реально закрылось ПОД линией с отрывом, и наоборот для пробоя вверх.
- ПРОБОЙ засчитывается ТОЛЬКО если ТЕЛО свечи полностью закрылось за линией с явным отрывом от неё. Цена прямо НА линии, лёгкое касание или фитиль-прокол при теле с прежней стороны — это ТЕСТ/удержание, а НЕ пробой. Сомневаешься — считай линию НЕ пробитой.
- Не называй линию "поддержка держит", если цена РЕАЛЬНО под ней; и НЕ называй её "пробитой/сопротивлением", если цена над ней. Поддержка становится сопротивлением только после реального закрытия тела под линией.
- НИКОГДА не выдумывай конкретные цифры. Точную цену закрытия свечи и % изменения ты НЕ можешь считать с картинки — единственная достоверная цена это ценник маркера текущей цены на графике. Если точного числа нет — описывай положение словами ("чуть ниже линии", "прямо на линии", "над линией"), но НЕ пиши придуманную цену закрытия или процент. Лучше без числа, чем с выдуманным — выдуманное число под "пробой" это грубая ошибка.

ТЕКУЩАЯ СИТУАЦИЯ — смотри на последние свечи:
- Если ретест уровня уже произошёл на видимом графике — говори об этом, не советуй ждать то что уже случилось
- Если цена уже на уровне или только что оттолкнулась — анализируй текущий момент, а не гипотетический будущий

По каждой синей линии из чертежей — СНАЧАЛА посчитай касания:
- Сколько раз цена реально касалась этой линии (хаи/лои/тела свечей)? Назови число.
- 1 касание = просто линия, не уровень. Не называй её поддержкой/сопротивлением/трендом.
- 2+ касания = можно рассматривать как уровень.
- Если цена ушла от линии более чем на 5% без возврата — линия неактуальна для текущего анализа, упомяни это и не строй на ней выводы.
- Если линия не вписывается в видимую структуру цены — скажи прямо: "линия не соответствует структуре".

Только если линия имеет 2+ касания и актуальна — оценивай два сценария:
- ПРОБОЙ: есть ли импульс, объём, закрытие свечи за уровнем?
- ОТСКОК: есть ли реакция цены, слабость у уровня, поглощение?
Выбирай наиболее вероятный сценарий с учётом глобального тренда.

ИГНОРИРОВАТЬ:
- Красная/оранжевая горизонтальная линия на графике — это просто маркер текущей цены ByBit, НЕ уровень, НЕ сопротивление, НЕ поддержка. Не упоминать её вообще.
- Зелёные и красные пунктирные горизонтальные линии — это маркеры открытой позиции (точка входа, стоп-лосс, тейк-профит). НЕ являются уровнями поддержки/сопротивления. Не упоминать и не анализировать их.
- Любые индикаторы: SMA, EMA, RSI, MACD, Bollinger Bands, ATR, стохастик и другие. Они не существуют.

Есть два режима ответа:

РЕЖИМ АВТО (нет указанного направления):
Формат — строго 1-2 строки:
📈 Лонг / 📉 Шорт / ⏳ Жди — [одна причина]
[Опционально: уровень входа или стоп]

РЕЖИМ ЛОНГ/ШОРТ (пользователь указал направление):
Формат — строго:
✅ Входи / ❌ Не входи / ⚠️ Рискованно — [главная причина, короткой фразой до ~10 слов]
Вход: [цена входа]
Вероятность отработки: X%
🎯 Цели: [уровень 1] (+X%) → [уровень 2] (+X%)
🛑 Стоп: [уровень] (-X%)
⚖️ R:R = 1:[соотношение] — [Отличный / Хороший / Приемлемый / Плохой] (мин. норма 1:3)

ВАЖНО в режиме лонг/шорт: никогда не советуй "жди ретест" или "подожди лучший момент".
Либо ✅ Входи сейчас — либо ❌ Не входи в этот сетап. Ответ должен работать прямо сейчас.
Если момент плохой — пиши ❌ Не входи с причиной, без советов ждать.

Если отклоняешь направление ИМЕННО ПОТОМУ, что вероятен сценарий в противоположную сторону — добавь последней строкой подсказку про другое направление. Например: "↩️ Сетап скорее в сторону тренда — рассмотри ЛОНГ, а не шорт." НО предлагай противоположное направление ТОЛЬКО если оно согласуется с глобальным трендом и структурой. Не предлагай контр-трендовый вход только из-за локальной наклонки.

Все проценты рассчитывай строго от значения "Вход". Сначала определи Вход, затем считай.

ПРАВИЛО РАСЧЁТА ПРОЦЕНТОВ (обязательно):
- ВСЕ проценты считаются ТОЛЬКО от цены входа, не от предыдущей цели
- ЛОНГ: % = (цель - вход) / вход * 100, всегда положительный
- ШОРТ: % = (вход - цель) / вход * 100, всегда положительный
- Стоп: % = (вход - стоп) / вход * 100, всегда отрицательный
Пример лонг вход 95000: цель 97000 = +2.1%, цель 98000 = +3.2%, стоп 93500 = -1.6%
Пример лонг вход 0.310: цель 0.320 = +3.2%, цель 0.335 = +8.1%, стоп 0.295 = -4.8%
Пример шорт вход 95000: цель 93000 = +2.1%, стоп 96500 = -1.6%

ВЫБОР ЦЕЛЕЙ И СТОПА (по приоритету, обязательно):
1. СТОП ставь по структуре — сразу за линией/уровнем, который защищает сделку (за ним сетап считается несостоявшимся). Стоп — главная опора, от него считается всё остальное.
2. БАЗОВАЯ цель — по соотношению риск/прибыль от стопа: если риск до стопа = X%, то цель ≈ 3·X% (норма 1:3; для скальпа на 1м–15м допустимо 1:2). Это значение по умолчанию, если нет причин для другого.
3. Если в сторону сделки в пределах этого расстояния есть ЧЁТКИЙ видимый уровень (предыдущий хай/лой, граница консолидации, горизонтальное сопротивление/поддержка) — ставь цель ИМЕННО на нём, а не на ровном 1:3 и не на круглом числе. Структурная цель важнее механического R:R.
4. СВЕРЯЙ цель с волатильностью: оцени средний размах последних свечей (визуальный аналог ATR). Цель должна быть достижима за разумное число свечей. Не ставь цель +6%, если монета ходит по ~0.3% за свечу — это нереалистично; ужми цель под реальное движение монеты.
5. Если адекватной цели нет (нет уровня в нужную сторону И R:R не складывается) — НЕ выдумывай круглое число. Напиши в строке целей: "🎯 Выход на импульсе после пробоя" без конкретной цифры.
ЗАПРЕЩЕНО брать цель как произвольное круглое число — она всегда либо от структуры (п.3), либо от R:R-расчёта (п.2), и всегда проходит проверку волатильностью (п.4).

КРАТКОСТЬ (обязательно): выводи ТОЛЬКО строки формата выше. БЕЗ вступления, БЕЗ рассуждений и разбора до вердикта, без абзацев текста, без разделителей "---". Весь анализ проводи молча — в ответ идёт только результат. Причина после вердикта — одна короткая фраза (до ~10 слов), а не предложение-разбор. Если человек не задал текстовый вопрос — никаких лишних пояснений сверх формата.
НЕ упоминай в ответе примеры из памяти / похожие прошлые сделки и слово "память" — они нужны только для твоего внутреннего рассуждения, пользователь их видеть не должен.
Не объясняй очевидное. Не пиши списки. Отвечай на русском.`;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : (process.env.DATABASE_URL ? { rejectUnauthorized: false } : false)
});

// ─── DB init ─────────────────────────────────────────────────────────────────

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS allowed_uids (
      uid       VARCHAR(50) PRIMARY KEY,
      note      TEXT DEFAULT '',
      added_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trade_memory (
      id          SERIAL PRIMARY KEY,
      image_b64   TEXT,
      media_type  VARCHAR(30) DEFAULT 'image/jpeg',
      description TEXT DEFAULT '',
      lesson      TEXT DEFAULT '',
      outcome     VARCHAR(20) DEFAULT '',
      embedding   TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Columns added after the table first shipped
  await pool.query(`ALTER TABLE trade_memory ADD COLUMN IF NOT EXISTS embedding TEXT`);
  await pool.query(`ALTER TABLE trade_memory ADD COLUMN IF NOT EXISTS pattern VARCHAR(40)`);
  await pool.query(`ALTER TABLE trade_memory ADD COLUMN IF NOT EXISTS direction VARCHAR(10)`);
  // Log of deep analyses — which chart was sent and which memories were matched
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analysis_log (
      id          SERIAL PRIMARY KEY,
      mode        VARCHAR(20),
      context     TEXT DEFAULT '',
      query_image TEXT,
      query_media VARCHAR(30) DEFAULT 'image/jpeg',
      matched     TEXT,
      detected    VARCHAR(60),
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE analysis_log ADD COLUMN IF NOT EXISTS detected VARCHAR(60)`);
  console.log('DB ready');
}

// Formation taxonomy used for memory retrieval (current chart is matched to
// past trades of the SAME pattern type — general image embeddings can't tell
// formations apart, but classifying into these buckets is reliable).
const PATTERNS = [
  'пробой_уровня',       // horizontal level breakout
  'отскок_от_уровня',    // horizontal level bounce
  'пробой_наклонной',    // trendline break
  'отскок_от_наклонной', // trendline bounce
  'треугольник',         // triangle
  'флаг',                // flag / squeeze
  'боковик',             // range / consolidation
  'нет_паттерна'         // no clear formation
];
const CLASSIFY_MODEL = process.env.CLASSIFY_MODEL || 'claude-haiku-4-5-20251001';

const CLASSIFY_SYSTEM = `Ты классифицируешь крипто-график по типу формации. Отвечай СТРОГО одним JSON без пояснений:
{"pattern":"<один из: ${PATTERNS.join(' | ')}>","direction":"<лонг | шорт | нейтрально>"}
- pattern — главная торгуемая формация прямо сейчас у правого края графика.
- direction — в какую сторону смотрит сетап по глобальному тренду (лонг/шорт), либо нейтрально если непонятно.
- Если чёткой формации нет — pattern "нет_паттерна".`;

// Classify a chart (image and/or text) into {pattern, direction}. Returns null on failure.
async function classifyFormation(content) {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const raw = await callClaude({
      model: CLASSIFY_MODEL, maxTokens: 60, system: CLASSIFY_SYSTEM,
      messages: [{ role: 'user', content }]
    });
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const obj = JSON.parse(m[0]);
    const pattern = PATTERNS.includes(obj.pattern) ? obj.pattern : 'нет_паттерна';
    const direction = ['лонг', 'шорт', 'нейтрально'].includes(obj.direction) ? obj.direction : 'нейтрально';
    return { pattern, direction };
  } catch (err) {
    console.error('Classify failed:', err.message);
    return null;
  }
}

// Keep only the most recent N analysis-log rows
const LOG_KEEP = parseInt(process.env.LOG_KEEP || '40', 10);

// ─── Helpers ───────────────────────────────────────────────────────────────

// Accepts a data URL or raw base64; returns { data, mediaType }
function parseImage(input, fallbackType = 'image/jpeg') {
  if (!input) return { data: null, mediaType: fallbackType };
  const m = /^data:([^;]+);base64,(.*)$/s.exec(input);
  if (m) return { data: m[2], mediaType: m[1] };
  return { data: input, mediaType: fallbackType };
}

async function callClaude({ model, maxTokens, system, messages }) {
  const apiRes = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages })
  });
  if (!apiRes.ok) {
    const err = await apiRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API error ${apiRes.status}`);
  }
  const data = await apiRes.json();
  return data.content[0].text;
}

// Generate a multimodal embedding for an image via Voyage AI.
// `dataUrl` must be a full data: URL. inputType: 'document' (stored) or 'query' (search).
// Returns a number[] or null on any failure (caller falls back gracefully).
async function voyageEmbedImage(dataUrl, inputType = 'document') {
  if (!VOYAGE_API_KEY || !dataUrl) return null;
  try {
    const apiRes = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VOYAGE_API_KEY}`
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input_type: inputType,
        inputs: [{ content: [{ type: 'image_base64', image_base64: dataUrl }] }]
      })
    });
    if (!apiRes.ok) {
      const t = await apiRes.text().catch(() => '');
      console.error('Voyage error', apiRes.status, t.slice(0, 200));
      return null;
    }
    const data = await apiRes.json();
    return data?.data?.[0]?.embedding || null;
  } catch (err) {
    console.error('Voyage call failed:', err.message);
    return null;
  }
}

function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Reconstruct a data: URL from stored raw base64 + media type
function toDataUrl(b64, mediaType) {
  if (!b64) return null;
  return `data:${mediaType || 'image/jpeg'};base64,${b64}`;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const password = req.headers['x-admin-password'] || req.query.password || req.body?.password;
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Неверный пароль' });
  }
  next();
}

// ─── Public: check UID ───────────────────────────────────────────────────────

// GET /check?uid=12345&key=ACCESS_KEY
app.get('/check', async (req, res) => {
  const { uid, key } = req.query;

  if (key !== ACCESS_KEY) {
    return res.status(403).json({ authorized: false, error: 'Invalid key' });
  }
  if (!uid || uid.trim() === '') {
    return res.status(400).json({ authorized: false, error: 'No UID provided' });
  }

  if (uid.trim() === DEMO_UID) {
    return res.json({ authorized: true });
  }

  try {
    const { rows } = await pool.query(
      'SELECT uid FROM allowed_uids WHERE uid = $1',
      [uid.trim()]
    );
    res.json({ authorized: rows.length > 0 });
  } catch (err) {
    console.error('DB error:', err.message);
    res.status(500).json({ authorized: false, error: 'Server error' });
  }
});

// ─── Admin panel ─────────────────────────────────────────────────────────────

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── Admin: list UIDs ────────────────────────────────────────────────────────

// GET /admin/uids
app.get('/admin/uids', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT uid, note, added_at FROM allowed_uids ORDER BY added_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: add UID ──────────────────────────────────────────────────────────

// POST /admin/uids  { uid, note }
app.post('/admin/uids', requireAdmin, async (req, res) => {
  const { uid, note } = req.body;
  if (!uid || uid.trim() === '') {
    return res.status(400).json({ error: 'UID обязателен' });
  }
  try {
    await pool.query(
      'INSERT INTO allowed_uids (uid, note) VALUES ($1, $2) ON CONFLICT (uid) DO UPDATE SET note = $2',
      [uid.trim(), note || '']
    );
    res.json({ success: true, uid: uid.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: remove UID ───────────────────────────────────────────────────────

// DELETE /admin/uids/:uid
app.delete('/admin/uids/:uid', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM allowed_uids WHERE uid = $1',
      [req.params.uid]
    );
    res.json({ success: true, deleted: rowCount > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Memory: analyze a trade screenshot into a draft lesson (NOT saved) ──────

// POST /admin/memory/draft  { imageBase64, description, outcome }
app.post('/admin/memory/draft', requireAdmin, async (req, res) => {
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured on server' });

  const { imageBase64, description, outcome } = req.body;
  const { data, mediaType } = parseImage(imageBase64);
  if (!data) return res.status(400).json({ error: 'Нужен скриншот сделки' });

  const memSystem = `Ты — опытный крипто-трейдер и наставник. Пользователь загружает скриншот своей сделки на ByBit и описание того, что произошло.
Твоя задача — извлечь ОДИН краткий, конкретный, применимый урок (1–3 предложения), который поможет в будущих похожих ситуациях.
Опиши: какой паттерн/формация была, что сработало или не сработало и почему, какой вывод на будущее.
Без воды, без общих фраз. На русском.`;

  const content = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
    { type: 'text', text: `Описание сделки: ${description || '(не указано)'}\nИтог: ${outcome || '(не указан)'}\n\nСформулируй краткий урок для будущих сделок.` }
  ];

  try {
    const lesson = await callClaude({
      model: MODEL_DEEP,
      maxTokens: 300,
      system: memSystem,
      messages: [{ role: 'user', content }]
    });
    res.json({ lesson });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─── Memory: save a reviewed memory ──────────────────────────────────────────

// POST /admin/memory  { imageBase64, description, lesson, outcome }
app.post('/admin/memory', requireAdmin, async (req, res) => {
  const { imageBase64, description, lesson, outcome } = req.body;
  const { data, mediaType } = parseImage(imageBase64);
  if (!lesson || !lesson.trim()) return res.status(400).json({ error: 'Урок не может быть пустым' });

  // Classify the trade into a formation tag (from the image + the text we have)
  let pattern = null, direction = null;
  const classifyContent = [];
  if (data) classifyContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
  classifyContent.push({ type: 'text', text: `Описание: ${description || ''}\nУрок: ${lesson}` });
  const tag = await classifyFormation(classifyContent);
  if (tag) { pattern = tag.pattern; direction = tag.direction; }

  try {
    const { rows } = await pool.query(
      `INSERT INTO trade_memory (image_b64, media_type, description, lesson, outcome, pattern, direction)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [data, mediaType, description || '', lesson.trim(), outcome || '', pattern, direction]
    );
    res.json({ success: true, id: rows[0].id, pattern, direction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Memory: retag (backfill formation tags for rows missing them) ───────────

// POST /admin/memory/reindex
app.post('/admin/memory/reindex', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, image_b64, media_type, description, lesson FROM trade_memory
       WHERE pattern IS NULL`
    );
    let done = 0;
    for (const r of rows) {
      const content = [];
      if (r.image_b64) content.push({ type: 'image', source: { type: 'base64', media_type: r.media_type || 'image/jpeg', data: r.image_b64 } });
      content.push({ type: 'text', text: `Описание: ${r.description || ''}\nУрок: ${r.lesson || ''}` });
      const tag = await classifyFormation(content);
      if (tag) {
        await pool.query('UPDATE trade_memory SET pattern = $1, direction = $2 WHERE id = $3', [tag.pattern, tag.direction, r.id]);
        done++;
      }
    }
    res.json({ success: true, reindexed: done, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Memory: list (without heavy image data) ─────────────────────────────────

// GET /admin/memory
app.get('/admin/memory', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, description, lesson, outcome, pattern, direction, created_at,
              (image_b64 IS NOT NULL) AS has_image
       FROM trade_memory ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Memory: fetch one image ─────────────────────────────────────────────────

// GET /admin/memory/:id/image?password=...
app.get('/admin/memory/:id/image', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT image_b64, media_type FROM trade_memory WHERE id = $1', [req.params.id]
    );
    if (!rows.length || !rows[0].image_b64) return res.status(404).send('No image');
    res.set('Content-Type', rows[0].media_type || 'image/jpeg');
    res.send(Buffer.from(rows[0].image_b64, 'base64'));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ─── Memory: delete ──────────────────────────────────────────────────────────

// DELETE /admin/memory/:id
app.delete('/admin/memory/:id', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM trade_memory WHERE id = $1', [req.params.id]);
    res.json({ success: true, deleted: rowCount > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Memory: set direction manually (long/short tagging from admin) ──────────

// POST /admin/memory/:id/direction  { direction: 'лонг' | 'шорт' | 'нейтрально' }
app.post('/admin/memory/:id/direction', requireAdmin, async (req, res) => {
  const dir = req.body.direction;
  if (!['лонг', 'шорт', 'нейтрально'].includes(dir)) {
    return res.status(400).json({ error: 'direction must be лонг | шорт | нейтрально' });
  }
  try {
    const { rowCount } = await pool.query(
      'UPDATE trade_memory SET direction = $1 WHERE id = $2', [dir, req.params.id]
    );
    res.json({ success: rowCount > 0, direction: dir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Analysis log: which chart was analyzed and which memories matched ───────

// GET /admin/analysis-log
app.get('/admin/analysis-log', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, mode, context, matched, detected, created_at,
              (query_image IS NOT NULL) AS has_query
       FROM analysis_log ORDER BY created_at DESC`
    );
    res.json(rows.map(r => ({ ...r, matched: (() => { try { return JSON.parse(r.matched); } catch { return []; } })() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/analysis-log/:id/image — the analyzed chart screenshot
app.get('/admin/analysis-log/:id/image', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT query_image, query_media FROM analysis_log WHERE id = $1', [req.params.id]
    );
    if (!rows.length || !rows[0].query_image) return res.status(404).send('No image');
    res.set('Content-Type', rows[0].query_media || 'image/jpeg');
    res.send(Buffer.from(rows[0].query_image, 'base64'));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ─── Analyze endpoint ────────────────────────────────────────────────────────
// POST /analyze  { uid, key, mode, context, userMessage, history, screenshotBase64 }

app.post('/analyze', async (req, res) => {
  const { uid, key, mode, context, userMessage, history, screenshotBase64, lang } = req.body;
  console.log(`[analyze] uid=${uid} lang=${lang} mode=${mode}`);
  let systemPrompt = lang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT;

  if (key !== ACCESS_KEY) {
    return res.status(403).json({ error: 'Invalid key' });
  }
  if (!uid) {
    return res.status(400).json({ error: 'No UID' });
  }

  // Verify UID still has access
  if (uid.trim() !== DEMO_UID) {
    try {
      const { rows } = await pool.query('SELECT uid FROM allowed_uids WHERE uid = $1', [uid.trim()]);
      if (rows.length === 0) return res.status(403).json({ error: 'Access denied' });
    } catch (err) {
      return res.status(500).json({ error: 'DB error' });
    }
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  const isDeepMode = (mode === 'long' || mode === 'short');

  // ── Inject trade memory ──────────────────────────────────────────────────
  let memImages = [];
  let matchedInfo = [];
  let detectedTag = null;
  try {
    if (MEMORY_LESSONS > 0) {
      const { rows } = await pool.query(
        'SELECT lesson, outcome FROM trade_memory ORDER BY created_at DESC LIMIT $1',
        [MEMORY_LESSONS]
      );
      if (rows.length) {
        const lessons = rows
          .map((r, i) => `${i + 1}. ${r.lesson}${r.outcome ? ` (итог: ${r.outcome})` : ''}`)
          .join('\n');
        systemPrompt += `\n\nПАМЯТЬ ПРОШЛЫХ СДЕЛОК (справочные уроки трейдера).
ВАЖНО: это НЕ сигнал торговать текущий график так же. Сначала независимо оцени текущий график по правилам выше — приоритет глобального тренда обязателен. Память — лишь дополнительный контекст; она НЕ отменяет приоритет тренда и НЕ должна склонять тебя к контр-трендовому входу только потому, что прошлый похожий паттерн оказался прибыльным. Похожий внешне паттерн в другом тренде может отработать наоборот.
Уроки:\n${lessons}`;
      }
    }
    // Attach reference screenshots only in deep mode (cost control).
    // The Long/Short button decides WHICH side of memory to learn from:
    // pressing Long → only LONG past trades, Short → only SHORT. Among that
    // side, prefer the same formation as the current chart.
    if (isDeepMode && MEMORY_IMAGES > 0 && screenshotBase64) {
      const wantDir = mode === 'long' ? 'лонг' : 'шорт';
      // Classify the current chart only to prefer the same formation; the
      // direction filter comes from the button, not from the classifier.
      const tag = await classifyFormation([
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: screenshotBase64 } },
        { type: 'text', text: 'Классифицируй этот график.' }
      ]);
      detectedTag = tag;
      const detectedPattern = (tag && tag.pattern !== 'нет_паттерна') ? tag.pattern : null;

      const { rows } = await pool.query(
        `SELECT id, image_b64, media_type, lesson, outcome, pattern, direction FROM trade_memory
         WHERE image_b64 IS NOT NULL AND direction = $1
         ORDER BY (pattern = $2) DESC, created_at DESC
         LIMIT $3`,
        [wantDir, detectedPattern, MEMORY_IMAGES]
      );
      memImages = rows;
      matchedInfo = rows.map(r => ({ id: r.id, pattern: r.pattern, direction: r.direction }));
      console.log(`[analyze] mode=${mode} dir=${wantDir} detected=${detectedPattern || 'none'} matched=${rows.map(r => `#${r.id}`).join(' ') || 'none'}`);
    }
  } catch (err) {
    console.error('Memory load error:', err.message);
  }

  // Log this deep analysis (which chart was sent, which memories matched) — best-effort
  if (isDeepMode) {
    try {
      await pool.query(
        `INSERT INTO analysis_log (mode, context, query_image, query_media, matched, detected)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [mode, context || '', screenshotBase64 || null, 'image/jpeg', JSON.stringify(matchedInfo),
         detectedTag ? `${detectedTag.pattern}/${detectedTag.direction}` : null]
      );
      await pool.query(
        `DELETE FROM analysis_log WHERE id NOT IN (
           SELECT id FROM analysis_log ORDER BY created_at DESC LIMIT $1
         )`,
        [LOG_KEEP]
      );
    } catch (err) {
      console.error('Analysis log error:', err.message);
    }
  }

  // Build messages.
  // Conversation history is only relevant for the chat feature (a typed question).
  // Button analyses (long/short/auto) must be independent one-shot reads of the
  // current chart — stale history from earlier tests/other coins would bias them.
  const messages = [];
  if (userMessage && Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  const currentContent = [];

  // Reference screenshots from memory. These charts carry the trader's own
  // markup — read it, don't just glance: 🟢 arrow/dot = trade ENTRY point,
  // 🔴 = trade EXIT (close) point, green horizontal/diagonal lines = the levels
  // and trendlines the trade was built on, % in the title = the result.
  for (const mem of memImages) {
    currentContent.push({ type: 'text', text: `📚 Похожая формация из прошлого${mem.outcome ? ` — итог: ${mem.outcome}` : ''}. Урок: ${mem.lesson}. На картинке ниже разметка трейдера — изучи её:` });
    currentContent.push({ type: 'image', source: { type: 'base64', media_type: mem.media_type || 'image/jpeg', data: mem.image_b64 } });
  }
  if (memImages.length) {
    currentContent.push({ type: 'text', text: `⬆️ Выше — справочные скриншоты прошлых сделок. Как читать разметку на них:
• 🟢 стрелка/точка с пунктиром = МОМЕНТ ВХОДА в сделку (открытие).
• 🔴 стрелка/точка с пунктиром = МОМЕНТ ВЫХОДА (закрытие). Стоп-лосса и тейк-профита на скринах НЕТ — только вход и выход.
• Зелёные горизонтальные и наклонные линии = уровни и трендовые, по которым строилась сделка.
• % в заголовке = итоговый результат сделки.
По каждому примеру определи: ГДЕ был вход относительно зелёных уровней (на пробое уровня / на ретесте пробитого / на отскоке от линии / внутри формации), где он закрылся, и привёл ли такой вход к плюсу. Выбери пример, наиболее похожий на ТЕКУЩУЮ ситуацию по расположению цены относительно уровней, и используй его, чтобы точнее выбрать точку входа и выхода в текущем графике.
⬇️ Ниже — ТЕКУЩИЙ график. Оцени его НЕЗАВИСИМО: сначала глобальный тренд (приоритет!), затем структура. Память подсказывает ГДЕ ставить вход/выход в похожей формации, но НЕ диктует направление — если текущий тренд противоположен примеру, не копируй его направление:` });
  }

  if (screenshotBase64) {
    currentContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: screenshotBase64 }
    });
  }

  let promptText;
  if (userMessage) {
    promptText = userMessage;
  } else if (lang === 'en') {
    if (mode === 'long') {
      promptText = `I'm planning to go LONG${context ? ' on ' + context : ''}. Look at my drawings and current pattern. Should I enter right now? Give probability of success in %.`;
    } else if (mode === 'short') {
      promptText = `I'm planning to go SHORT${context ? ' on ' + context : ''}. Look at my drawings and current pattern. Should I enter right now? Give probability of success in %.`;
    } else {
      promptText = `What's on the chart${context ? ' ' + context : ''}? Long, short or wait?`;
    }
  } else {
    if (mode === 'long') {
      promptText = `Я планирую войти в ЛОНГ${context ? ' по ' + context : ''}. Смотри на мои чертежи и текущий паттерн. Стоит входить прямо сейчас? Дай вероятность успешной отработки в %.`;
    } else if (mode === 'short') {
      promptText = `Я планирую войти в ШОРТ${context ? ' по ' + context : ''}. Смотри на мои чертежи и текущий паттерн. Стоит входить прямо сейчас? Дай вероятность успешной отработки в %.`;
    } else {
      promptText = `Что на графике${context ? ' ' + context : ''}? Лонг, шорт или ждать?`;
    }
  }

  currentContent.push({ type: 'text', text: promptText });
  messages.push({ role: 'user', content: currentContent });

  const model     = isDeepMode ? MODEL_DEEP : MODEL_FAST;
  const maxTokens = isDeepMode ? 400 : 300;

  try {
    const text = await callClaude({ model, maxTokens, system: systemPrompt, messages });
    res.json({ text });
  } catch (err) {
    // Log the real error for debugging, but never leak it (billing/API details) to users
    console.error('Analyze failed:', err.message);
    const friendly = lang === 'en'
      ? '⚠️ Service is temporarily unavailable. Please try again in a couple of minutes.'
      : '⚠️ Сервис временно недоступен. Попробуйте ещё раз через пару минут.';
    res.status(502).json({ error: friendly });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── Start ────────────────────────────────────────────────────────────────────

initDB()
  .then(() => app.listen(PORT, () => console.log(`Server listening on port ${PORT}`)))
  .catch(err => { console.error('Failed to init DB:', err); process.exit(1); });
