
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

    // Извлечение текста из разных форматов ответа AI
    const readAIText = result => {
      if (typeof result === "string") return result.trim();

      if (!result || typeof result !== "object") return "";

      const candidates = [
        result.response,
        result.result,
        result.text,
        result.content,
        result.output_text,
        result.choices?.[0]?.message?.content,
        result.choices?.[0]?.text,
        result.message?.content
      ];

      for (const value of candidates) {
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }

        if (Array.isArray(value)) {
          const text = value
            .filter(item => typeof item?.text === "string")
            .map(item => item.text)
            .join("\n")
            .trim();

          if (text) return text;
        }
      }

      return "";
    };

    // Извлечение JSON из ответа модели
    const parseJSON = text => {
      const clean = String(text)
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");

      if (start < 0 || end <= start) {
        throw new Error(
          "В ответе модели не найден JSON-объект. Ответ: " +
          clean.slice(0, 1500)
        );
      }

      const jsonText = clean.slice(start, end + 1);

      try {
        return JSON.parse(jsonText);
      } catch (error) {
        throw new Error(
          "JSON от модели содержит ошибку: " +
          error.message +
          ". Фрагмент: " +
          jsonText.slice(0, 1500)
        );
      }
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

    // 4. ПРОВЕРКА VISION-МОДЕЛИ QWEN
    if (
      url.pathname === "/api/test-vision" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();
        const image = String(body.image || "");

        if (!/^data:image\/(jpeg|png|webp);base64,/i.test(image)) {
          return jsonResponse({
            error: "Передайте фото в поле image в формате data:image/jpeg;base64,..."
          }, 400);
        }

        const result = await env.AI.run(
          "@cf/qwen/qwen3.8-27b",
          {
            messages: [{
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Кратко опиши предмет на фото. Ответь по-русски."
                },
                {
                  type: "image_url",
                  image_url: { url: image }
                }
              ]
            }],
            max_completion_tokens: 400,
            reasoning_effort: "low"
          }
        );

        return jsonResponse({
          ok: true,
          model: "@cf/qwen/qwen3.8-27b",
          result: readAIText(result) || result
        });

      } catch (error) {
        console.error("VISION TEST ERROR:", error);

        return jsonResponse({
          ok: false,
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

    // 6. AI-КОМПОЗИЦИЯ: АНАЛИЗ ТОВАРА + FLUX
    if (
      url.pathname === "/api/generate-scene" &&
      request.method === "POST"
    ) {
      let visionResult = null;
      let qwenText = "";

      try {
        const body = await request.json();

        const productName = String(body.productName || "")
          .trim()
          .slice(0, 160);

        const characteristics = String(body.characteristics || "")
          .trim()
          .slice(0, 350);

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
          premium: "premium commercial photography, elegant materials, refined soft lighting",
          editorial: "high-end editorial photography, artistic natural light, subtle textures",
          showcase: "professional product showcase, clean architectural environment",
          lifestyle: "realistic contemporary lifestyle setting, natural daylight",
          infographic: "modern commercial background, clean geometric composition",
          cinematic: "cinematic commercial photography, directional light, realistic depth"
        };

        const selectedStyle = styles[style] || styles.premium;

        // ШАГ 1. QWEN АНАЛИЗИРУЕТ ЗАГРУЖЕННОЕ ФОТО
        const visionPrompt = `
Analyze the attached product photo. Use only visible facts.

Product: ${productName}
Characteristics: ${characteristics || "not provided"}

Identify the category, shape, orientation, visible materials and colors. Do not invent details.

Design a realistic advertising background for this exact object. Describe the environment, support surface, camera perspective, lighting and palette.

Rules:
- Do not include the product or its copies in the background.
- Keep the upper 22% calm for a headline.
- Choose a physically suitable surface or mounting context.
- Write scene descriptions in English.
- Return only valid JSON without Markdown.

Return this structure:
{
  "category": "short category",
  "product_shape": "visible shape and orientation",
  "materials": "visible materials",
  "colors": "main visible colors",
  "visual_description": "scene style and palette",
  "environment": "English environment description",
  "support_surface": "English support surface description",
  "camera_perspective": "English camera perspective",
  "light_direction": "English lighting description",
  "placement": "center",
  "scale": 62,
  "vertical": 58
}

placement: left, center or right.
scale: number from 50 to 78.
vertical: number from 43 to 62.
`;

        visionResult = await env.AI.run(
          "@cf/qwen/qwen3.8-27b",
          {
            messages: [
              {
                role: "system",
                content: "Analyze the real product photo. Do not invent details. Return only valid JSON."
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: visionPrompt
                  },
                  {
                    type: "image_url",
                    image_url: { url: image }
                  }
                ]
              }
            ],
            max_completion_tokens: 1200,
            reasoning_effort: "low",
            temperature: 0.2
          }
        );

        console.log(
          "QWEN FULL RESULT:",
          JSON.stringify(visionResult).slice(0, 5000)
        );

        qwenText = readAIText(visionResult);

        console.log(
          "QWEN EXTRACTED TEXT:",
          qwenText.slice(0, 5000)
        );

        // ШАГ 2. ПРОВЕРКА И РАЗБОР JSON
        let analysis;

        try {
          if (!qwenText) {
            throw new Error("Текст ответа Qwen не найден");
          }

          analysis = parseJSON(qwenText);

        } catch (error) {
          throw new Error(
            "Ошибка разбора Qwen: " +
            error.message +
            ". Ответ модели: " +
            JSON.stringify(visionResult).slice(0, 2500)
          );
        }

        // ШАГ 3. НОРМАЛИЗАЦИЯ ПОЛОЖЕНИЯ ТОВАРА
        const position = ["left", "center", "right"].includes(analysis.placement)
          ? analysis.placement
          : "center";

        const scale = Number.isFinite(Number(analysis.scale))
          ? Math.max(50, Math.min(78, Number(analysis.scale)))
          : 62;

        const vertical = Number.isFinite(Number(analysis.vertical))
          ? Math.max(43, Math.min(62, Number(analysis.vertical)))
          : 58;

        const safeText = (value, max = 450) =>
          String(value || "")
            .replace(/[\r\n]+/g, " ")
            .slice(0, max);

        const category = safeText(analysis.category || productName, 100);
        const productShape = safeText(analysis.product_shape, 350);
        const materials = safeText(analysis.materials, 250);
        const colors = safeText(analysis.colors, 200);
        const visualDescription = safeText(analysis.visual_description, 350);

        const environment = safeText(
          analysis.environment || "A clean modern commercial interior",
          650
        );

        const supportSurface = safeText(analysis.support_surface, 250);
        const cameraPerspective = safeText(analysis.camera_perspective, 250);
        const lightDirection = safeText(analysis.light_direction, 250);

        // ШАГ 4. FLUX СОЗДАЁТ ФОН
        const finalPrompt = [
          "Create a photorealistic vertical 3:4 premium marketplace advertising background, not a finished poster.",
          "PRODUCT CATEGORY: " + category + ".",
          "REFERENCE PRODUCT SILHOUETTE: " + productShape + ".",
          "VISIBLE MATERIALS: " + materials + ".",
          "VISIBLE PRODUCT COLORS: " + colors + ".",
          "SCENE PALETTE: " + visualDescription + ".",
          "ENVIRONMENT: " + environment + ".",
          "SUPPORTING SURFACE: " + supportSurface + ".",
          "CAMERA: " + cameraPerspective + ".",
          "LIGHTING: " + lightDirection + ".",
          "VISUAL STYLE: " + selectedStyle + ".",
          "Compose the environment around the reference object's real silhouette and proportions.",
          "The lower-middle " + position + " region is reserved for compositing the real product.",
          "Include a believable support plane, ledge, tabletop, floor or mounting context when appropriate.",
          "Make perspective, reflections and light direction coherent with a real object placed in the reserved region.",
          "Use natural ambient occlusion and realistic depth. Avoid a flat studio gradient.",
          "Keep the upper 22 percent visually calm for a headline.",
          "BACKGROUND ONLY: do not draw the product, replicas, similar objects, product parts, silhouettes, placeholder objects or fake product shadows.",
          "No text, letters, numbers, typography, logos, labels, watermark or people."
        ].join(" ").slice(0, 2048);

        console.log("FLUX PROMPT LENGTH:", finalPrompt.length);

        const imageResult = await env.AI.run(
          "@cf/black-forest-labs/flux-1-schnell",
          {
            prompt: finalPrompt,
            steps: 8
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

        const message = String(error?.message || "");

        return jsonResponse({
          error: message || "Не удалось создать рекламное окружение",
          qwen_text: qwenText
            ? qwenText.slice(0, 2500)
            : null,
          qwen_full_result: visionResult
            ? JSON.stringify(visionResult).slice(0, 4000)
            : null
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
