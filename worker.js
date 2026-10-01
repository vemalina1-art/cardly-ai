export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =========================================
    // CORS
    // =========================================

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }


    // =========================================
    // TEST AI
    // =========================================

    if (
      request.method === "GET" &&
      url.pathname === "/api/test-ai"
    ) {
      try {
        const result = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          {
            messages: [
              {
                role: "user",
                content: "Ответь одним словом: работает?"
              }
            ]
          }
        );

        return Response.json({
          ok: true,
          result
        });

      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: error.message
          },
          {
            status: 500
          }
        );
      }
    }


    // =========================================
    // TEST HUGGING FACE CONFIG
    // =========================================

    if (
      request.method === "GET" &&
      url.pathname === "/api/test-huggingface"
    ) {
      try {
        const hfURL =
          "https://huggingface.co/studioludens/birefnet-lite-512/resolve/main/config.json";

        const response = await fetch(hfURL);

        const headers = new Headers(response.headers);

        headers.set(
          "Access-Control-Allow-Origin",
          "*"
        );

        return new Response(
          await response.arrayBuffer(),
          {
            status: response.status,
            headers
          }
        );

      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: error.message
          },
          {
            status: 500,
            headers: corsHeaders
          }
        );
      }
    }


    // =========================================
    // HUGGING FACE MODEL PROXY
    // =========================================

    if (
      url.pathname.startsWith("/api/model/")
    ) {

      let path =
        url.pathname.substring(
          "/api/model/".length
        );


      // -----------------------------------------
      // Защита от неправильного URL Transformers.js
      //
      // Иногда приходит:
      //
      // {file}/preprocessor_config.json
      //
      // Нам нужен:
      //
      // preprocessor_config.json
      // -----------------------------------------

      path = path.replace(
        "{file}/",
        ""
      );


      // -----------------------------------------
      // Удаляем возможный повторный путь модели
      // -----------------------------------------

      const modelPrefix =
        "studioludens/birefnet-lite-512/resolve/main/";

      if (path.startsWith(modelPrefix)) {
        path =
          path.substring(
            modelPrefix.length
          );
      }


      // -----------------------------------------
      // Разрешаем только файлы нашей модели
      // -----------------------------------------

      const allowedPrefixes = [
        "config.json",
        "preprocessor_config.json",
        "onnx/",
        "tokenizer",
        "processor",
        "generation",
        "special_tokens"
      ];

      const allowed =
        allowedPrefixes.some(
          prefix => path.startsWith(prefix)
        );


      if (!allowed) {

        return new Response(
          "File not allowed",
          {
            status: 403,
            headers: corsHeaders
          }
        );

      }


      // -----------------------------------------
      // Hugging Face URL
      // -----------------------------------------

      const hfURL =
        "https://huggingface.co/studioludens/birefnet-lite-512/resolve/main/" +
        path;


      try {

        // Передаём полезные заголовки браузера
        const requestHeaders =
          new Headers();


        const range =
          request.headers.get("Range");

        if (range) {
          requestHeaders.set(
            "Range",
            range
          );
        }


        const accept =
          request.headers.get("Accept");

        if (accept) {
          requestHeaders.set(
            "Accept",
            accept
          );
        }


        const response =
          await fetch(
            hfURL,
            {
              method: "GET",
              headers: requestHeaders
            }
          );


        const headers =
          new Headers(
            response.headers
          );


        // CORS
        headers.set(
          "Access-Control-Allow-Origin",
          "*"
        );

        headers.set(
          "Access-Control-Allow-Methods",
          "GET, OPTIONS"
        );

        headers.set(
          "Access-Control-Allow-Headers",
          "*"
        );


        // Разрешаем браузеру кешировать модель
        headers.set(
          "Cache-Control",
          "public, max-age=31536000"
        );


        return new Response(
          response.body,
          {
            status: response.status,
            headers
          }
        );


      } catch (error) {

        return Response.json(
          {
            ok: false,
            error: error.message,
            requestedPath: path,
            huggingFaceURL: hfURL
          },
          {
            status: 500,
            headers: corsHeaders
          }
        );

      }
    }


    // =========================================
    // GENERATE CARD
    // =========================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/generate"
    ) {

      try {

        const body =
          await request.json();


        const productName =
          body.productName || "";


        const features =
          body.features || "";


        const prompt = `
Ты AI-дизайнер маркетплейсов.

Создай структуру инфографики товара.

Название:
${productName}

Характеристики:
${features}

Используй ТОЛЬКО информацию пользователя.

Верни только JSON.

Формат:

{
  "title": "...",
  "subtitle": "...",
  "features": ["...", "...", "..."],
  "design": "hero",
  "productPosition": "center",
  "productScale": 0.8,
  "titlePosition": "top",
  "featuresPosition": "bottom",
  "background": "light",
  "accent": "blue",
  "shadow": "soft",
  "decoration": "none"
}

design:
hero | split | editorial | dynamic | info | premium

productPosition:
center | center-bottom | center-top |
left | right |
left-bottom | right-bottom |
left-top | right-top

background:
light | dark | gradient | soft | accent

accent:
blue | cyan | green | orange | violet | red | none

shadow:
none | soft | medium

decoration:
none | lines | circles | blobs | grid | diagonal

Ответь только JSON.
`;


        const result =
          await env.AI.run(
            "@cf/meta/llama-3.1-8b-instruct-fp8",
            {
              messages: [
                {
                  role: "user",
                  content: prompt
                }
              ]
            }
          );


        let text =
          result.response || "";


        let data;


        try {

          data =
            JSON.parse(text);

        } catch {

          data = {

            title:
              productName || "Товар",

            subtitle:
              "",

            features:
              features
                .split("\n")
                .filter(Boolean)
                .slice(0, 4),

            design:
              "hero",

            productPosition:
              "center-bottom",

            productScale:
              0.8,

            titlePosition:
              "top",

            featuresPosition:
              "bottom",

            background:
              "light",

            accent:
              "blue",

            shadow:
              "soft",

            decoration:
              "none"
          };

        }


        return Response.json(
          data,
          {
            headers: corsHeaders
          }
        );


      } catch (error) {

        return Response.json(
          {
            error:
              error.message
          },
          {
            status: 500,
            headers: corsHeaders
          }
        );

      }
    }


    // =========================================
    // WEBSITE
    // =========================================

    return env.ASSETS.fetch(
      request
    );
  }
};
