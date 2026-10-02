````javascript
export default {
    async fetch(request, env) {

        const url = new URL(request.url);

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"
        };


        // =====================================================
        // CORS
        // =====================================================

        if (request.method === "OPTIONS") {

            return new Response(null, {
                status: 204,
                headers: corsHeaders
            });

        }


        // =====================================================
        // TEST AI
        // =====================================================

        if (url.pathname === "/api/test-ai") {

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


        // =====================================================
        // TEST HUGGING FACE
        // =====================================================

        if (url.pathname === "/api/test-huggingface") {

            try {

                const response = await fetch(
                    "https://huggingface.co/studioludens/birefnet-lite-512/resolve/main/config.json"
                );


                return new Response(
                    response.body,
                    {
                        status: response.status,
                        headers: {
                            ...corsHeaders,
                            "Content-Type":
                                response.headers.get(
                                    "content-type"
                                ) || "application/json"
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


        // =====================================================
        // HUGGING FACE MODEL PROXY
        // =====================================================

        if (url.pathname.startsWith("/api/model/")) {

            try {

                /*
                    Получаем ВСЁ после:

                    /api/model/

                    Например:

                    onnx-community/BiRefNet_512x512-ONNX/
                    resolve/main/preprocessor_config.json
                */

                let modelPath =
                    url.pathname.substring(
                        "/api/model/".length
                    );


                /*
                    Декодируем URL.
                */

                modelPath =
                    decodeURIComponent(
                        modelPath
                    );


                /*
                    Иногда Transformers.js может
                    передать {file}/.
                */

                modelPath =
                    modelPath.replace(
                        "{file}/",
                        ""
                    );


                /*
                    Если почему-то пришёл полный URL,
                    убираем начало.

                    Это дополнительная защита.
                */

                modelPath =
                    modelPath.replace(
                        /^https?:\/\/huggingface\.co\//,
                        ""
                    );


                /*
                    Иногда может прийти лишний slash.
                */

                modelPath =
                    modelPath.replace(
                        /^\/+/,
                        ""
                    );


                console.log(
                    "MODEL PATH:",
                    modelPath
                );


                // =================================================
                // HUGGING FACE URL
                // =================================================

                const hfUrl =
                    "https://huggingface.co/" +
                    modelPath;


                console.log(
                    "FETCH:",
                    hfUrl
                );


                // =================================================
                // REQUEST HEADERS
                // =================================================

                const headers =
                    new Headers();


                /*
                    Range критически важен
                    для больших ONNX-файлов.
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
                    Иногда Hugging Face лучше
                    работает с этим заголовком.
                */

                headers.set(
                    "User-Agent",
                    "Cardly-AI-Model-Proxy"
                );


                // =================================================
                // FETCH
                // =================================================

                const response =
                    await fetch(
                        hfUrl,
                        {
                            method: "GET",
                            headers: headers
                        }
                    );


                console.log(
                    "HF STATUS:",
                    response.status
                );


                /*
                    Если Hugging Face вернул ошибку,
                    передаём её как есть.
                */

                if (!response.ok) {

                    const errorText =
                        await response.text();


                    console.error(
                        "HF ERROR:",
                        response.status,
                        errorText
                    );


                    return new Response(
                        errorText,
                        {
                            status:
                                response.status,

                            headers: {
                                ...corsHeaders,
                                "Content-Type":
                                    response.headers.get(
                                        "content-type"
                                    ) ||
                                    "text/plain"
                            }
                        }
                    );

                }


                // =================================================
                // RESPONSE HEADERS
                // =================================================

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
                    Кэшируем модель.

                    После первого скачивания
                    браузеру не придётся
                    каждый раз загружать её заново.
                */

                responseHeaders.set(
                    "Cache-Control",
                    "public, max-age=31536000, immutable"
                );


                // =================================================
                // RETURN MODEL FILE
                // =================================================

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


        // =====================================================
        // GENERATE
        // =====================================================

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
                    Убираем markdown,
                    если Llama его добавила.
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

                        features: [
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


                // =================================================
                // VALIDATION
                // =================================================

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


                // =================================================
                // RESPONSE
                // =================================================

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


        // =====================================================
        // STATIC ASSETS
        // =====================================================

        return env.ASSETS.fetch(
            request
        );
    }
};
````
