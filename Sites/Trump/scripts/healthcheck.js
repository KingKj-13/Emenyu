const port = process.env.TRUMP_PORT || process.env.PORT || 3012;
const baseUrl = process.env.TRUMP_HEALTHCHECK_URL || `http://127.0.0.1:${port}`;
const paths = ['/healthz', '/readyz'];

async function check(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' }
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${body}`);
  }

  return JSON.parse(body);
}

(async () => {
  for (const path of paths) {
    const result = await check(path);
    console.log(`${path}: ${result.status}`);
  }
})().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
