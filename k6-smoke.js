import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = (__ENV.BASE_URL || '').replace(/\/$/, '');
const vus = Number(__ENV.K6_VUS || 3);
const duration = __ENV.K6_DURATION || '20s';

if (!baseUrl) throw new Error('Set BASE_URL explicitly; this script intentionally has no production default.');

export const options = {
  vus,
  duration,
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  const response = http.get(`${baseUrl}/api/health/ready`, { tags: { name: 'api-readiness' } });
  check(response, {
    'readiness responds successfully': (res) => res.status === 200,
    'readiness returns ready status': (res) => res.json('status') === 'ready',
  });
  sleep(1);
}
