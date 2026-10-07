/** Test helpers: register users and make authenticated requests. */
const request = require('supertest');

let counter = 0;

/** Registers a fresh user through the real API and returns { id, token, email }. */
async function registerUser(app, name = 'Test User') {
  counter += 1;
  const email = `user${counter}_${Date.now()}@example.com`;
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'Passw0rdOK' });
  if (res.status !== 201) throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.data.user._id, token: res.body.data.token, email };
}

/** supertest helpers that always send the Bearer token. */
function client(app, token) {
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    put: (url, body) => auth(request(app).put(url)).send(body),
    del: (url) => auth(request(app).delete(url)),
  };
}

module.exports = { registerUser, client };
