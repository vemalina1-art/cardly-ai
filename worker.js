export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    if (url.pathname === "/api/test-ai") {

      const response = await env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct",
        {
          messages: [
            {
              role: "user",
              content: "Ответь одним предложением: что такое инфографика для карточки товара?"
            }
          ]
        }
      );

      return Response.json(response);
    }

    return env.ASSETS.fetch(request);
  }
};
