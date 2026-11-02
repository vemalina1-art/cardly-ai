
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
          "onnx/model_fp16.onnx"
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

        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
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
            messages: [
              {
                role: "user",
                content: "Ответь одним словом: работает"
              }
            ]
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

        const productName = String(body.productName || "").slice(0, 160);

        const characteristics = String(
          body.characteristics || body.features || ""
        ).slice(0, 2000);

        if (!productName.trim()) {
          return jsonResponse({ error: "Введите название товара" }, 400);
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

        const data = JSON.parse(answer.slice(start, end + 1));

        const allowed = {
          design: ["hero", "split", "editorial", "dynamic", "info", "premium"],
          productPosition: ["left", "center", "right"],
          titlePosition: ["top", "middle", "bottom"],
          featuresPosition: ["left", "right", "bottom"],
          background: ["light", "dark", "soft", "gradient", "accent"],
          accent: ["blue", "cyan", "green", "orange", "violet", "black"],
          shadow: ["soft", "medium", "none"],
          decoration: ["none"]
        };

        for (const [key, values] of Object.entries(allowed)) {
          if (!values.includes(data[key])) {
            data[key] = {
              design: "hero",
              productPosition: "center",
              titlePosition: "top",
              featuresPosition: "bottom",
              background: "light",
              accent: "blue",
              shadow: "soft",
              decoration: "none"
            }[key];
          }
        }

        data.title = String(data.title || productName).slice(0, 100);
        data.subtitle = String(data.subtitle || "").slice(0, 150);

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

    // =========================================
    // STATIC WEBSITE FILES
    // =========================================

    return env.ASSETS.fetch(request);
  }
};
