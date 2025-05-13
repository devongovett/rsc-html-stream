import test from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import fs from 'node:fs';
import {injectRSCPayload} from './server.js';

const client = fs.readFileSync('client.js', 'utf8').replace('export let ', 'window.');

function testStream(chunks, ref) {
  let encoder = new TextEncoder();
  return new ReadableStream({
    async pull(controller) {
      while (chunks.length) {
        let chunk = chunks.shift();
        if (typeof chunk === 'function') {
          await chunk();
        } else if (typeof chunk === 'string') {
          controller.enqueue(encoder.encode(chunk));
        } else {
          controller.enqueue(chunk);
        }
      }
      controller.close();
    }
  });
}

function runScripts(html, nonce) {
  let scripts = html.matchAll(new RegExp(`<script${nonce ? ` nonce="${nonce}"` : ''}>(.*?)<\/script>`, 'g'));
  let window = {};
  let ctx = vm.createContext({self: window, window, TextEncoder, ReadableStream, atob});
  for (let script of scripts) {
    vm.runInContext(script[1], ctx);
  }

  vm.runInContext(client, ctx);
  return window.rscStream;
}

async function streamToString(stream) {
  let result = '';
  for await (let chunk of stream.pipeThrough(new TextDecoderStream())) {
    result += chunk;
  }
  return result;
}

test('should handle text data', async () => {
  let html = testStream(['<html><body><h1>Test</h1>', '<p>Hello world</p></body></html>']);
  let rscStream = testStream(['foo bar', 'baz qux', 'abcdef']);
  let injected = html.pipeThrough(injectRSCPayload(rscStream));

  let result = await streamToString(injected);
  assert.equal(result, '<html><body><h1>Test</h1><p>Hello world</p><script>(self.__FLIGHT_DATA||=[]).push("foo bar")</script><script>(self.__FLIGHT_DATA||=[]).push("baz qux")</script><script>(self.__FLIGHT_DATA||=[]).push("abcdef")</script></body></html>');

  let clientStream = runScripts(result);
  let decoded = await streamToString(clientStream);
  assert.equal(decoded, 'foo barbaz quxabcdef');
});

test('should handle binary data', async () => {
  let html = testStream(['<html><body><h1>Test</h1>', '<p>Hello world</p></body></html>']);
  let rscStream = testStream(['foo bar', new Uint8Array([1, 2, 3, 4, 5, 0xe2, 0x28, 0xa1])]);
  let injected = html.pipeThrough(injectRSCPayload(rscStream));

  let result = await streamToString(injected);
  assert.equal(result, '<html><body><h1>Test</h1><p>Hello world</p><script>(self.__FLIGHT_DATA||=[]).push("foo bar")</script><script>(self.__FLIGHT_DATA||=[]).push(Uint8Array.from(atob("AQIDBAXiKKE="), m => m.codePointAt(0)))</script></body></html>');

  let clientStream = runScripts(result);
  let data = new Uint8Array(0);
  for await (let chunk of clientStream) {
    let resized = new Uint8Array(data.length + chunk.length);
    resized.set(data);
    resized.set(chunk, data.length);
    data = resized;
  }
  assert.deepEqual(data, new Uint8Array([
    102, 111, 111, 32, 98, 97,
    114,   1,   2,  3,  4,  5,
    226,  40, 161
  ]));
});

test('should handle chunked data', async () => {
  let resolve;
  let html = testStream(['<html><body><h1>Test</h1>', () =>  new Promise(r => setTimeout(r, 3)), '<p>Hello', () => resolve(), ' world</p></body></html>']);
  let rscStream = testStream(['foo bar', () => new Promise(r => resolve = r), 'baz qux', 'abcdef']);
  let injected = html.pipeThrough(injectRSCPayload(rscStream));

  let result = await streamToString(injected);
  assert.equal(result, '<html><body><h1>Test</h1><script>(self.__FLIGHT_DATA||=[]).push("foo bar")</script><script>(self.__FLIGHT_DATA||=[]).push("baz qux")</script><script>(self.__FLIGHT_DATA||=[]).push("abcdef")</script><p>Hello world</p></body></html>');

  let clientStream = runScripts(result);
  let decoded = await streamToString(clientStream);
  assert.equal(decoded, 'foo barbaz quxabcdef');
});

test('should support nonce', async () => {
  let html = testStream(['<html><body><h1>Test</h1>', '<p>Hello world</p></body></html>']);
  let rscStream = testStream(['foo bar']);
  let nonce = "test";
  let injected = html.pipeThrough(injectRSCPayload(rscStream, { nonce }));

  let result = await streamToString(injected);
  assert.equal(result, '<html><body><h1>Test</h1><p>Hello world</p><script nonce="test">(self.__FLIGHT_DATA||=[]).push("foo bar")</script></body></html>');

  let clientStream = runScripts(result, nonce);
  let decoded = await streamToString(clientStream);
  assert.equal(decoded, 'foo bar');
})

test('handle multi-byte character split into multiple html chunks', async () => {
  // new TextEncoder().encode("🙂") = [ 240, 159, 153, 130 ]
  const parts = [
    new Uint8Array([240]),
    new Uint8Array([159]),
    new Uint8Array([153, 130])
  ];
  // Simulate split by microtask. React SSR shouldn't split by macrotask and if that happens, the character can be garbled.
  let html = testStream(['<html><body><h1>Test</h1>', parts[0], parts[1], () => Promise.resolve(), parts[2], '<p>Hello world</p></body></html>']);
  let rscStream = testStream(['foo bar']);
  let injected = html.pipeThrough(injectRSCPayload(rscStream));

  let result = await streamToString(injected);
  assert.equal(result, '<html><body><h1>Test</h1>🙂<p>Hello world</p><script>(self.__FLIGHT_DATA||=[]).push("foo bar")</script></body></html>');

  let clientStream = runScripts(result);
  let decoded = await streamToString(clientStream);
  assert.equal(decoded, 'foo bar');
})
