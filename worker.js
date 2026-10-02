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
            "Access-Control-Allow-Headers": "*"
        };


        if (request.method === "OPTIONS") {

            return new Response(null, {
                status: 204,
                headers: corsHeaders
            });

        }


        /* =====================================================
           TEST AI
        ===================================================== */

        if (url.pathname === "/api/test-ai") {

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


                return new Response(
                    JSON.stringify(result),
                    {
                        headers: {
                            ...corsHeaders,
                            "Content-Type": "application/json"
                        }
                    }
                );


            } catch (error) {

                return new Response(
                    JSON.stringify({
                        error: error.message
                    }),
                    {
                        status: 500,
                        headers: {
                            ...corsHeaders,
                            "Content-Type": "application/json"
                        }
                    }
                );

            }
        }


        /* =====================================================
           TEST HUGGING FACE
        ===================================================== */

        if (url.pathname === "/api/test-huggingface") {

            try {

                const response =
                    await fetch(
                        "https://huggingface.co/studioludens/birefnet-lite-512/resolve/main/config.json"
                    );


                const text =
                    await response.text();


                return new Response(
                    text,
                    {
                        status: response.status,
                        headers: {
                            ...corsHeaders,
                            "Content-Type":
                                response.headers.get(
                                    "content-type"
                                ) ||
                                "application/json"
                        }
                    }
                );


            } catch (error) {

                return new Response(
                    JSON.stringify({
                        error: error.message
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
           HUGGING FACE MODEL PROXY
           
           /api/model/
           ↓
           https://huggingface.co/
        ===================================================== */

        if (url.pathname.startsWith("/api/model/")) {

            try {

                let path =
                    url.pathname.substring(
                        "/api/model/".length
                    );


                /*
                    Transformers.js иногда создаёт:

                    {file}/preprocessor_config.json

                    Убираем {file}/
                */

                path =
                    path.replace(
                        "{file}/",
                        ""
                    );


                /*
                    Если Transformers.js передал:

                    model/resolve/main/...

                    или повторил имя модели,
                    нормализуем URL.
                */


                const hfBase =
                    "https://huggingface.co/";


                /*
                    Разрешённые файлы.

                    Нам нужны:
                    config
                    processor
                    tokenizer
                    ONNX
                    generation
                    special tokens
                */

                const allowedPrefixes = [

                    "config.json",

                    "preprocessor_config.json",

                    "onnx/",

                    "tokenizer",

                    "processor",

                    "generation",

                    "special_tokens",

                    "merges",

                    "vocab",

                    "sentencepiece",

                    "normalizer"

                ];


                const isAllowed =
                    allowedPrefixes.some(
                        prefix =>
                            path.startsWith(prefix)
                    );


                if (!isAllowed) {

                    return new Response(
                        JSON.stringify({
                            error:
                                "Forbidden access to file",
                            path
                        }),
                        {
                            status: 403,
                            headers: {
                                ...corsHeaders,
                                "Content-Type":
                                    "application/json"
                            }
                        }
                    );

                }


                /*
                    Создаём URL Hugging Face.

                    path приходит примерно:

                    onnx-community/
                    BiRefNet_512x512-ONNX/
                    resolve/
                    main/
                    config.json
                */

                const hfUrl =
                    hfBase + path;


                console.log(
                    "HF proxy:",
                    hfUrl
                );


                /*
                    Передаём важные заголовки.

                    Range особенно важен для
                    больших ONNX-файлов.
                */

                const headers =
                    new Headers();


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


                /*
                    Запрашиваем Hugging Face.
                */

                const response =
                    await fetch(
                        hfUrl,
                        {
                            method: "GET",
                            headers
                        }
                    );


                /*
                    Копируем ответ.
                */

                const responseHeaders =
                    new Headers();


                response.headers.forEach(
                    (value, key) => {

                        responseHeaders.set(
                            key,
                            value
                        );

                    }
                );


                /*
                    CORS
                */

                Object.entries(
                    corsHeaders
                ).forEach(
                    ([key, value]) => {

                        responseHeaders.set(
                            key,
                            value
                        );

                    }
                );


                /*
                    Кэшируем модели.

                    ONNX-файлы большие,
                    поэтому повторно скачивать
                    их не нужно.
                */

                responseHeaders.set(
                    "Cache-Control",
                    "public, max-age=31536000"
                );


                return new Response(
                    response.body,
                    {
                        status:
                            response.status,

                        statusText:
                            response.statusText,

                        headers:
                            responseHeaders
                    }
                );


            } catch (error) {

                console.error(
                    "HF proxy error:",
                    error
                );


                return new Response(
                    JSON.stringify({
                        error: error.message
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
           GENERATE
        ===================================================== */

        if (
            url.pathname === "/api/generate" &&
            request.method === "POST"
        ) {

            try {

                const body =
                    await request.json();


                const productName =
                    body.productName ||
                    "Товар";


                const features =
                    body.features ||
                    "";


                const prompt = `
Ты профессиональный дизайнер инфографики
для Wildberries и Ozon.

Создай структуру карточки товара.

Товар:
${productName}

Характеристики:
${features}

Верни ТОЛЬКО JSON.

Формат:

{
  "title": "короткий заголовок",
  "subtitle": "короткий подзаголовок",
  "features": [
    "характеристика 1",
    "характеристика 2",
    "характеристика 3"
  ],
  "design": "hero",
  "productPosition": "center",
  "productScale": 0.75,
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
center |
center-bottom |
center-top |
left |
right |
left-bottom |
right-bottom |
left-top |
right-top

background:
light | dark | gradient | soft | accent

accent:
blue | cyan | green | orange | violet | red | none

shadow:
none | soft | medium

decoration:
none | lines | circles | blobs | grid | diagonal

productScale:
от 0.55 до 0.95
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
                    result.response ||
                    "";


                /*
                    Убираем возможный markdown
                    ```json ... ```
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


                let parsed;


                try {

                    parsed =
                        JSON.parse(text);

                } catch {

                    parsed = {

                        title:
                            productName,

                        subtitle:
                            "Качество и удобство",

                        features:
                            [
                                "Надёжный материал",
                                "Удобное использование",
                                "Современный дизайн"
                            ],

                        design:
                            "hero",

                        productPosition:
                            "center",

                        productScale:
                            0.75,

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


                /*
                    Безопасные значения.
                */

                const designs = [
                    "hero",
                    "split",
                    "editorial",
                    "dynamic",
                    "info",
                    "premium"
                ];


                const positions = [
                    "center",
                    "center-bottom",
                    "center-top",
                    "left",
                    "right",
                    "left-bottom",
                    "right-bottom",
                    "left-top",
                    "right-top"
                ];


                const backgrounds = [
                    "light",
                    "dark",
                    "gradient",
                    "soft",
                    "accent"
                ];


                const accents = [
                    "blue",
                    "cyan",
                    "green",
                    "orange",
                    "violet",
                    "red",
                    "none"
                ];


                const shadows = [
                    "none",
                    "soft",
                    "medium"
                ];


                const decorations = [
                    "none",
                    "lines",
                    "circles",
                    "blobs",
                    "grid",
                    "diagonal"
                ];


                if (
                    !designs.includes(
                        parsed.design
                    )
                ) {

                    parsed.design =
                        "hero";

                }


                if (
                    !positions.includes(
                        parsed.productPosition
                    )
                ) {

                    parsed.productPosition =
                        "center";

                }


                if (
                    !backgrounds.includes(
                        parsed.background
                    )
                ) {

                    parsed.background =
                        "light";

                }


                if (
                    !accents.includes(
                        parsed.accent
                    )
                ) {

                    parsed.accent =
                        "blue";

                }


                if (
                    !shadows.includes(
                        parsed.shadow
                    )
                ) {

                    parsed.shadow =
                        "soft";

                }


                if (
                    !decorations.includes(
                        parsed.decoration
                    )
                ) {

                    parsed.decoration =
                        "none";

                }


                parsed.productScale =
                    Math.max(
                        0.55,
                        Math.min(
                            0.95,
                            Number(
                                parsed.productScale
                            ) || 0.75
                        )
                    );


                return new Response(
                    JSON.stringify(parsed),
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
                        error: error.message
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
           STATIC ASSETS
        ===================================================== */

        return env.ASSETS.fetch(
            request
        );

    }
};
````
