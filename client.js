let encoder = new TextEncoder();
let streamController;
export let rscStream = new ReadableStream({
  start(controller) {
    if (typeof window === 'undefined' || !Array.isArray(window.__FLIGHT_DATA)) {
      return;
    }
    let handleChunk = chunk => {
      if (typeof chunk === 'string') {
        controller.enqueue(encoder.encode(chunk));
      } else {
        controller.enqueue(chunk);
      }
    };
    for (let chunk of window.__FLIGHT_DATA) {
      handleChunk(chunk);
    }
    streamController = controller;
    window.__FLIGHT_DATA.push = (chunk) => {
      handleChunk(chunk);
    };
  },
});

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    streamController?.close();
  });
} else {
  streamController?.close();
}
