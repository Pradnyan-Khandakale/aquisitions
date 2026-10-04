import arcjet, { shield, detectBot, slidingWindow } from '@arcjet/node';

if (!process.env.ARCJET_KEY || process.env.ARCJET_KEY.trim() === '') {
  if (process.env.NODE_ENV === 'test') {
    process.env.ARCJET_KEY = 'ajkey_test_dummy_key';
  } else {
    console.error(
      'ARCJET_KEY is missing or empty. Please set the ARCJET_KEY environment variable.'
    );
    process.exit(1);
  }
}

// Trusted proxy networks (Docker bridge, private subnets, localhost)
const defaultProxies = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.1/8',
  '::1/128',
];

const proxies = process.env.ARCJET_PROXIES
  ? process.env.ARCJET_PROXIES.split(',').map(p => p.trim())
  : defaultProxies;

const aj = arcjet({
  key: process.env.ARCJET_KEY,
  proxies,
  rules: [
    shield({ mode: 'LIVE' }),
    detectBot({
      mode: 'LIVE',
      allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'],
    }),
    slidingWindow({
      mode: 'LIVE',
      interval: '2s',
      max: 5,
    }),
  ],
});

export default aj;
