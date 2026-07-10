import http from 'k6/http';
import { check, sleep } from 'k6';

// Configuration from Environment Variables
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const LOAD_TEST_SECRET = __ENV.LOAD_TEST_SECRET || 'secret';
const VUS = parseInt(__ENV.VUS || '20');

export const options = {
  stages: [
    { duration: '30s', target: VUS }, // Ramp up
    { duration: '1m', target: VUS },  // Steady state
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.01'],   // Error rate should be less than 1%
  },
};

export default function () {
  const headers = {
    'x-load-test-secret': LOAD_TEST_SECRET,
    'Accept': 'application/json',
  };

  // Scenario 1: Customer visits the landing page/menu
  let res = http.get(`${BASE_URL}/Trump/api/menu`, { headers });
  
  check(res, {
    'menu status is 200': (r) => r.status === 200,
  });

  // Simulated think time (between 1 and 3 seconds)
  sleep(Math.random() * 2 + 1);

  // Scenario 2: Chat recommendation check
  let chatPayload = JSON.stringify({
    message: "What do you recommend for a vegetarian?",
    context: {}
  });
  let chatRes = http.post(`${BASE_URL}/Trump/api/chat`, chatPayload, { 
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
  check(chatRes, {
    'chat status is 200': (r) => r.status === 200,
  });

  // Another think time pause
  sleep(Math.random() * 2 + 1);
}
