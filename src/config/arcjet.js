import arcjet, { shield, detectBot, slidingWindow } from '@arcjet/node';

if (!process.env.ARCJET_KEY || process.env.ARCJET_KEY.trim() === '') {
  console.error(
    'ARCJET_KEY is missing or empty. Please set the ARCJET_KEY environment variable.'
  );
  process.exit(1);
}

const aj = arcjet({
  key: process.env.ARCJET_KEY,
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
