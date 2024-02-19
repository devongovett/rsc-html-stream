export function injectRSCPayload(rscStream) {
  let encoder = new TextEncoder();
  let decoder = new TextDecoder();
  let resolveFlightDataPromise;
  let flightDataPromise = new Promise((resolve) => resolveFlightDataPromise = resolve);
  let started = false;
  return new TransformStream({
    transform(chunk, controller) {    
      let buf = decoder.decode(chunk);
      controller.enqueue(encoder.encode(buf.replace('</body></html>', '')));

      if (!started) {
        started = true;
        process.nextTick(async () => {
          for await (let chunk of rscStream) {
            controller.enqueue(encoder.encode(`<script>${escapeScript(`(self.__FLIGHT_DATA||=[]).push(${JSON.stringify(decoder.decode(chunk))})`)}</script>`));
          }
          resolveFlightDataPromise();
        });
      }
    },
    async flush(controller) {
      await flightDataPromise;
      controller.enqueue(encoder.encode('</body></html>'));
    }
  });
}

// Escape closing script tags and HTML comments in JS content.
// https://www.w3.org/TR/html52/semantics-scripting.html#restrictions-for-contents-of-script-elements
// Avoid replacing </script with <\/script as it would break the following valid JS: 0</script/ (i.e. regexp literal).
// Instead, escape the s character.
function escapeScript(script) {
  return script
    .replace(/<!--/g, '<\\!--')
    .replace(/<\/(script)/gi, '</\\$1');
}
