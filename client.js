let encoder = new TextEncoder();
let streamController;
export let rscStream = new ReadableStream({
  start(controller) {
    if (typeof window === 'undefined' || !Array.isArray(window.__FLIGHT_DATA)) {
      return;
    }
    for (let chunk of window.__FLIGHT_DATA) {
      controller.enqueue(encoder.encode(chunk));
    }
    streamController = controller;
    window.__FLIGHT_DATA.push = (chunk) => {
      controller.enqueue(encoder.encode(chunk));
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
