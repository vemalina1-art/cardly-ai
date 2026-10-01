export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    // Проверка AI
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


    // Генерация контента карточки
    if (url.pathname === "/api/generate" && request.method === "POST") {

      try {

        const data = await request.json();

        const productName = data.productName || "";
        const features = data.features || "";


        const prompt = `
Ты — профессиональный дизайнер маркетплейсов и копирайтер.

Создай структуру инфографики для карточки товара.

Товар:
${productName}

Характеристики товара:
${features}


ВАЖНЫЕ ПРАВИЛА:

- Используй ТОЛЬКО информацию, которую дал пользователь.
- Не придумывай характеристики.
- Не придумывай сертификаты, гарантии, материалы, технологии или преимущества.
- Текст должен быть коротким и продающим.
- Сделай структуру подходящей для Wildberries/Ozon.
- Не используй слишком длинные предложения.
- Выбирай layout в зависимости от типа товара и количества информации.


Верни ТОЛЬКО JSON такого формата:

{
  "title": "короткий заголовок",
  "subtitle": "короткое описание",
  "features": [
    "преимущество 1",
    "преимущество 2",
    "преимущество 3",
    "преимущество 4"
  ],
  "layout": "hero"
}


В поле layout используй ТОЛЬКО одно из:

hero
split
editorial
minimal
product-focus
badge
`;


        const result = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          {
            messages: [
              {
                role: "system",
                content:
                  "Ты создаёшь структурированные данные для дизайна карточек товаров."
              },
              {
                role: "user",
                content: prompt
              }
            ]
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

            title: productName || "Ваш товар",

            subtitle:
              "Основные характеристики товара",

            features: features
              .split("\n")
              .filter(Boolean)
              .slice(0, 4),

            layout: "hero"

          };

        }


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


    // Показываем сайт
    return env.ASSETS.fetch(request);

  }
};
