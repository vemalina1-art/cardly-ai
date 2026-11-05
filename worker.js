
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "*"
    };

    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8"
        }
      });
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // 1. BIRE FNET MODEL FILE PROXY — НЕ ИЗМЕНЯЕМ
    if (url.pathname.startsWith("/api/model/")) {
      if (!["GET", "HEAD"].includes(request.method)) {
        return jsonResponse({
          error: "Method not allowed"
        }, 405);
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
          return jsonResponse({
            error: "Model path not allowed"
          }, 403);
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

        const responseHeaders = new Headers(
          hfResponse.headers
        );

        responseHeaders.set(
          "Access-Control-Allow-Origin",
          "*"
        );

        responseHeaders.set(
          "Access-Control-Allow-Methods",
          "GET, HEAD, OPTIONS"
        );

        responseHeaders.set(
          "Access-Control-Allow-Headers",
          "*"
        );

        responseHeaders.set(
          "Access-Control-Expose-Headers",
          "*"
        );

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

    // 2. TEST MODEL FILE
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
        return jsonResponse({
          error: error.message
        }, 500);
      }
    }

    // 3. TEST CLOUDFLARE AI — LLAMA
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
        return jsonResponse({
          error: error.message
        }, 500);
      }
    }

    // 4. TEST IMAGE GENERATION — FLUX
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
          {
            prompt,
            steps
          }
        );

        if (!result || !result.image) {
          throw new Error(
            "Модель не вернула изображение"
          );
        }

        const binary = atob(result.image);

        const bytes = Uint8Array.from(
          binary,
          char => char.charCodeAt(0)
        );

        return new Response(bytes, {
          headers: {
            ...corsHeaders,
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store"
          }
        });

      } catch (error) {
        console.error("IMAGE GENERATION ERROR:", error);

        return jsonResponse({
          error: error.message ||
            "Ошибка генерации изображения"
        }, 500);
      }
    }

    // 5. AI ADVERTISING SCENE — SMART PRODUCT MATCHING
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

        if (!productName) {
          return jsonResponse({
            error: "Введите название товара"
          }, 400);
        }

        const productText = (
          productName + " " + characteristics
        ).toLowerCase();

        // Визуальные стили рекламной сцены.
        const styleDescriptions = {
          premium:
            "premium commercial advertising photography, refined materials, elegant architectural lighting, sophisticated composition",

          editorial:
            "high-end editorial photography, natural directional light, artistic but realistic composition, subtle textures",

          showcase:
            "professional product showcase, clean architectural environment, clear visual hierarchy, balanced studio lighting",

          lifestyle:
            "realistic contemporary lifestyle interior, natural daylight, believable environment, calm atmosphere",

          infographic:
            "modern commercial advertising background, clean geometric architecture, structured composition, controlled colors",

          cinematic:
            "cinematic commercial photography, directional lighting, rich but natural contrast, realistic depth"
        };

        const selectedStyle =
          styleDescriptions[style] ||
          styleDescriptions.premium;

        // Определяем категорию товара и подходящее окружение.
        const categories = [
          {
            test: /(ролик|ролики|каретк|дверн.*душ|душев.*двер|душев.*кабин|кабин.*душ)/i,
            name: "shower enclosure rollers and hardware",
            environment:
              "A realistic frameless glass shower enclosure. Large transparent glass panels, elegant chrome profiles, light grey stone porcelain tiles and a clean shower area. The camera sees the glass structure and its architectural details. The background must clearly communicate shower enclosure hardware."
          },
          {
            test: /(кухонн.*смесител|смесител.*кухн|кран.*кухн)/i,
            name: "kitchen faucet",
            environment:
              "A contemporary designer kitchen sink area. A refined stone countertop, a simple backsplash, subtle cabinetry and realistic kitchen lighting. The scene must clearly look like a kitchen, not a bathroom."
          },
          {
            test: /(смесител|кран|излив|аэратор)/i,
            name: "bathroom faucet",
            environment:
              "A modern bathroom washbasin area. A refined ceramic basin, light natural stone countertop, elegant wall tiles and subtle mirror reflections. The scene must clearly look like a bathroom vanity, not a kitchen."
          },
          {
            test: /(лейк|верхн.*душ|душев.*систем|душев.*гарнитур)/i,
            name: "shower head and shower system",
            environment:
              "A modern shower area with large-format porcelain wall tiles, a glass shower screen, a discreet shower niche and realistic water details. The scene must clearly communicate a shower installation."
          },
          {
            test: /(шланг)/i,
            name: "shower hose",
            environment:
              "A clean contemporary shower enclosure with glass panels, a chrome shower connection area, stone porcelain tiles and subtle realistic reflections. Keep the scene simple and clearly recognizable as a shower."
          },
          {
            test: /(дозатор|диспенсер|мыл)/i,
            name: "soap dispenser",
            environment:
              "A refined bathroom vanity with a light stone countertop, elegant tiled backsplash, ceramic basin partially visible and soft natural daylight. Leave a clean countertop display area."
          },
          {
            test: /(сифон|слив|трап)/i,
            name: "bathroom drainage and plumbing",
            environment:
              "A realistic modern shower floor with large-format stone porcelain tiles, a visible drainage area, subtle water reflections and clean architectural details. No unrelated bathroom accessories."
          },
          {
            test: /(держател|крючок|полк|мыльниц|стакан.*ванн)/i,
            name: "bathroom accessories",
            environment:
              "A modern coordinated bathroom interior with elegant wall tiles, a stone surface, subtle chrome details and restrained bathroom decor. Keep the environment realistic and uncluttered."
          },
          {
            test: /(наушник|телефон|смартфон|заряд|электрон|гаджет)/i,
            name: "consumer electronics",
            environment:
              "A contemporary technology studio with refined matte surfaces, architectural geometry, subtle reflections and controlled studio lighting. No household interiors."
          }
        ];

        const matched = categories.find(category =>
          category.test.test(productText)
        );

        const categoryName = matched
          ? matched.name
          : "general consumer product";

        const environment = matched
          ? matched.environment
          : "A contemporary commercial display environment with materials and surroundings logically suited to the named product. Avoid random interiors and unrelated objects.";

        // Учитываем цвет и материал, если они указаны.
        const materialColorRules = [
          {
            test: /(хром|хромирован|серебрист|нержавеющ.*сталь)/i,
            value:
              "Use a coordinated cool neutral palette with silver-grey details, white stone and restrained reflections."
          },
          {
            test: /(чёрн|черн|матов.*чёрн|матов.*черн)/i,
            value:
              "Use a sophisticated neutral palette with graphite, charcoal and light stone contrast. Do not make the entire scene black."
          },
          {
            test: /(белый|белая|белое|белые)/i,
            value:
              "Use balanced medium-tone surroundings so a white product remains visually distinct and clearly visible."
          },
          {
            test: /(золот|латун)/i,
            value:
              "Use warm neutral stone and restrained warm metallic accents, without excessive gold decoration."
          }
        ];

        const materialRule = materialColorRules.find(rule =>
          rule.test.test(productText)
        );

        const colorDirection = materialRule
          ? materialRule.value
          : "Use a balanced natural color palette that complements the product category.";

        // Формируем единое описание без противоречащих инструкций.
        const finalPrompt = [
          "Create a photorealistic vertical 3:4 commercial advertising background.",
          "PRODUCT CATEGORY: " + categoryName + ".",
          "ENVIRONMENT: " + environment,
          "COLOR DIRECTION: " + colorDirection,
          "VISUAL STYLE: " + selectedStyle + ".",
          "Composition: professional architectural advertising photography, coherent perspective, realistic materials, natural depth, believable lighting and subtle ambient shadows.",
          "Reserve a visually calm, unobstructed area in the lower center for placing the real product photograph later.",
          "Keep the upper area relatively clean for a headline.",
          "The environment must look specifically designed for this product category.",
          "Do not create a generic luxury interior.",
          "Do not mix bathroom, kitchen and unrelated environments.",
          "BACKGROUND ONLY: do not show the actual product, its replica, similar products, product parts or floating objects.",
          "No text, no letters, no typography, no logos, no labels, no watermark."
        ].join(" ");

        const imageResult = await env.AI.run(
          "@cf/black-forest-labs/flux-1-schnell",
          {
            prompt: finalPrompt.slice(0, 2048),
            steps: 6
          }
        );

        if (!imageResult || !imageResult.image) {
          throw new Error(
            "FLUX не вернул изображение рекламной сцены"
          );
        }

        const binary = atob(imageResult.image);

        const bytes = Uint8Array.from(
          binary,
          char => char.charCodeAt(0)
        );

        return new Response(bytes, {
          headers: {
            ...corsHeaders,
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store"
          }
        });

      } catch (error) {
        console.error("AD SCENE GENERATION ERROR:", error);

        return jsonResponse({
          error: error.message ||
            "Не удалось создать рекламное окружение"
        }, 500);
      }
    }

    // 6. GENERATE CARD DESIGN — CLASSIC MODE
    if (
      url.pathname === "/api/generate" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const productName = String(
          body.productName || ""
        ).slice(0, 160);

        const characteristics = String(
          body.characteristics || body.features || ""
        ).slice(0, 2000);

        if (!productName.trim()) {
          return jsonResponse({
            error: "Введите название товара"
          }, 400);
        }

        const prompt = `
Ты арт-директор профессионального сервиса инфографики для Wildberries и Ozon.
Создай только структуру дизайна карточки 900x1200.
Не выдумывай характеристики товара.
Используй только факты из входных данных.

Название товара:
${productName}

Характеристики:
${characteristics}

Верни только корректный JSON без Markdown и комментариев.

Формат:
{
  "title": "короткий выразительный заголовок",
  "subtitle": "короткое пояснение",
  "features": ["преимущество 1", "преимущество 2"],
  "design": "hero",
  "productPosition": "center",
  "titlePosition": "top",
  "featuresPosition": "bottom",
  "background": "light",
  "accent": "blue",
  "shadow": "soft",
  "decoration": "none"
}

Правила:
- Заголовок короткий, максимум 5 слов.
- Не добавляй рекламных обещаний, которых нет во входных данных.
- В features добавляй только подтверждённые характеристики.
- Не повторяй одно и то же в заголовке и преимуществах.
- Максимум 4 преимущества.
- Не используй длинные предложения.

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
                  "Ты профессиональный арт-директор. Возвращай только валидный JSON. Не добавляй Markdown."
              },
              {
                role: "user",
                content: prompt
              }
            ]
          }
        );

        let answer = result.response || result.text || "";

        answer = answer
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim();

        const start = answer.indexOf("{");
        const end = answer.lastIndexOf("}");

        if (start === -1 || end === -1) {
          throw new Error(
            "AI не вернул корректный JSON"
          );
        }

        const data = JSON.parse(
          answer.slice(start, end + 1)
        );

        const allowed = {
          design: [
            "hero",
            "split",
            "editorial",
            "dynamic",
            "info",
            "premium"
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
          shadow: [
            "soft",
            "medium",
            "none"
          ],
          decoration: [
            "none"
          ]
        };

        const defaults = {
          design: "hero",
          productPosition: "center",
          titlePosition: "top",
          featuresPosition: "bottom",
          background: "light",
          accent: "blue",
          shadow: "soft",
          decoration: "none"
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
          error: error.message
        }, 500);
      }
    }

    // 7. STATIC WEBSITE FILES
    return env.ASSETS.fetch(request);
  }
};
