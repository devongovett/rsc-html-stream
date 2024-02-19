# rsc-html-stream

A small utility to inject a React Server Components payload into an HTML stream on the server, and read it back into a stream on the client. This is useful when rendering RSC to an initial HTML response to avoid an extra HTTP request to hydrate the page on the client. Instead, the payload is injected into the initial HTML as a series of `<script>` elements, and re-combined together into a `ReadableStream` on the client.

## Usage

On the server, use the `injectRSCPayload` function from `rsc-html-stream/server` to create a `TransformStream` that injects the RSC payload stream into the HTML stream.

```js
import {renderToReadableStream} from 'react-server-dom-BUNDLER/server.edge';
import {createFromReadableStream} from 'react-server-dom-BUNDLER/client.edge';
import {renderToReadableStream as renderHTMLToReadableStream} from 'react-dom/server.edge';
import {injectRSCPayload} from 'rsc-html-stream/server';

// Render a component to RSC payload using bundler integration package.
let rscStream = renderToReadableStream(<App />);

// Fork the stream, and render it to HTML.
let [s1, s2] = rscStream.tee();
let data;
function Content() {
  data ??= createFromReadableStream(s1);
  return React.use(data);
}

let htmlStream = await renderHTMLToReadableStream(<Content />);

// Inject the RSC stream into the HTML stream.
let response = htmlStream.pipeThrough(injectRSCPayload(s2));
```

On the client, use the `rscStream` from `rsc-html-stream/client` to hydrate the page. This is a `ReadableStream` that includes the RSC payload injected into the HTML by the server.

```js
import ReactServerDOMReader from 'react-server-dom-BUNDLER/client';
import {rscStream} from 'rsc-html-stream/client';

let data;
function Content() {
  data ??= ReactServerDOMReader.createFromReadableStream(
    rscStream
  );
  return React.use(data);
}
```
