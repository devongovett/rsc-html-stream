const encoder = new TextEncoder();
const trailer = '</body></html>';

export function injectRSCPayload(rscStream) {
  let decoder = new TextDecoder();
  let resolveFlightDataPromise;
  let flightDataPromise = new Promise((resolve) => resolveFlightDataPromise = resolve);
  let started = false;
  return new TransformStream({
    transform(chunk, controller) {
      let buf = decoder.decode(chunk);
      if (buf.endsWith(trailer)) {
        buf = buf.slice(0, -trailer.length);
      }
      controller.enqueue(encoder.encode(buf));

      if (!started) {
        started = true;
        setTimeout(async () => {
          try {
            await writeRSCStream(rscStream, controller);
          } catch (err) {
            controller.error(err);
          }
          resolveFlightDataPromise();
        }, 0);
      }
    },
    async flush(controller) {
      await flightDataPromise;
      controller.enqueue(encoder.encode('</body></html>'));
    }
  });
}

async function writeRSCStream(rscStream, controller) {
  let decoder = new TextDecoder('utf-8', {fatal: true});
  for await (let chunk of rscStream) {
    // Try decoding the chunk to send as a string.
    // If that fails (e.g. binary data that is invalid unicode), write as base64.
    try {
      writeChunk(JSON.stringify(decoder.decode(chunk, {stream: true})), controller);
    } catch (err) {
      let base64 = JSON.stringify(btoa(String.fromCodePoint(...chunk)));
      writeChunk(`Uint8Array.from(atob(${base64}), m => m.codePointAt(0))`, controller);
    }
  }

  let remaining = decoder.decode();
  if (remaining.length) {
    writeChunk(JSON.stringify(remaining), controller);
  }
}

function writeChunk(chunk, controller) {
  controller.enqueue(encoder.encode(`<script>${escapeScript(`(self.__FLIGHT_DATA||=[]).push(${chunk})`)}</script>`));
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
