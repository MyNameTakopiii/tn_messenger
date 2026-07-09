const JWT_SECRET = 'temm_tnmessenger';

function base64url(input) {
  return Utilities.base64EncodeWebSafe(input).replace(/=+$/, '');
}

function sign_jwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };

  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(payload));

  const signature = Utilities.computeHmacSha256Signature(
    `${encHeader}.${encPayload}`,
    JWT_SECRET
  );

  const encSignature = base64url(signature);

  return `${encHeader}.${encPayload}.${encSignature}`;
}
