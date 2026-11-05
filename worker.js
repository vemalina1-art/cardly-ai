
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "*"
    };

    const jsonResponse = (data, status = 200, extraHeaders = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          ...extraHeaders,
          "Content-Type": "application/json; charset=utf-8"
        }
      });

    const imageResponse = (base64, layout) => {
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));

      return new Response(bytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
          "X-Cardly-Position": layout.position,
          "X-Cardly-Scale": String(layout.scale),
          "X-Cardly-Vertical": String(layout.vertical)
        }
      });
    };

    const readAIText = result =>
      String(result?.response || result?.result || result?.text || "").trim();

    const parseJSON = text => {
      const clean = String(text)
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");

      if (start < 0 || end <= start) {
        throw new Error("AI не вернул корректный JSON");
      }

      return JSON.parse(clean.slice(start, end + 1));
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // 1. ПРОКСИ BIRE FNET — НЕОБХОДИМ ДЛЯ УДАЛЕНИЯ ФОНА
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

        const hfUrl = new URL(
          "https://huggingface.co/" + modelPath
        );

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

        for (const [key, value] of Object.entries(corsHeaders)) {
          responseHeaders.set(key, value);
        }

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

    // 2. ПРОВЕРКА МОДЕЛИ
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

    // 3. ПРОВЕРКА LLAMA
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

    // 4. ПРОВЕРКА VISION
    if (
      url.pathname === "/api/test-vision" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();
        const image = String(body.image || "");

        if (!/^data:image\/(jpeg|png|webp);base64,/i.test(image)) {
          return jsonResponse({
            error: "Передайте фотографию в формате Data URL"
          }, 400);
        }

        const result = await env.AI.run(
          "@cf/meta/llama-3.2-11b-vision-instruct",
          {
            messages: [
              {
                role: "system",
                content: "Ты анализируешь фотографии товаров."
              },
              {
                role: "user",
                content:
                  "Опиши товар на фотографии: тип, форму, цвет, материал и назначение. Не выдумывай невидимые характеристики."
              }
            ],
            image,
            max_tokens: 300
          }
        );

        return jsonResponse({
          ok: true,
          result
        });

      } catch (error) {
        console.error("VISION TEST ERROR:", error);

        return jsonResponse({
          error: error.message
        }, 500);
      }
    }

    // 5. ПРОВЕРКА FLUX
    if (
      url.pathname === "/api/test-image" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const prompt = String(body.prompt || "")
          .trim()
          .slice(0, 2048);

        const steps = Math.min(
          8,
          Math.max(4, Number(body.steps) || 4)
        );

        if (!prompt) {
          return jsonResponse({
            error: "Введите описание сцены"
          }, 400);
        }

        const result = await env.AI.run(
          "@cf/black-forest-labs/flux-1-schnell",
          { prompt, steps }
        );

        if (!result?.image) {
          throw new Error("Модель не вернула изображение");
        }

        return imageResponse(result.image, {
          position: "center",
          scale: 68,
          vertical: 55
        });

      } catch (error) {
        console.error("IMAGE GENERATION ERROR:", error);

        return jsonResponse({
          error: error.message
        }, 500);
      }
    }

    // 6. УМНАЯ ГЕНЕРАЦИЯ СЦЕНЫ С АНАЛИЗОМ ФОТОГРАФИИ
    if (
      url.pathname === "/api/generate-scene" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const productName = String(body.productName || "")
          .trim()
          .slice(0, 160);

        const characteristics = String(body.characteristics || "")
          .trim()
          .slice(0, 1200);

        const style = String(body.style || "premium")
          .trim()
          .slice(0, 40);

        const image = String(body.image || "");

        if (!productName) {
          return jsonResponse({
            error: "Введите название товара"
          }, 400);
        }

        if (!/^data:image\/(jpeg|png|webp);base64,/i.test(image)) {
          return jsonResponse({
            error: "Не получено фото товара для анализа"
          }, 400);
        }

        if (image.length > 7_000_000) {
          return jsonResponse({
            error: "Изображение слишком большое"
          }, 413);
        }

        const styles = {
          premium:
            "premium commercial photography, elegant materials, refined lighting",

          editorial:
            "high-end editorial photography, artistic natural light, subtle textures",

          showcase:
            "professional product showcase, clean architectural environment",

          lifestyle:
            "realistic contemporary lifestyle setting, natural daylight",

          infographic:
            "modern commercial background, clean geometric composition",

          cinematic:
            "cinematic commercial photography, directional light, realistic depth"
        };

        const selectedStyle =
          styles[style] || styles.premium;

        // СНАЧАЛА АНАЛИЗИРУЕМ РЕАЛЬНОЕ ФОТО ТОВАРА
        const visionPrompt = [
          "Проанализируй фотографию одного товара для карточки маркетплейса.",
          "Название товара: " + productName,
          "Дополнительная информация: " + characteristics,
          "Определи фактический тип предмета, его форму, цвет, материал и назначение.",
          "Не выдумывай характеристики, которых нельзя увидеть.",
          "Подбери реалистичное окружение, которое подходит именно этому товару.",
          "Фон будет сгенерирован отдельно, а исходная фотография товара будет наложена поверх.",
          "Поэтому на фоне не должно быть самого товара, его копий, похожих изделий или деталей этого изделия.",
          "Если это товар для установки, например смеситель или душевая фурнитура, предложи интерьер и оставь место установки пустым.",
          "Если это одежда, обувь, косметика, электроника или другая категория, предложи подходящую сцену.",
          "Верни только JSON без Markdown.",
          'Формат: {"category":"категория","visual_description":"видимые особенности","environment":"описание окружения на английском языке","placement":"left или center или right","scale":68,"vertical":55}.',
          "scale — число от 50 до 78.",
          "vertical — число от 43 до 62.",
          "Оставь верхнюю область свободной для заголовка."
        ].join("\n");

        const visionResult = await env.AI.run(
          "@cf/meta/llama-3.2-11b-vision-instruct",
          {
            messages: [
              {
                role: "system",
                content:
                  "Ты профессиональный визуальный аналитик товаров. Возвращай только корректный JSON."
              },
              {
                role: "user",
                content: visionPrompt
              }
            ],
            image,
            max_tokens: 650,
            temperature: 0.2
          }
        );

        const analysis = parseJSON(readAIText(visionResult));

        // Проверяем расположение и размер товара
        const position = ["left", "center", "right"].includes(
          analysis.placement
        ) ? analysis.placement : "center";

        const scale = Number.isFinite(Number(analysis.scale))
          ? Math.max(50, Math.min(78, Number(analysis.scale)))
          : 68;

        const vertical = Number.isFinite(Number(analysis.vertical))
          ? Math.max(43, Math.min(62, Number(analysis.vertical)))
          : 55;

        const category = String(
          analysis.category || productName
        ).slice(0, 100);

        const visualDescription = String(
          analysis.visual_description || ""
        ).slice(0, 500);

        const environment = String(
          analysis.environment || ""
        ).slice(0, 900);

        // ПОТОМ FLUX СОЗДАЁТ ТОЛЬКО ФОН
        const finalPrompt = [
          "Create a photorealistic vertical 3:4 commercial advertising background.",
          "PRODUCT CATEGORY: " + category + ".",
          "VISIBLE PRODUCT DESCRIPTION FOR COLOR MATCHING ONLY: " + visualDescription + ".",
          "ENVIRONMENT: " + environment + ".",
          "VISUAL STYLE: " + selectedStyle + ".",
          "Create a coherent real-world scene with believable perspective, realistic materials and professional commercial lighting.",
          "Leave a clear unobstructed display zone in the " + position + " area around the lower-middle part of the image.",
          "Keep the upper 25 percent visually calm and uncluttered for a headline.",
          "BACKGROUND ONLY: absolutely no product, no replica, no similar item, no product parts and no competing hero object.",
          "For installation scenes, show the surrounding environment but leave the actual mounting position empty.",
          "No text, letters, numbers, typography, logos, labels, watermark or people."
        ].join(" ").slice(0, 2048);

        const imageResult = await env.AI.run(
          "@cf/black-forest-labs/flux-1-schnell",
          {
            prompt: finalPrompt,
            steps: 6
          }
        );

        if (!imageResult?.image) {
          throw new Error("FLUX не вернул изображение рекламной сцены");
        }

        return imageResponse(imageResult.image, {
          position,
          scale,
          vertical
        });

      } catch (error) {
        console.error("AD SCENE GENERATION ERROR:", error);

        return jsonResponse({
          error: error.message ||
            "Не удалось создать рекламное окружение"
        }, 500);
      }
    }

    // 7. ОБЫЧНАЯ ГЕНЕРАЦИЯ КАРТОЧКИ
    if (
      url.pathname === "/api/generate" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const productName = String(
          body.productName || ""
        ).trim().slice(0, 160);

        const characteristics = String(
          body.characteristics || body.features || ""
        ).slice(0, 2000);

        if (!productName) {
          return jsonResponse({
            error: "Введите название товара"
          }, 400);
        }

        const prompt = `
Ты арт-директор сервиса инфографики для маркетплейсов.
Создай структуру дизайна карточки 900x1200.
Не выдумывай характеристики.

Название: ${productName}
Характеристики: ${characteristics}

Верни только JSON:
{
"title":"короткий заголовок",
"subtitle":"короткое пояснение",
"features":["преимущество 1","преимущество 2"],
"design":"hero",
"productPosition":"center",
"titlePosition":"top",
"featuresPosition":"bottom",
"background":"light",
"accent":"blue",
"shadow":"soft",
"decoration":"none"
}

Заголовок максимум 5 слов.
В features только подтверждённые факты.
Максимум 4 преимущества.

Допустимые значения:
design: hero, split, editorial, dynamic, info, premium
productPosition: left, center, right
titlePosition: top, middle, bottom
featuresPosition: left, right, bottom
background: light, dark, soft, gradient, accent
accent: blue, cyan, green, orange, violet, black
shadow: soft, medium, none
decoration: none
`;

        const result = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          {
            messages: [
              {
                role: "system",
                content:
                  "Ты профессиональный арт-директор. Возвращай только валидный JSON."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            max_tokens: 500,
            temperature: 0.35
          }
        );

        const data = parseJSON(readAIText(result));

        const allowed = {
          design: [
            "hero", "split", "editorial",
            "dynamic", "info", "premium"
          ],
          productPosition: ["left", "center", "right"],
          titlePosition: ["top", "middle", "bottom"],
          featuresPosition: ["left", "right", "bottom"],
          background: ["light", "dark", "soft", "gradient", "accent"],
          accent: ["blue", "cyan", "green", "orange", "violet", "black"]
        };

        const defaults = {
          design: "hero",
          productPosition: "center",
          titlePosition: "top",
          featuresPosition: "bottom",
          background: "light",
          accent: "blue"
        };

        for (const [key, values] of Object.entries(allowed)) {
          if (!values.includes(data[key])) {
            data[key] = defaults[key];
          }
        }

        data.title = String(
          data.title || productName
        ).slice(0, 100);

        data.subtitle = String(
          data.subtitle || ""
        ).slice(0, 150);

        data.features = Array.isArray(data.features)
          ? data.features
              .filter(item => typeof item === "string")
              .slice(0, 4)
              .map(item => item.slice(0, 90))
          : [];

        return jsonResponse(data);

      } catch (error) {
        console.error("GENERATE ERROR:", error);

        return jsonResponse({
          error: error.message || "Не удалось создать дизайн"
        }, 500);
      }
    }

    // 8. СТАТИЧЕСКИЕ ФАЙЛЫ САЙТА
    return env.ASSETS.fetch(request);
  }
};
