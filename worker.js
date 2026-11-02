
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "*"
    };

    const jsonResponse = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8"
        }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // =========================================
    // BIRE FNET MODEL FILE PROXY
    // =========================================

    if (url.pathname.startsWith("/api/model/")) {
      if (!["GET", "HEAD"].includes(request.method)) {
        return jsonResponse({ error: "Method not allowed" }, 405);
      }

      try {
        const prefix = "/api/model/";
        const modelPath = url.pathname.slice(prefix.length);

        const allowedPrefix =
          "onnx-community/BiRefNet_512x512-ONNX/resolve/main/";

        const allowedFiles = [
          "config.json",
          "preprocessor_config.json",
          "onnx/model.onnx"
        ];

        if (!modelPath.startsWith(allowedPrefix)) {
          return jsonResponse({ error: "Model path not allowed" }, 403);
        }

        const filePath = modelPath.slice(allowedPrefix.length);

        if (!allowedFiles.includes(filePath)) {
          return jsonResponse({
            error: "Model file not allowed",
            file: filePath
          }, 403);
        }

        const hfUrl = new URL("https://huggingface.co/" + modelPath);
        hfUrl.search = url.search;

        const headers = new Headers();

        for (const name of [
          "Range",
          "If-Range",
          "If-None-Match",
          "If-Modified-Since",
          "Accept"
        ]) {
          const value = request.headers.get(name);
          if (value) headers.set(name, value);
        }

        const hfResponse = await fetch(hfUrl.toString(), {
          method: request.method,
          headers,
          redirect: "follow"
        });

        const responseHeaders = new Headers(hfResponse.headers);

        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set(
          "Access-Control-Allow-Methods",
          "GET, HEAD, OPTIONS"
        );
        responseHeaders.set("Access-Control-Allow-Headers", "*");
        responseHeaders.set("Access-Control-Expose-Headers", "*");

        return new Response(
          request.method === "HEAD" ? null : hfResponse.body,
          {
            status: hfResponse.status,
            statusText: hfResponse.statusText,
            headers: responseHeaders
          }
        );
      } catch (error) {
        console.error("MODEL PROXY ERROR:", error);

        return jsonResponse({
          error: "Model proxy failed",
          message: error.message
        }, 500);
      }
    }

    // =========================================
    // TEST MODEL FILE
    // =========================================

    if (url.pathname === "/api/test-model") {
      try {
        const testUrl =
          "https://huggingface.co/onnx-community/" +
          "BiRefNet_512x512-ONNX/resolve/main/" +
          "preprocessor_config.json";

        const response = await fetch(testUrl);

        return jsonResponse({
          ok: response.ok,
          status: response.status,
          response: (await response.text()).slice(0, 2000)
        });
      } catch (error) {
        return jsonResponse({ error: error.message }, 500);
      }
    }

    // =========================================
    // TEST CLOUDFLARE AI
    // =========================================

    if (url.pathname === "/api/test-ai") {
      try {
        const result = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          {
            messages: [{
              role: "user",
              content: "Ответь одним словом: работает"
            }]
          }
        );

        return jsonResponse(result);
      } catch (error) {
        return jsonResponse({ error: error.message }, 500);
      }
    }

    // =========================================
    // GENERATE CARD DESIGN
    // =========================================

    if (
      url.pathname === "/api/generate" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const productName = String(body.productName || "")
          .trim()
          .slice(0, 160);

        const characteristics = String(
          body.characteristics || body.features || ""
        ).trim().slice(0, 2000);

        if (!productName) {
          return jsonResponse({
            error: "Введите название товара"
          }, 400);
        }

        // Характеристики берём непосредственно из формы.
        // Они не зависят от того, вернёт ли их нейросеть.

        const userFeatures = characteristics
          .split(/\n|;|•/)
          .map(item => item
            .replace(/^[\s\-–—*•\d.)]+/, "")
            .trim()
          )
          .filter(item => item.length > 1)
          .slice(0, 4);

        const defaults = {
          title: productName,
          subtitle: "Особенности и преимущества",
          design: "hero",
          productPosition: "center",
          titlePosition: "top",
          featuresPosition: "bottom",
          background: "gradient",
          accent: "blue",
          shadow: "soft",
          decoration: "circles"
        };

        let aiData = {};

        const prompt = `
Ты профессиональный арт-директор сервиса инфографики для Wildberries и Ozon.

Создай дизайн карточки товара 900x1200.

Название товара:
${productName}

Характеристики товара:
${characteristics || "Не указаны"}

Верни только JSON без Markdown.

Формат:
{
  "title": "короткий заголовок",
  "subtitle": "короткое пояснение",
  "design": "hero",
  "productPosition": "center",
  "titlePosition": "top",
  "featuresPosition": "bottom",
  "background": "gradient",
  "accent": "blue",
  "shadow": "soft",
  "decoration": "circles"
}

Правила:
- Заголовок максимум 5 слов.
- Не выдумывай свойства и преимущества.
- Не меняй смысл названия товара.
- Не помещай характеристики в заголовок.
- Не добавляй неподтверждённые рекламные обещания.
- Выбирай выразительный, современный дизайн.
- Чередуй стили, не используй постоянно один вариант.
- Для товара оставляй достаточно свободного пространства.
- Выбирай контрастные, гармоничные цвета.

Допустимые значения:

design: hero, split, editorial, dynamic, info, premium
productPosition: left, center, right
titlePosition: top, middle, bottom
featuresPosition: left, right, bottom
background: light, dark, soft, gradient, accent
accent: blue, cyan, green, orange, violet, black
shadow: soft, medium, none
decoration: circles, waves, geometric, glow, lines
`;

        // Если AI вернёт ошибку или некорректный JSON,
        // карточка всё равно сможет создаться.

        try {
          const result = await env.AI.run(
            "@cf/meta/llama-3.1-8b-instruct-fp8",
            {
              messages: [
                {
                  role: "system",
                  content:
                    "Ты арт-директор. Возвращай только корректный JSON."
                },
                {
                  role: "user",
                  content: prompt
                }
              ]
            }
          );

          let answer = String(
            result.response || result.text || ""
          );

          answer = answer
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

          const start = answer.indexOf("{");
          const end = answer.lastIndexOf("}");

          if (start !== -1 && end > start) {
            aiData = JSON.parse(answer.slice(start, end + 1));
          }
        } catch (aiError) {
          console.error("AI DESIGN ERROR:", aiError);
        }

        const allowed = {
          design: [
            "hero", "split", "editorial",
            "dynamic", "info", "premium"
          ],
          productPosition: ["left", "center", "right"],
          titlePosition: ["top", "middle", "bottom"],
          featuresPosition: ["left", "right", "bottom"],
          background: ["light", "dark", "soft", "gradient", "accent"],
          accent: ["blue", "cyan", "green", "orange", "violet", "black"],
          shadow: ["soft", "medium", "none"],
          decoration: ["circles", "waves", "geometric", "glow", "lines"]
        };

        const resultData = { ...defaults };

        for (const [key, values] of Object.entries(allowed)) {
          if (values.includes(aiData[key])) {
            resultData[key] = aiData[key];
          }
        }

        resultData.title = String(
          aiData.title || productName
        ).slice(0, 100);

        resultData.subtitle = String(
          aiData.subtitle || defaults.subtitle
        ).slice(0, 150);

        // Приоритет у характеристик, введённых пользователем.
        // AI не может случайно удалить их.

        const aiFeatures = Array.isArray(aiData.features)
          ? aiData.features
              .filter(item => typeof item === "string")
              .map(item => item.trim())
              .filter(item => item.length > 1)
          : [];

        resultData.features = (
          userFeatures.length ? userFeatures : aiFeatures
        ).slice(0, 4).map(item => item.slice(0, 90));

        return jsonResponse(resultData);

      } catch (error) {
        console.error("GENERATE ERROR:", error);

        return jsonResponse({
          error: error.message
        }, 500);
      }
    }

    // =========================================
    // STATIC WEBSITE FILES
    // =========================================

    return env.ASSETS.fetch(request);
  }
};
