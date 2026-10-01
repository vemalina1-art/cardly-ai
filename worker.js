export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    // =========================
    // TEST AI
    // =========================

    if (url.pathname === "/api/test-ai") {
      try {

        const response = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          {
            messages: [
              {
                role: "user",
                content:
                  "Ответь одним коротким предложением: что такое инфографика для карточки товара?"
              }
            ]
          }
        );

        return Response.json(response);

      } catch (error) {

        return Response.json(
          { error: error.message },
          { status: 500 }
        );

      }
    }


    // =========================
    // GENERATE CARD
    // =========================

    if (
      url.pathname === "/api/generate" &&
      request.method === "POST"
    ) {

      try {

        const data = await request.json();

        const productName = data.productName || "";
        const features = data.features || "";


        const prompt = `
Ты — профессиональный дизайнер инфографики для Wildberries и Ozon.

Тебе нужно спроектировать ОДНУ красивую карточку товара размером 900x1200.

ТОВАР:
${productName}

ХАРАКТЕРИСТИКИ:
${features}


ГЛАВНОЕ ПРАВИЛО:

Используй ТОЛЬКО информацию, которую дал пользователь.

НЕЛЬЗЯ:
- придумывать характеристики;
- придумывать материалы;
- придумывать сертификаты;
- придумывать гарантии;
- придумывать технологии;
- придумывать преимущества, которых нет в описании.


ТЕКСТ:

Создай:
- короткий title;
- короткий subtitle;
- максимум 4 коротких преимущества.

Текст должен выглядеть как настоящая marketplace-инфографика.


ТЕПЕРЬ СПРОЕКТИРУЙ КОМПОЗИЦИЮ.


ВЫБЕРИ ОДИН DESIGN:

hero
split
editorial
dynamic
info
premium


ОПИСАНИЕ DESIGN:

hero:
Большой товар является главным объектом.
Товар обычно находится снизу или по центру.
Заголовок сверху.
Минимум декоративных элементов.

split:
Карточка делится на две визуальные зоны.
Товар справа или слева.
Текст находится в противоположной части.

editorial:
Стиль современного журнала.
Асимметричная композиция.
Большой заголовок.
Декоративные линии и небольшие текстовые элементы.

dynamic:
Более энергичная композиция.
Товар может находиться в углу.
Используй диагональные или круглые декоративные элементы.
Текст может быть смещён относительно центра.

info:
Товар является центральным объектом.
Характеристики располагаются вокруг него.
Можно использовать линии, точки, небольшие карточки характеристик.

premium:
Много свободного пространства.
Минималистичная композиция.
Большой качественный товар.
Мягкая тень.
Небольшое количество текста.


ПОЗИЦИЯ ТОВАРА:

Выбери одну:

center
center-bottom
center-top
left
right
left-bottom
right-bottom
left-top
right-top


МАСШТАБ ТОВАРА:

Число от 0.55 до 0.95.

0.55 = небольшой товар.
0.95 = очень крупный товар.


ПОЗИЦИЯ TITLE:

Выбери:

top-left
top-center
top-right
middle-left
middle-right
bottom-left


ПОЗИЦИЯ FEATURES:

Выбери:

left
right
bottom
bottom-left
bottom-right
around


ФОН:

Выбери:

light
dark
gradient
soft
accent


ACCENT:

Выбери один:

blue
cyan
green
orange
violet
red
none


SHADOW:

Выбери:

none
soft
medium


DECORATION:

Выбери:

none
lines
circles
blobs
grid
diagonal


Верни ТОЛЬКО JSON.

Формат:

{
  "title": "",
  "subtitle": "",
  "features": [
    "",
    "",
    "",
    ""
  ],
  "design": "",
  "productPosition": "",
  "productScale": 0.8,
  "titlePosition": "",
  "featuresPosition": "",
  "background": "",
  "accent": "",
  "shadow": "",
  "decoration": ""
}
`;


        const result = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          {
            messages: [
              {
                role: "system",
                content:
                  "Ты профессиональный дизайнер marketplace-инфографики. Всегда возвращай только JSON без Markdown."
              },
              {
                role: "user",
                content: prompt
              }
            ],

            temperature: 0.8,

            max_tokens: 700
          }
        );


        const raw = result.response || "";


        let generated;


        try {

          const match = raw.match(/\{[\s\S]*\}/);

          generated = JSON.parse(
            match ? match[0] : raw
          );

        } catch {

          generated = {

            title:
              productName || "Ваш товар",

            subtitle:
              "Основные характеристики",

            features:
              features
                .split("\n")
                .map(x => x.trim())
                .filter(Boolean)
                .slice(0, 4),

            design: "hero",

            productPosition: "center-bottom",

            productScale: 0.8,

            titlePosition: "top-left",

            featuresPosition: "bottom-left",

            background: "light",

            accent: "blue",

            shadow: "soft",

            decoration: "none"

          };

        }


        // =========================
        // SAFETY DEFAULTS
        // =========================

        const allowedDesigns = [
          "hero",
          "split",
          "editorial",
          "dynamic",
          "info",
          "premium"
        ];

        const allowedPositions = [
          "center",
          "center-bottom",
          "center-top",
          "left",
          "right",
          "left-bottom",
          "right-bottom",
          "left-top",
          "right-top"
        ];

        const allowedBackgrounds = [
          "light",
          "dark",
          "gradient",
          "soft",
          "accent"
        ];

        const allowedAccents = [
          "blue",
          "cyan",
          "green",
          "orange",
          "violet",
          "red",
          "none"
        ];

        const allowedShadows = [
          "none",
          "soft",
          "medium"
        ];

        const allowedDecorations = [
          "none",
          "lines",
          "circles",
          "blobs",
          "grid",
          "diagonal"
        ];


        if (!allowedDesigns.includes(generated.design)) {
          generated.design = "hero";
        }

        if (
          !allowedPositions.includes(
            generated.productPosition
          )
        ) {
          generated.productPosition =
            "center-bottom";
        }

        if (
          !allowedBackgrounds.includes(
            generated.background
          )
        ) {
          generated.background = "light";
        }

        if (
          !allowedAccents.includes(
            generated.accent
          )
        ) {
          generated.accent = "blue";
        }

        if (
          !allowedShadows.includes(
            generated.shadow
          )
        ) {
          generated.shadow = "soft";
        }

        if (
          !allowedDecorations.includes(
            generated.decoration
          )
        ) {
          generated.decoration = "none";
        }


        generated.productScale =
          Math.min(
            0.95,
            Math.max(
              0.55,
              Number(generated.productScale) || 0.8
            )
          );


        return Response.json(generated);


      } catch (error) {

        return Response.json(
          {
            error: error.message
          },
          {
            status: 500
          }
        );

      }
    }


    // =========================
    // WEBSITE
    // =========================

    return env.ASSETS.fetch(request);

  }
};
