import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = (__ENV.BASE_URL || '').replace(/\/$/, '');
const token = __ENV.AUTH_TOKEN || '';

if (!baseUrl) {
  throw new Error('Set BASE_URL to the staging API origin before running this test.');
}

export const options = {
  scenarios: {
    staged_read_only_ramp: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: __ENV.RAMP_1 || '2m', target: Number(__ENV.VUS_1 || 25) },
        { duration: __ENV.RAMP_2 || '3m', target: Number(__ENV.VUS_2 || 100) },
        { duration: __ENV.HOLD || '5m', target: Number(__ENV.VUS_2 || 100) },
        { duration: __ENV.COOLDOWN || '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000', 'p(99)<2500'],
  },
};

const headers = token ? { Authorization: `Bearer ${token}` } : {};
const paths = (__ENV.READ_PATHS || '/api/health,/api/health/ready')
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean);

export default function () {
  for (const path of paths) {
    const response = http.get(`${baseUrl}${path}`, {
      headers,
      tags: { endpoint: path },
      timeout: '15s',
    });
    check(response, {
      [`${path} returns 2xx`]: (res) => res.status >= 200 && res.status < 300,
    });
  }
  sleep(Number(__ENV.THINK_TIME || 2));
}
