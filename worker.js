
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

    // 1. ПРОКСИ BIRE FNET — УДАЛЕНИЕ ФОНА
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

    // 2. ПРОВЕРКА МОДЕЛИ BIRE FNET
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

    // 3. ПРОВЕРКА ТЕКСТОВОЙ LLAMA
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

    // 4. VISION ОТКЛЮЧЁН
    if (
      url.pathname === "/api/test-vision" &&
      request.method === "POST"
    ) {
      return jsonResponse({
        ok: false,
        disabled: true,
        message:
          "Vision отключён. Для AI-композиции используется текстовая модель."
      }, 410);
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

    // 6. AI-КОМПОЗИЦИЯ: LLAMA 3.1 + FLUX
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
            error: "Не получено фото товара"
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

        // ШАГ 1. LLAMA 3.1 ПОДБИРАЕТ СЦЕНУ
        const prompt = `
Ты профессиональный арт-директор рекламных карточек маркетплейсов.

Придумай подходящее окружение для фотографии товара.

Название товара: ${productName}

Характеристики:
${characteristics || "Дополнительные характеристики не указаны."}

Стиль:
${selectedStyle}

Правила:
- Подбирай окружение именно под указанный товар.
- Не выдумывай характеристики.
- Фон будет создан отдельно.
- Оригинальная фотография товара будет наложена поверх фона.
- Не добавляй на фон сам товар, его копии или похожие изделия.
- Для сантехники используй подходящий интерьер ванной комнаты.
- Для косметики используй эстетичное окружение с подходящими материалами.
- Для электроники используй современную технологичную обстановку.
- Для одежды и аксессуаров используй подходящую коммерческую сцену.
- Оставь верхнюю часть изображения свободной для заголовка.
- Оставь свободное пространство для размещения товара.

Верни только JSON без Markdown:

{
  "category": "категория товара",
  "visual_description": "описание цветовой гаммы и визуального характера",
  "environment": "подробное описание фона на английском языке",
  "placement": "center",
  "scale": 68,
  "vertical": 55
}

placement: left, center или right.
scale: число от 50 до 78.
vertical: число от 43 до 62.
`;

        const textResult = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          {
            messages: [
              {
                role: "system",
                content:
                  "Ты профессиональный арт-директор. Возвращай только корректный JSON без пояснений."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            max_tokens: 650,
            temperature: 0.3
          }
        );

        const analysis = parseJSON(readAIText(textResult));

        // ШАГ 2. ПРОВЕРКА ПАРАМЕТРОВ
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
          analysis.environment ||
          "A clean modern commercial interior"
        ).slice(0, 900);

        // ШАГ 3. FLUX СОЗДАЁТ ТОЛЬКО ФОН
        const finalPrompt = [
          "Create a photorealistic vertical 3:4 commercial advertising background.",
          "PRODUCT CATEGORY: " + category + ".",
          "COLOR AND VISUAL CHARACTER: " + visualDescription + ".",
          "ENVIRONMENT: " + environment + ".",
          "VISUAL STYLE: " + selectedStyle + ".",
          "Create a realistic coherent environment with believable perspective, professional lighting and refined materials.",
          "Leave a clear unobstructed display zone in the " + position + " area around the lower-middle part of the image.",
          "Keep the upper 25 percent visually calm and uncluttered for a headline.",
          "BACKGROUND ONLY. Do not generate any product, replica, similar item, product parts or competing hero object.",
          "For installation scenes, leave the actual mounting position empty.",
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
          error: error.message ||
            "Не удалось создать дизайн"
        }, 500);
      }
    }

    // 8. СТАТИЧЕСКИЕ ФАЙЛЫ САЙТА
    return env.ASSETS.fetch(request);
  }
};
