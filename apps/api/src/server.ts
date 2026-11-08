// 서버를 켜는 파일. npm run dev:api 로 실행.
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';
import { loadReviewedFlows } from './flows';
import { createFakeIdentifier, createGeminiIdentifier } from './identifier';

const config = loadConfig();
const flows = loadReviewedFlows(config.flowsDir);
const identify =
  config.identifier === 'gemini' ? createGeminiIdentifier(config, flows) : createFakeIdentifier(flows);

serve({ fetch: createApp({ config, flows, identify }).fetch, port: config.port }, (info) => {
  console.log(
    JSON.stringify({
      event: 'listening',
      port: info.port,
      identifier: config.identifier,
      flows: [...flows.keys()],
      origins: config.allowedOrigins,
    }),
  );
});
