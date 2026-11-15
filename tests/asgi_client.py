"""Exercise the real ASGI stack without opening a network socket."""
import asyncio
import json
from dataclasses import dataclass
from urllib.parse import unquote, urlsplit


@dataclass
class Response:
    status_code: int
    headers: dict
    content: bytes

    @property
    def text(self):
        return self.content.decode('utf-8')

    def json(self):
        return json.loads(self.content)


class ASGIClient:
    def __init__(self, app):
        self.app = app

    def get(self, url):
        return asyncio.run(self.request('GET', url))

    def post(self, url, *, json):
        return asyncio.run(self.request('POST', url, json))

    async def request(self, method, url, payload=None):
        target = urlsplit(url)
        body = json.dumps(payload).encode() if payload is not None else b''
        headers = [(b'content-type', b'application/json')] if payload is not None else []
        scope = {
            'type': 'http', 'asgi': {'version': '3.0', 'spec_version': '2.4'},
            'http_version': '1.1', 'scheme': 'http', 'method': method,
            'path': unquote(target.path), 'raw_path': target.path.encode(),
            'root_path': '', 'query_string': target.query.encode(),
            'headers': headers, 'client': ('test', 0), 'server': ('test', 80),
        }
        messages = []
        delivered = False

        async def receive():
            nonlocal delivered
            if delivered:
                await asyncio.Event().wait()
            delivered = True
            return {'type': 'http.request', 'body': body, 'more_body': False}

        async def send(message):
            messages.append(message)

        await self.app(scope, receive, send)
        start = messages[0]
        return Response(start['status'],
                        {key.decode(): value.decode('latin-1') for key, value in start['headers']},
                        b''.join(message.get('body', b'') for message in messages[1:]))
