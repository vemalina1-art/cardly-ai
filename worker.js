export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    if (url.pathname === "/api/test-ai") {

      try {

        const response = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          {
            messages: [
              {
                role: "user",
                content:
                  "Ответь одним коротким предложением: что такое инфографика для карточки товара?"
              }
            ]
          }
        );

        return Response.json(response);

      } catch (error) {

        return Response.json(
          {
            error: error.message
          },
          { status: 500 }
        );

      }
    }

    return env.ASSETS.fetch(request);
  }
};
