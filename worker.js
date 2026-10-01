export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    // =========================================
    // Тест AI
    // =========================================

    if (
      request.method === "GET" &&
      url.pathname === "/api/test-ai"
    ) {

      try {

        const result =
          await env.AI.run(
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
          { status: 500 }
        );

      }

    }


    // =========================================
    // ТЕСТ HUGGING FACE ЧЕРЕЗ CLOUDFLARE
    // =========================================

    if (
      request.method === "GET" &&
      url.pathname === "/api/test-huggingface"
    ) {

      const hfURL =
        "https://huggingface.co/studioludens/birefnet-lite-512/resolve/main/config.json";


      try {

        const response =
          await fetch(hfURL);


        return new Response(
          await response.text(),
          {
            status: response.status,

            headers: {
              "Content-Type":
                response.headers.get(
                  "Content-Type"
                ) || "application/json",

              "Access-Control-Allow-Origin":
                "*"
            }

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
            headers: {
              "Access-Control-Allow-Origin":
                "*"
            }
          }
        );

      }

    }


    // =========================================
    // PROXY HUGGING FACE
    // =========================================

    if (
      url.pathname.startsWith(
        "/api/model/"
      )
    ) {

      const path =
        url.pathname.replace(
          "/api/model/",
          ""
        );


      const hfURL =
        "https://huggingface.co/studioludens/birefnet-lite-512/resolve/main/" +
        path;


      try {

        const response =
          await fetch(hfURL);


        const headers =
          new Headers(
            response.headers
          );


        headers.set(
          "Access-Control-Allow-Origin",
          "*"
        );


        headers.set(
          "Access-Control-Allow-Methods",
          "GET, OPTIONS"
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
            error: error.message
          },
          {
            status: 500,
            headers: {
              "Access-Control-Allow-Origin":
                "*"
            }
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


        return Response.json(data);

      } catch (error) {

        return Response.json(
          {
            error:
              error.message
          },
          {
            status: 500
          }
        );

      }

    }


    // =========================================
    // OPTIONS
    // =========================================

    if (
      request.method === "OPTIONS"
    ) {

      return new Response(
        null,
        {
          headers: {
            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Methods":
              "GET, POST, OPTIONS",

            "Access-Control-Allow-Headers":
              "Content-Type"
          }
        }
      );

    }


    // =========================================
    // САЙТ
    // =========================================

    return env.ASSETS.fetch(
      request
    );

  }
};
