import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  remixContext,
) {
  // addDocumentResponseHeaders(request, responseHeaders);
  // console.log("CSP Header Set by Shopify library:", responseHeaders.get('Content-Security-Policy'));

  let shop = null;
  try {
    const url = new URL(request.url);
    shop = url.searchParams.get("shop");
  } catch (e) {
    console.error("Error parsing request URL for shop:", e);
  }
  const shopOrigin = shop ? (shop.startsWith("https://") ? shop : `https://${shop}`) : "*.myshopify.com";

  // const cspParts = [
  //   `frame-ancestors ${shopOrigin} https://admin.shopify.com app:`, // Added app: for local Shopify CLI dev
  //   "sandbox allow-scripts allow-forms allow-same-origin allow-popups allow-top-navigation allow-popups-to-escape-sandbox allow-modals allow-downloads allow-presentation;",
  // ];
  // const csp = cspParts.join(" "); // Use space as separator for different directives ifframe-ancestors is one part and sandbox another. Or use ; if they are distinct policies (Shopify usually combines them)
                                  // Let's stick to Shopify's typical combined approach:
  const combinedCsp = `frame-ancestors ${shopOrigin} https://admin.shopify.com app:; sandbox allow-scripts allow-forms allow-same-origin allow-popups allow-top-navigation allow-popups-to-escape-sandbox allow-modals allow-downloads allow-presentation;`;

  responseHeaders.set('Content-Security-Policy', combinedCsp);
  console.log("Manually Set CSP:", combinedCsp);

  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
