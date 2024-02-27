let encoder = new TextEncoder();
let streamController;
export let rscStream = new ReadableStream({
  start(controller) {
    if (typeof window === 'undefined') {
      return;
    }
    let handleChunk = chunk => {
      if (typeof chunk === 'string') {
        controller.enqueue(encoder.encode(chunk));
      } else {
        controller.enqueue(chunk);
      }
    };
    window.__FLIGHT_DATA ||= [];
    window.__FLIGHT_DATA.forEach(handleChunk);
    window.__FLIGHT_DATA.push = (chunk) => {
      handleChunk(chunk);
    };
    streamController = controller;
  },
});

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    streamController?.close();
  });
} else {
  streamController?.close();
}
