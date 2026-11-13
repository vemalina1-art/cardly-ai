
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "*"
    };

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...cors,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });

    const imageResponse = (base64, layout = {}) => {
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));

      return new Response(bytes, {
        headers: {
          ...cors,
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
          "X-Cardly-Position": layout.position || "center",
          "X-Cardly-Scale": String(layout.scale || 68),
          "X-Cardly-Vertical": String(layout.vertical || 55)
        }
      });
    };

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
          const found = value
            .filter(item => typeof item?.text === "string")
            .map(item => item.text)
            .join("\n")
            .trim();

          if (found) return found;
        }
      }

      return "";
    };

    const parseJSON = text => {
      const clean = String(text || "")
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");

      if (start < 0 || end <= start) {
        throw new Error("AI не вернул JSON");
      }

      return JSON.parse(clean.slice(start, end + 1));
    };

    const safeText = (value, max = 200) =>
      String(value || "")
        .replace(/[<>]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: cors
      });
    }

    // --------------------------------------------------
    // 1. BIRE FNET MODEL PROXY
    // --------------------------------------------------

    if (url.pathname.startsWith("/api/model/")) {
      if (!["GET", "HEAD"].includes(request.method)) {
        return json({ error: "Method not allowed" }, 405);
      }

      try {
        const modelPath = url.pathname.slice("/api/model/".length);

        const prefix =
          "onnx-community/BiRefNet_512x512-ONNX/resolve/main/";

        const allowed = [
          "config.json",
          "preprocessor_config.json",
          "onnx/model.onnx"
        ];

        if (!modelPath.startsWith(prefix)) {
          return json({ error: "Model path not allowed" }, 403);
        }

        const file = modelPath.slice(prefix.length);

        if (!allowed.includes(file)) {
          return json({ error: "Model file not allowed" }, 403);
        }

        const target = new URL(
          "https://huggingface.co/" + modelPath
        );

        target.search = url.search;

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

        const response = await fetch(target, {
          method: request.method,
          headers,
          redirect: "follow"
        });

        const responseHeaders = new Headers(response.headers);

        Object.entries(cors).forEach(([key, value]) => {
          responseHeaders.set(key, value);
        });

        return new Response(
          request.method === "HEAD" ? null : response.body,
          {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
          }
        );

      } catch (error) {
        console.error("MODEL PROXY:", error);
        return json({ error: error.message }, 500);
      }
    }

    // --------------------------------------------------
    // 2. MODEL TESTS
    // --------------------------------------------------

    if (url.pathname === "/api/test-model") {
      try {
        const response = await fetch(
          "https://huggingface.co/onnx-community/" +
          "BiRefNet_512x512-ONNX/resolve/main/" +
          "preprocessor_config.json"
        );

        return json({
          ok: response.ok,
          status: response.status,
          response: (await response.text()).slice(0, 1500)
        });

      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

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

        return json(result);

      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (
      url.pathname === "/api/test-vision" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();
        const image = String(body.image || "");

        if (!/^data:image\/(jpeg|png|webp);base64,/i.test(image)) {
          return json({ error: "Некорректное изображение" }, 400);
        }

        const result = await env.AI.run(
          "@cf/qwen/qwen3.8-27b",
          {
            messages: [{
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Опиши видимый товар, его форму, цвет и материалы. Не выдумывай детали. Ответь по-русски."
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

        return json({
          ok: true,
          result: readAIText(result)
        });

      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    // --------------------------------------------------
    // 3. FLUX TEST
    // --------------------------------------------------

    if (
      url.pathname === "/api/test-image" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const prompt = safeText(body.prompt, 2048);

        if (!prompt) {
          return json({ error: "Введите описание сцены" }, 400);
        }

        const result = await env.AI.run(
          "@cf/black-forest-labs/flux-1-schnell",
          {
            prompt,
            steps: 8
          }
        );

        if (!result?.image) {
          throw new Error("FLUX не вернул изображение");
        }

        return imageResponse(result.image);

      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    // --------------------------------------------------
    // 4. PRODUCT SCENE GENERATION
    // --------------------------------------------------

    if (
      url.pathname === "/api/generate-scene" &&
      request.method === "POST"
    ) {
      let visionText = "";

      try {
        const body = await request.json();

        const productName = safeText(body.productName, 160);
        const characteristics = safeText(body.characteristics, 500);
        const style = safeText(body.style || "premium", 40);
        const image = String(body.image || "");

        if (!productName) {
          return json({ error: "Введите название товара" }, 400);
        }

        if (!/^data:image\/(jpeg|png|webp);base64,/i.test(image)) {
          return json({ error: "Не получено фото товара" }, 400);
        }

        if (image.length > 7_000_000) {
          return json({ error: "Изображение слишком большое" }, 413);
        }

        const styleDescriptions = {
          premium:
            "luxury commercial product photography, refined materials, elegant architectural details, soft natural lighting",

          editorial:
            "high-end editorial art direction, sophisticated composition, tactile materials, restrained color palette",

          showcase:
            "clean premium product showcase, modern architectural environment, controlled studio lighting",

          lifestyle:
            "realistic contemporary interior, natural daylight, authentic everyday environment",

          infographic:
            "clean modern commercial environment, graphic geometric architecture, bright balanced palette",

          cinematic:
            "cinematic commercial photography, dramatic but realistic directional lighting, atmospheric depth"
        };

        const selectedStyle =
          styleDescriptions[style] || styleDescriptions.premium;

        // ANALYZE REAL PRODUCT PHOTO

        const visionPrompt = `
Analyze the attached real product photograph.

Product name: ${productName}
Additional facts: ${characteristics || "Not provided"}

Use only details actually visible in the photograph.

Identify:
- product category
- exact visible shape
- orientation
- visible colors
- visible materials
- approximate proportions
- suitable real-world environment
- suitable supporting surface
- camera perspective
- light direction

The real product will be composited separately.
Do not generate or describe a replacement product.

Create an environment that makes sense for this exact product.

The environment must be visually attractive, realistic and commercially usable.

Keep the upper area relatively calm for graphic typography.
Reserve a suitable area for the real product.

Return only JSON:

{
  "category": "",
  "shape": "",
  "colors": "",
  "materials": "",
  "environment": "",
  "surface": "",
  "camera": "",
  "lighting": "",
  "position": "center",
  "scale": 78,
  "vertical": 56
}

Position must be left, center or right.
Scale must be between 55 and 95.
Vertical must be between 40 and 65.
`;

        const vision = await env.AI.run(
          "@cf/qwen/qwen3.8-27b",
          {
            messages: [
              {
                role: "system",
                content:
                  "You are a professional product photographer and art director. Analyze the supplied image carefully. Never invent product details. Return valid JSON only."
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

        visionText = readAIText(vision);

        console.log("VISION:", visionText.slice(0, 3000));

        const analysis = parseJSON(visionText);

        const position = ["left", "center", "right"].includes(
          analysis.position
        ) ? analysis.position : "center";

        const scale = Math.max(
          55,
          Math.min(95, Number(analysis.scale) || 78)
        );

        const vertical = Math.max(
          40,
          Math.min(65, Number(analysis.vertical) || 56)
        );

        const category = safeText(analysis.category, 120);
        const shape = safeText(analysis.shape, 250);
        const colors = safeText(analysis.colors, 150);
        const materials = safeText(analysis.materials, 150);
        const environment = safeText(analysis.environment, 400);
        const surface = safeText(analysis.surface, 200);
        const camera = safeText(analysis.camera, 200);
        const lighting = safeText(analysis.lighting, 200);

        const prompt = [
          "Create a photorealistic vertical 3:4 commercial product photography background.",
          "This is a BACKGROUND PLATE, not a finished poster.",
          "Product category: " + category + ".",
          "Real product shape reference: " + shape + ".",
          "Visible product colors: " + colors + ".",
          "Visible materials: " + materials + ".",
          "Environment: " + environment + ".",
          "Supporting surface: " + surface + ".",
          "Camera perspective: " + camera + ".",
          "Lighting: " + lighting + ".",
          "Art direction: " + selectedStyle + ".",
          "Create a believable physical environment suitable for this exact category of product.",
          "Use realistic architectural scale and coherent perspective.",
          "Use natural material textures and controlled commercial lighting.",
          "Create realistic depth, soft ambient light and subtle reflections.",
          "Leave enough negative space for the real product to be composited later.",
          "Keep the upper region visually calm for a headline.",
          "Do not generate the product itself.",
          "Do not generate copies, silhouettes, product parts or substitute objects.",
          "Do not generate text, letters, numbers, labels, logos or watermarks.",
          "No people.",
          "Avoid generic abstract gradients, fantasy interiors, plastic-looking materials and excessive decoration."
        ].join(" ").slice(0, 2048);

        const generated = await env.AI.run(
          "@cf/black-forest-labs/flux-1-schnell",
          {
            prompt,
            steps: 8
          }
        );

        if (!generated?.image) {
          throw new Error("FLUX не вернул фон");
        }

        return imageResponse(generated.image, {
          position,
          scale,
          vertical
        });

      } catch (error) {
        console.error("SCENE ERROR:", error);

        return json({
          error: error.message || "Ошибка создания фона",
          vision: visionText.slice(0, 2000)
        }, 500);
      }
    }

    // --------------------------------------------------
    // 5. CARD DESIGN GENERATION
    // --------------------------------------------------

    if (
      url.pathname === "/api/generate" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const productName = safeText(body.productName, 160);
        const characteristics = safeText(
          body.characteristics || body.features || "",
          2000
        );

        const style = safeText(body.style || "premium", 40);

        if (!productName) {
          return json({ error: "Введите название товара" }, 400);
        }

        const designPrompt = `
Ты — профессиональный арт-директор международного сервиса дизайна карточек маркетплейсов.

Создай концепцию красивой продающей карточки товара размером 900x1200.

ТОВАР:
${productName}

ПОДТВЕРЖДЁННЫЕ ХАРАКТЕРИСТИКИ:
${characteristics || "Дополнительные характеристики не указаны."}

СТИЛЬ:
${style}

Требования:
- Выбирай современную профессиональную композицию.
- Не делай скучный шаблон с обычным текстом внизу.
- Заголовок должен быть коротким, выразительным и читаемым.
- Подзаголовок должен объяснять товар.
- Преимущества должны быть короткими.
- Используй только сведения из названия и характеристик.
- Не придумывай материалы, размеры, функции и свойства.
- Не повторяй одну мысль разными словами.
- Выбирай подходящий контрастный акцент.
- Товар должен быть главным визуальным объектом.
- Не перегружай карточку элементами.

Верни только JSON следующей структуры:

{
  "title": "Короткий заголовок",
  "subtitle": "Пояснение",
  "eyebrow": "Короткая надпись над заголовком",
  "badge": "Короткая плашка",
  "features": [
    "Преимущество 1",
    "Преимущество 2",
    "Преимущество 3"
  ],
  "design": "premium",
  "background": "light",
  "accent": "blue",
  "productPosition": "center",
  "productScale": 85,
  "titlePosition": "top",
  "featuresPosition": "bottom",
  "layout": "hero",
  "decoration": "minimal"
}

Допустимые значения:

design:
premium, editorial, showcase, lifestyle, infographic, cinematic

background:
light, dark, soft, gradient, accent

accent:
blue, cyan, green, orange, violet, black

productPosition:
left, center, right

productScale:
55-95

titlePosition:
top, middle, bottom

featuresPosition:
left, right, bottom

layout:
hero, split, editorial, cards, asymmetric, minimal

decoration:
minimal, geometric, elegant, technical
`;

        const result = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          {
            messages: [
              {
                role: "system",
                content:
                  "Ты профессиональный дизайнер маркетплейсов. Возвращай только корректный JSON без Markdown."
              },
              {
                role: "user",
                content: designPrompt
              }
            ],
            max_tokens: 900,
            temperature: 0.35
          }
        );

        const data = parseJSON(readAIText(result));

        const choices = {
          design: [
            "premium",
            "editorial",
            "showcase",
            "lifestyle",
            "infographic",
            "cinematic"
          ],
          background: [
            "light",
            "dark",
            "soft",
            "gradient",
            "accent"
          ],
          accent: [
            "blue",
            "cyan",
            "green",
            "orange",
            "violet",
            "black"
          ],
          productPosition: [
            "left",
            "center",
            "right"
          ],
          titlePosition: [
            "top",
            "middle",
            "bottom"
          ],
          featuresPosition: [
            "left",
            "right",
            "bottom"
          ],
          layout: [
            "hero",
            "split",
            "editorial",
            "cards",
            "asymmetric",
            "minimal"
          ],
          decoration: [
            "minimal",
            "geometric",
            "elegant",
            "technical"
          ]
        };

        const defaults = {
          design: "premium",
          background: "light",
          accent: "blue",
          productPosition: "center",
          titlePosition: "top",
          featuresPosition: "bottom",
          layout: "hero",
          decoration: "minimal"
        };

        for (const [key, values] of Object.entries(choices)) {
          if (!values.includes(data[key])) {
            data[key] = defaults[key];
          }
        }

        data.title = safeText(data.title || productName, 90);
        data.subtitle = safeText(data.subtitle, 150);
        data.eyebrow = safeText(data.eyebrow, 50);
        data.badge = safeText(data.badge, 45);

        data.productScale = Math.max(
          55,
          Math.min(95, Number(data.productScale) || 85)
        );

        data.features = Array.isArray(data.features)
          ? data.features
              .filter(item => typeof item === "string")
              .map(item => safeText(item, 75))
              .filter(Boolean)
              .slice(0, 4)
          : [];

        return json(data);

      } catch (error) {
        console.error("DESIGN ERROR:", error);

        return json({
          error: error.message || "Не удалось создать дизайн"
        }, 500);
      }
    }

    // --------------------------------------------------
    // 6. STATIC ASSETS
    // --------------------------------------------------

    return env.ASSETS.fetch(request);
  }
};
