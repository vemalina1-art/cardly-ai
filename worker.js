
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
    // HUGGING FACE MODEL PROXY
    // =========================================

    if (url.pathname.startsWith("/api/model/")) {
      if (!["GET", "HEAD"].includes(request.method)) {
        return jsonResponse({
          error: "Method not allowed"
        }, 405);
      }

      try {
        let modelPath = url.pathname.slice("/api/model/".length);

        modelPath = decodeURIComponent(modelPath);
        modelPath = modelPath.replace(/^\/+/, "");

        if (
          !modelPath ||
          modelPath.includes("..") ||
          modelPath.includes("\\") ||
          modelPath.includes("\0")
        ) {
          return jsonResponse({
            error: "Invalid model file path",
            received: modelPath
          }, 400);
        }

        const hfUrl = new URL(
          "https://huggingface.co/" + modelPath
        );

        if (hfUrl.hostname !== "huggingface.co") {
          return jsonResponse({
            error: "Invalid destination"
          }, 400);
        }

        hfUrl.search = url.search;

        const headers = new Headers();

        const headersToForward = [
          "Range",
          "If-Range",
          "If-None-Match",
          "If-Modified-Since",
          "Accept"
        ];

        for (const name of headersToForward) {
          const value = request.headers.get(name);

          if (value) {
            headers.set(name, value);
          }
        }

        const hfResponse = await fetch(hfUrl.toString(), {
          method: request.method,
          headers,
          redirect: "follow"
        });

        console.log(
          "HUGGING FACE:",
          hfResponse.status,
          hfUrl.pathname
        );

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

    // =========================================
    // TEST HUGGING FACE DIRECTLY
    // =========================================

    if (url.pathname === "/api/test-huggingface") {
      try {
        const testUrl =
          "https://huggingface.co/onnx-community/" +
          "BiRefNet_512x512-ONNX/resolve/main/" +
          "preprocessor_config.json";

        const response = await fetch(testUrl);
        const body = await response.text();

        return jsonResponse({
          status: response.status,
          url: testUrl,
          response: body.slice(0, 3000)
        });

      } catch (error) {
        return jsonResponse({
          error: error.message
        }, 500);
      }
    }

    // =========================================
    // TEST MODEL THROUGH OUR PROXY
    // =========================================

    if (url.pathname === "/api/test-model-proxy") {
      try {
        const testUrl = new URL(
          "/api/model/onnx-community/" +
          "BiRefNet_512x512-ONNX/resolve/main/" +
          "preprocessor_config.json",
          url.origin
        );

        const response = await fetch(testUrl);
        const body = await response.text();

        return jsonResponse({
          status: response.status,
          url: testUrl.toString(),
          response: body.slice(0, 3000)
        });

      } catch (error) {
        return jsonResponse({
          error: error.message
        }, 500);
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
        return jsonResponse({
          error: error.message
        }, 500);
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

        const productName = String(
          body.productName || ""
        );

        const characteristics = String(
          body.characteristics || ""
        );

        const prompt = `
Ты профессиональный дизайнер инфографики
для Wildberries и Ozon.

Создай структуру карточки товара размером 900x1200.

Название товара:
${productName}

Характеристики:
${characteristics}

Верни только JSON без Markdown.

Используй следующую структуру:

{
  "title": "",
  "subtitle": "",
  "features": [],
  "design": "hero",
  "productPosition": "center",
  "productScale": 70,
  "titlePosition": "top",
  "featuresPosition": "bottom",
  "background": "#f5f7fa",
  "accent": "#2563eb",
  "shadow": true,
  "decoration": "none"
}

Допустимые значения:

design:
hero, split, editorial, dynamic, info, premium

productPosition:
left, center, right

titlePosition:
top, center, bottom

featuresPosition:
top, middle, bottom

features:
массив максимум из четырёх коротких преимуществ.

productScale:
число от 40 до 100.

background и accent:
цвета в HEX.
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
                content: prompt
              }
            ]
          }
        );

        let answer =
          result.response ||
          result.text ||
          "";

        answer = answer
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim();

        const start = answer.indexOf("{");
        const end = answer.lastIndexOf("}");

        if (start === -1 || end === -1) {
          throw new Error("AI не вернул JSON");
        }

        const data = JSON.parse(
          answer.slice(start, end + 1)
        );

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
