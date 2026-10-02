````javascript
export default {
  async fetch(request, env) {

    const url = new URL(request.url);


    /* =====================================================
       CORS
    ===================================================== */

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "*"
    };


    /* =====================================================
       OPTIONS
    ===================================================== */

    if (request.method === "OPTIONS") {

      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });

    }


    /* =====================================================
       HUGGING FACE MODEL PROXY
       
       Example:
       
       /api/model/
       onnx-community/
       BiRefNet_512x512-ONNX/
       resolve/
       main/
       preprocessor_config.json
       
       becomes:
       
       https://huggingface.co/
       onnx-community/
       BiRefNet_512x512-ONNX/
       resolve/
       main/
       preprocessor_config.json
    ===================================================== */

    if (url.pathname.startsWith("/api/model/")) {

      try {

        let modelPath =
          url.pathname.substring(
            "/api/model/".length
          );


        modelPath =
          decodeURIComponent(modelPath);


        /*
         * Убираем случайные начальные /
         */

        modelPath =
          modelPath.replace(/^\/+/, "");


        /*
         * Если Transformers.js каким-то образом
         * передал {file}, убираем его.
         */

        modelPath =
          modelPath.replace(
            /\{file\}\//g,
            ""
          );


        /*
         * Защита от попыток выйти из пути.
         */

        if (
          modelPath.includes("..") ||
          modelPath.includes("\\")
        ) {

          return new Response(
            JSON.stringify({
              error: "Invalid model path"
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type":
                  "application/json"
              }
            }
          );

        }


        /*
         * Разрешаем только Hugging Face model paths.
         */

        if (
          !modelPath ||
          !modelPath.includes("/")
        ) {

          return new Response(
            JSON.stringify({
              error: "Invalid Hugging Face model path",
              received: modelPath
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type":
                  "application/json"
              }
            }
          );

        }


        /*
         * Формируем URL Hugging Face.
         */

        const hfUrl =
          "https://huggingface.co/" +
          modelPath;


        console.log(
          "HF PROXY:",
          hfUrl
        );


        /* =================================================
           HEADERS
        ================================================= */

        const headers =
          new Headers();


        /*
         * Передаём Range.
         *
         * Это особенно важно для больших
         * ONNX-файлов.
         */

        const range =
          request.headers.get(
            "Range"
          );

        if (range) {

          headers.set(
            "Range",
            range
          );

        }


        /*
         * Передаём Accept.
         */

        const accept =
          request.headers.get(
            "Accept"
          );

        if (accept) {

          headers.set(
            "Accept",
            accept
          );

        }


        /* =================================================
           FETCH HUGGING FACE
        ================================================= */

        const hfResponse =
          await fetch(
            hfUrl,
            {
              method: "GET",
              headers
            }
          );


        console.log(
          "HF STATUS:",
          hfResponse.status,
          hfUrl
        );


        /*
         * Если Hugging Face сам вернул ошибку,
         * показываем её.
         */

        if (!hfResponse.ok) {

          const errorText =
            await hfResponse.text();


          return new Response(
            JSON.stringify({
              error:
                "Hugging Face request failed",
              status:
                hfResponse.status,
              url:
                hfUrl,
              response:
                errorText.substring(
                  0,
                  2000
                )
            }),
            {
              status:
                hfResponse.status,
              headers: {
                ...corsHeaders,
                "Content-Type":
                  "application/json"
              }
            }
          );

        }


        /* =================================================
           RETURN FILE
        ================================================= */

        const responseHeaders =
          new Headers();


        /*
         * Сохраняем основные заголовки Hugging Face.
         */

        const headersToCopy = [

          "Content-Type",

          "Content-Length",

          "Content-Range",

          "Accept-Ranges",

          "Cache-Control",

          "ETag",

          "Last-Modified"

        ];


        for (
          const headerName
          of headersToCopy
        ) {

          const value =
            hfResponse.headers.get(
              headerName
            );


          if (value) {

            responseHeaders.set(
              headerName,
              value
            );

          }

        }


        /*
         * CORS
         */

        responseHeaders.set(
          "Access-Control-Allow-Origin",
          "*"
        );

        responseHeaders.set(
          "Access-Control-Allow-Methods",
          "GET, OPTIONS"
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
          hfResponse.body,
          {
            status:
              hfResponse.status,
            headers:
              responseHeaders
          }
        );


      } catch (error) {

        console.error(
          "MODEL PROXY ERROR:",
          error
        );


        return new Response(
          JSON.stringify({
            error:
              error.message
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type":
                "application/json"
            }
          }
        );

      }

    }


    /* =====================================================
       TEST HUGGING FACE
    ===================================================== */

    if (
      url.pathname ===
      "/api/test-huggingface"
    ) {

      try {

        const testUrl =
          "https://huggingface.co/" +
          "onnx-community/" +
          "BiRefNet_512x512-ONNX/" +
          "resolve/main/" +
          "preprocessor_config.json";


        const response =
          await fetch(testUrl);


        const text =
          await response.text();


        return new Response(
          JSON.stringify({
            status:
              response.status,
            url:
              testUrl,
            response:
              text.substring(
                0,
                3000
              )
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type":
                "application/json"
            }
          }
        );


      } catch (error) {

        return new Response(
          JSON.stringify({
            error:
              error.message
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type":
                "application/json"
            }
          }
        );

      }

    }


    /* =====================================================
       AI GENERATION
    ===================================================== */

    if (
      url.pathname ===
      "/api/test-ai"
    ) {

      try {

        const result =
          await env.AI.run(
            "@cf/meta/llama-3.1-8b-instruct-fp8",
            {
              messages: [
                {
                  role: "user",
                  content:
                    "Ответь одним словом: работает"
                }
              ]
            }
          );


        return new Response(
          JSON.stringify(result),
          {
            headers: {
              ...corsHeaders,
              "Content-Type":
                "application/json"
            }
          }
        );


      } catch (error) {

        return new Response(
          JSON.stringify({
            error:
              error.message
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type":
                "application/json"
            }
          }
        );

      }

    }


    /* =====================================================
       CARDLY AI GENERATION
    ===================================================== */

    if (
      url.pathname ===
      "/api/generate" &&
      request.method === "POST"
    ) {

      try {

        const body =
          await request.json();


        const productName =
          body.productName || "";


        const characteristics =
          body.characteristics || "";


        const prompt = `
Ты дизайнер инфографики для маркетплейсов.

Создай структуру карточки товара 900x1200.

Товар:
${productName}

Характеристики:
${characteristics}

Верни ТОЛЬКО JSON.

Формат:

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

Правила:

design должен быть одним из:

hero
split
editorial
dynamic
info
premium

productPosition:

left
center
right

titlePosition:

top
center
bottom

featuresPosition:

top
middle
bottom

features — массив максимум из 4 коротких преимуществ.
`;


        const result =
          await env.AI.run(
            "@cf/meta/llama-3.1-8b-instruct-fp8",
            {
              messages: [
                {
                  role: "system",
                  content:
                    "Ты профессиональный дизайнер маркетплейсов. Возвращай только JSON без Markdown."
                },
                {
                  role: "user",
                  content:
                    prompt
                }
              ]
            }
          );


        let text =
          result.response ||
          result.text ||
          "";


        /*
         * Убираем Markdown fences,
         * если модель их всё-таки добавила.
         */

        text =
          text
            .replace(
              /```json/gi,
              ""
            )
            .replace(
              /```/g,
              ""
            )
            .trim();


        let data;


        try {

          data =
            JSON.parse(text);

        } catch {

          /*
           * Пытаемся найти JSON
           * внутри ответа.
           */

          const start =
            text.indexOf("{");

          const end =
            text.lastIndexOf("}");


          if (
            start !== -1 &&
            end !== -1
          ) {

            data =
              JSON.parse(
                text.substring(
                  start,
                  end + 1
                )
              );

          } else {

            throw new Error(
              "AI вернул некорректный JSON"
            );

          }

        }


        return new Response(
          JSON.stringify(data),
          {
            headers: {
              ...corsHeaders,
              "Content-Type":
                "application/json"
            }
          }
        );


      } catch (error) {

        console.error(
          "GENERATE ERROR:",
          error
        );


        return new Response(
          JSON.stringify({
            error:
              error.message
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type":
                "application/json"
            }
          }
        );

      }

    }


    /* =====================================================
       STATIC FILES
    ===================================================== */

    return env.ASSETS.fetch(
      request
    );

  }
};
````
