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
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 1. BIRE FNET MODEL FILE PROXY — НЕ ИЗМЕНЯЕМ
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
        return jsonResponse({ error: error.message }, 500);
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
        return jsonResponse({ error: error.message }, 500);
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
          { prompt, steps }
        );

        if (!result || !result.image) {
          throw new Error("Модель не вернула изображение");
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
          error: error.message || "Ошибка генерации изображения"
        }, 500);
      }
    }

    // 5. AI ADVERTISING SCENE — CATEGORY-AWARE BACKGROUND
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

        const styleDescriptions = {
          premium: "premium luxury advertising photography",
          editorial: "high-end editorial magazine photography",
          showcase: "professional product showcase photography",
          lifestyle: "realistic lifestyle interior photography",
          infographic: "modern clean commercial advertising photography",
          cinematic: "cinematic dramatic commercial photography"
        };

        const selectedStyle =
          styleDescriptions[style] || styleDescriptions.premium;

        // Определяем категорию товара.
        const productText = (
          productName + " " + characteristics
        ).toLowerCase();

        const categoryRules = [
          {
            test: /(ролик|ролики|душев|душ[а-яё]* каб|душ[а-яё]* двер|кабин[а-яё]*|стеклянн[а-яё]* двер)/i,
            name: "shower enclosure hardware",
            scene:
              "A premium modern bathroom with a frameless glass shower enclosure, " +
              "clear glass panels, subtle chrome shower-door rails and fittings, " +
              "large-format light stone or porcelain wall tiles, a clean shower " +
              "floor and a few subtle water droplets on glass. The scene must " +
              "clearly read as a shower cabin environment. No bathroom vanity, " +
              "no washbasin, no kitchen, no city view, no skyline, no decorative " +
              "bowl and no unrelated furniture."
          },
          {
            test: /(смесител|кран|излив|аэратор)/i,
            name: "bathroom or kitchen faucet",
            scene:
              "A refined contemporary bathroom or kitchen sink zone, selected " +
              "to match the product name, with a clean stone countertop, " +
              "subtle water details and restrained tile or backsplash materials. " +
              "Keep the sink area believable and uncluttered. No city skyline."
          },
          {
            test: /(шланг|лейк[аиу]|душ[еваяой]* систем|верхн[ийяе]* душ)/i,
            name: "shower hose and shower accessories",
            scene:
              "A contemporary shower enclosure with glass, large-format " +
              "porcelain tiles, a discreet shower wall and subtle water droplets. " +
              "The environment should feel like a real shower area, not a sink zone."
          },
          {
            test: /(дозатор|диспенсер|мыл[оа])/i,
            name: "soap dispenser",
            scene:
              "A tasteful bathroom vanity with a clean stone countertop, " +
              "simple tiled backsplash and restrained bathroom accessories. " +
              "Leave a clear counter area for the real product. No clutter."
          },
          {
            test: /(сифон|слив|трап)/i,
            name: "drainage and plumbing",
            scene:
              "A clean modern bathroom wet area with stone or porcelain tile, " +
              "a realistic shower floor and subtle water details. Avoid unrelated " +
              "decorative objects."
          },
          {
            test: /(еда|продукт питания|кофе|чай|сладост|шоколад|печень|фрукт|ягод)/i,
            name: "food and beverage",
            scene:
              "A refined food photography setting with a suitable natural " +
              "ingredient-inspired surface and restrained ingredient accents. " +
              "No bathroom, plumbing or household fixtures."
          },
          {
            test: /(наушник|телефон|смартфон|заряд|электрон|гаджет)/i,
            name: "consumer electronics",
            scene:
              "A minimal contemporary technology studio with premium matte " +
              "surfaces, subtle architectural lighting and clean geometric depth. " +
              "No bathroom, kitchen or unrelated household props."
          },
          {
            test: /(домашн|интерьер|декор|мебел|текстил|посуда)/i,
            name: "home and interior goods",
            scene:
              "A calm contemporary interior with coordinated natural materials, " +
              "soft daylight and restrained decor appropriate to the product. " +
              "Keep the main display area uncluttered."
          }
        ];

        const matchedCategory = categoryRules.find(rule =>
          rule.test.test(productText)
        );

        const categoryName = matchedCategory
          ? matchedCategory.name
          : "general consumer product";

        const categoryScene = matchedCategory
          ? matchedCategory.scene
          : "A tasteful contemporary commercial setting chosen specifically " +
            "for the named product category. Do not use a random room or unrelated props.";

        // Llama уточняет художественное описание сцены.
        const artDirection = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          {
            messages: [
              {
                role: "system",
                content:
                  "You are a senior commercial advertising art director. " +
                  "Write a concise English image-generation prompt for the " +
                  "BACKGROUND ENVIRONMENT ONLY. The real product will be " +
                  "placed over it later as an unchanged transparent PNG. " +
                  "Never depict the product, a duplicate product, product " +
                  "parts, text, labels, logos or watermarks. Follow the " +
                  "provided category scene literally. Do not replace it with " +
                  "a generic luxury room or a city view. Describe surfaces, " +
                  "lighting, perspective and composition. Keep the central " +
                  "lower area visually calm and unobstructed. Return only " +
                  "the scene description in English, maximum 90 words."
              },
              {
                role: "user",
                content:
                  "Product: " + productName +
                  "\nCharacteristics: " + characteristics +
                  "\nDetected category: " + categoryName +
                  "\nRequired environment: " + categoryScene +
                  "\nVisual style: " + selectedStyle +
                  "\nThe required environment is mandatory. Create a coherent " +
                  "vertical advertising background with a clear lower-central " +
                  "space for a real product overlay."
              }
            ]
          }
        );

        const sceneDescription = String(
          artDirection.response || artDirection.text || ""
        ).trim();

        if (!sceneDescription) {
          throw new Error(
            "AI не смог подготовить описание рекламной сцены"
          );
        }

        // Финальный промпт для FLUX.
        const finalPrompt = (
          "Photorealistic vertical 3:4 commercial advertising BACKGROUND. " +
          "MANDATORY PRODUCT CATEGORY: " + categoryName + ". " +
          "MANDATORY ENVIRONMENT: " + categoryScene + " " +
          "Additional art direction: " + sceneDescription + ". " +
          "Style: " + selectedStyle + ". " +
          "Professional realistic architectural photography, coherent " +
          "perspective, believable materials, soft directional lighting, " +
          "natural ambient shadows, restrained reflections, refined color " +
          "grading. Leave a clean, unobstructed lower-central display area " +
          "for overlaying the actual product photo. " +
          "The environment must match the category; do not invent another room. " +
          "Background only. Absolutely no product, no product replica, no " +
          "floating objects, no text, no letters, no typography, no logos, " +
          "no watermark."
        ).slice(0, 2048);

        const imageResult = await env.AI.run(
          "@cf/black-forest-labs/flux-1-schnell",
          {
            prompt: finalPrompt,
            steps: 4
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
          throw new Error("AI не вернул корректный JSON");
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
