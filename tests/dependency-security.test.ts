import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mobileRequire = createRequire(resolve(process.cwd(), 'apps/mobile/package.json'));
const routerRequire = createRequire(mobileRequire.resolve('expo-router/package.json'));
const queryStringPath = routerRequire.resolve('query-string');
const queryString = routerRequire('query-string') as {
  parseUrl: (
    url: string,
    options?: { parseFragmentIdentifier: boolean },
  ) => {
    url: string;
    query: Record<string, string>;
    fragmentIdentifier?: string;
  };
};

describe('patched decoder in the actual Expo Router dependency graph', () => {
  it('preserves CommonJS loading, UTF-8, plus signs, and fragment decoding for shared links', () => {
    expect(
      queryString.parseUrl('happycircles://invite?name=Mar%C3%ADa+Paz&token=a%2Bb#open+invite', {
        parseFragmentIdentifier: true,
      }),
    ).toEqual({
      url: 'happycircles://invite',
      query: { name: 'María Paz', token: 'a+b' },
      fragmentIdentifier: 'open invite',
    });
  });

  it('bounds malformed percent decoding without hanging the test runner', () => {
    const result = execFileSync(
      process.execPath,
      [
        '-e',
        `
      const query = require(process.argv[1]);
      const input = '%FF'.repeat(10000) + '%41';
      const started = performance.now();
      const output = query.parse('token=' + input).token;
      const elapsedMs = performance.now() - started;
      if (output !== '%FF'.repeat(10000) + 'A') process.exit(2);
      process.stdout.write(JSON.stringify({ elapsedMs }));
    `,
        queryStringPath,
      ],
      { encoding: 'utf8', timeout: 5000 },
    );
    const timing = JSON.parse(result) as { elapsedMs: number };
    expect(timing.elapsedMs).toBeLessThan(1000);
  });
});
